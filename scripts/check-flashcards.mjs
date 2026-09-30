#!/usr/bin/env node
/**
 * 闪卡数据完整性校验（precheck / CI 门禁）。
 *
 * src/data/amc10-flashcards.ts 与 src/data/subject-decks/*.ts 都是生成脚本的产物：
 * 源资料里一行一题，解析规则一旦回归，坏卡片会静默进仓库，只在 UI 里表现为"题目很奇怪"。
 * 所以这里把关键不变量固化成可执行检查：
 *   1. 文件头声明的卡片数 = 实际卡片行数（防止半截提交或手工改数据）。
 *   2. id 全局唯一、卡组键与文件对应、category 非空。
 *   3. 选择题卡：题干若干行 + 恰好 A./B./C./D. 四行选项，选项文本非空、
 *      没有残留标签（历史上的 "A. A. 3"），back 里的"答案：X"在范围内，
 *      且"正确选项：…"与该字母指向的选项文本一致。
 *   4. 概念卡（AMC10）：level 属于 core/advance/boundary，且不应出现选项行。
 *   5. 来源同步：把两个生成器重建到临时目录，与提交的产物逐字比对（改源忘重建会被抓出）。
 *   6. 英文覆盖层：条目必须与中文卡结构等价（选项字母、答案字母、Correct option 文本、无残留中文、无孤立 id）。
 *   7. 题干重复：归一化后同一题干出现在两张卡上即失败（复制粘贴式重复）。
 *
 * 运行时的 toQuiz() 解析行为由 scripts/smoke-test.js 端到端覆盖，这里只管数据形状。
 *
 * 用法：npm run check:flashcards（退出码非 0 表示数据坏了）。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SUBJECT_DECKS as SCENARIO_DECKS, readCards } from './lib/deck-cards.mjs';
import { buildPack, renderPackModule } from './pack-decks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECT_DECKS = SCENARIO_DECKS;
const LEVELS = new Set(['core', 'advance', 'boundary']);
const LABELS = ['A', 'B', 'C', 'D'];
const LABEL_RE = /^[A-D]\.\s/;

const problems = [];
const counts = {};
const ALL_CARDS = [];

/** 复核台账：id → 复核时正文的短哈希。 */
const LEDGER = JSON.parse(readFileSync(path.join(root, 'scripts/flashcard-verification.json'), 'utf8'));
const VERIFIED_HASHES = LEDGER.cards || {};
const hashOf = (front, back) =>
  createHash('sha1').update(`${front}\u0000${back}`).digest('hex').slice(0, 12);

/** 题干引用“上题/上式/上述”时必须带内联的承接行，否则卡片在 app 里没法作答。 */
const REFERS_BACK = /上题|上式|上述|前一题/;
const CONTEXT_PREFIX = '【承接上题】';
const seenIds = new Set();

const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

/** 读出每张卡（解析交给 scripts/lib/deck-cards.mjs，与打包器共用同一套）。 */
function parseCards(rel) {
  const src = read(rel);
  const declared = src.match(/\((\d+) cards\)/);
  const cards = readCards(path.join(root, rel));
  if (!declared) problems.push(`${rel}: 文件头缺少 "(N cards)" 声明`);
  else if (Number(declared[1]) !== cards.length) {
    problems.push(`${rel}: 文件头声明 ${declared[1]} 张，实际 ${cards.length} 张`);
  }
  return cards;
}

/** 题干（第一个选项行之前）——依赖标记只在这里才算数。 */
function stemOf(card) {
  const lines = card.front.split('\n');
  const first = lines.findIndex((l) => /^A\.\s/.test(l));
  return (first < 0 ? lines : lines.slice(0, first)).join('\n');
}

function checkBackReference(rel, card) {
  if (REFERS_BACK.test(stemOf(card)) && !card.front.startsWith(CONTEXT_PREFIX)) {
    problems.push(`${rel}/${card.id}: 题干引用上一题，但没有 ${CONTEXT_PREFIX} 承接行`);
  }
}

/**
 * id 必须连续且等于源题号（deck-001…deck-120）：一旦缺号就说明有源题被丢弃，
 * 历史上正是因为每 20 题丢 1 道，18 道题从未进入 app。
 */
function checkIdSequence(rel, prefix, cards, width = 3) {
  for (let i = 0; i < cards.length; i += 1) {
    const expected = `${prefix}-${String(i + 1).padStart(width, '0')}`;
    if (cards[i].id !== expected) {
      problems.push(`${rel}: 第 ${i + 1} 张的 id 是 ${cards[i].id}，应为 ${expected}（中间有源题缺号）`);
      return;
    }
  }
}

function checkIdAndCategory(rel, card) {
  if (seenIds.has(card.id)) problems.push(`重复 id: ${card.id}`);
  seenIds.add(card.id);
  if (!card.category) problems.push(`${rel}/${card.id}: category 为空`);
  if (!card.front || !card.back) problems.push(`${rel}/${card.id}: front/back 为空`);
}

/** 选择题卡：题干若干行 + 恰好四行带标签的选项 + 可解析且自洽的答案。 */
function checkSubjectCard(rel, card) {
  const lines = card.front.split('\n');
  const first = lines.findIndex((l) => LABEL_RE.test(l));
  if (first < 1) {
    problems.push(`${rel}/${card.id}: 找不到 "A. " 选项行（选项块前至少要有 1 行题干）`);
    return;
  }
  const stem = lines.slice(0, first).join('\n').trim();
  if (!stem) problems.push(`${rel}/${card.id}: 题干为空`);
  const options = lines.slice(first).map((l) => l.trim().replace(/^[A-D]\.\s*/, '').trim());
  if (options.length !== 4) {
    problems.push(`${rel}/${card.id}: 选项 ${options.length} 个（应为 4）`);
    return;
  }
  for (const [i, opt] of options.entries()) {
    if (!opt) problems.push(`${rel}/${card.id}: 选项 ${LABELS[i]} 为空`);
    else if (LABEL_RE.test(opt)) {
      problems.push(`${rel}/${card.id}: 选项 ${LABELS[i]} 残留标签 "${opt.slice(0, 24)}"`);
    }
  }
  const answer = card.back.match(/答案：([A-D])/);
  if (!answer) {
    problems.push(`${rel}/${card.id}: back 缺少 "答案：X"`);
    return;
  }
  const answerIndex = answer[1].charCodeAt(0) - 65;
  const correct = card.back.match(/正确选项：([^\n]*)/);
  if (!correct) problems.push(`${rel}/${card.id}: back 缺少 "正确选项：…"`);
  else if (correct[1].trim() !== options[answerIndex]) {
    problems.push(
      `${rel}/${card.id}: 答案 ${answer[1]} 指向 "${options[answerIndex]}"，` +
        `但"正确选项"写的是 "${correct[1].trim()}"`,
    );
  }
}

/**
 * 生成文件里的字面量类型必须和 app 侧的 FlashcardSource 联合一致，
 * 否则界面上的来源标注会静默落到错误的分支。
 */
function checkSourceUnion() {
  const src = read('src/data/flashcards.ts');
  const union = src.match(/export type FlashcardSource = ([^;]+);/);
  if (!union) {
    problems.push('src/data/flashcards.ts: 找不到 FlashcardSource 联合类型');
    return;
  }
  for (const literal of ['amc10-concept', 'ai-mcq']) {
    if (!union[1].includes(`'${literal}'`)) {
      problems.push(`src/data/flashcards.ts: FlashcardSource 缺少字面量 '${literal}'`);
    }
  }
}

/**
 * 来源必须正确；verified 必须等于"台账里的哈希与当前正文对得上"，
 * 这样手改 verified、或者改了正文忘了复核，都会被抓出来。
 */
/**
 * bundle 里只该有压缩块：一旦有人把明文卡组模块 import 回 app，
 * 体积优势与"不再是可 grep 的明文"这两个收益就都没了。
 */
function checkNoPlainDeckImport() {
  const pattern = /from '(?:@\/data\/(?:amc10-flashcards|subject-decks)|(?:\.\.?\/)+(?:amc10-flashcards|subject-decks))'/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && pattern.test(read(rel))) offenders.push(rel);
    }
  };
  for (const dir of ['src/app', 'src/components', 'src/hooks', 'src/lib', 'src/contexts']) {
    try {
      walk(dir);
    } catch {
      // 目录不存在就跳过
    }
  }
  if (pattern.test(read('src/data/flashcards.ts'))) offenders.push('src/data/flashcards.ts');
  if (offenders.length) {
    problems.push(`这些文件 import 了明文卡组模块（bundle 应当只用压缩块）: ${offenders.join(', ')}`);
  }
}

/**
 * 答案位置分布必须均衡：真实出题人会打散，而批量生成的题库很容易挤在一个字母上，
 * 那样学生不解题也能拿高分（曾出现 B=50%、D=2.8%）。每个卡组每个字母 25%±10%。
 */
function checkAnswerPositions() {
  const perDeck = {};
  for (const card of ALL_CARDS) {
    const m = card.back.match(/答案：([A-D])/);
    if (!m) continue;
    const deck = card.id.replace(/-\d+$/, '');
    perDeck[deck] = perDeck[deck] || { A: 0, B: 0, C: 0, D: 0, total: 0 };
    perDeck[deck][m[1]] += 1;
    perDeck[deck].total += 1;
  }
  for (const [deck, c] of Object.entries(perDeck)) {
    if (c.total < 40) continue;
    for (const letter of ['A', 'B', 'C', 'D']) {
      const pct = (c[letter] / c.total) * 100;
      if (Math.abs(pct - 25) > 10) {
        problems.push(
          `${deck}: 答案 ${letter} 占 ${pct.toFixed(0)}%（应接近 25%）→ 需要重新轮转选项`,
        );
      }
    }
  }
}

/**
 * 选项长度不能泄露答案：改前全库 41% 的题里正确项就是最长的那一项（CSP 55%、Stats 49%），
 * 学生不看题、只挑最长就能拿 41 分（随机是 25%）。现在 33%，理想是 25–30%。
 */
/**
 * "正确项=最长"的比例上限。这里的"最长"按 indexOf(max) 判定，即并列时算在
 * 最靠前的那一项头上，所以数值比"严格最长"口径更高：清理后实测每卡组 28–36%、
 * 全库 26%，换成严格口径则是每卡组 13–28%、全库 20%；情境卡组两种口径都是 0%。
 * 阈值收紧到 40%/30% 是为了在重新生成或批量改题时更早发现长度又变成信号。
 */
const MAX_LONGEST_RATE_PER_DECK = 0.4;
const MAX_LONGEST_RATE_OVERALL = 0.3;

function checkOptionLengthBias() {
  const perDeck = {};
  let hit = 0;
  let total = 0;
  for (const card of ALL_CARDS) {
    const opts = card.front
      .split('\n')
      .filter((l) => /^[A-D]\.\s/.test(l))
      .map((l) => l.replace(/^[A-D]\.\s*/, ''));
    const m = card.back.match(/答案：([A-D])/);
    if (opts.length !== 4 || !m) continue;
    const idx = m[1].charCodeAt(0) - 65;
    const lens = opts.map((o) => o.length);
    const deck = card.id.replace(/-\d+$/, '');
    perDeck[deck] = perDeck[deck] || { hit: 0, total: 0 };
    perDeck[deck].total += 1;
    total += 1;
    if (lens.indexOf(Math.max(...lens)) === idx) {
      perDeck[deck].hit += 1;
      hit += 1;
    }
  }
  for (const [deck, c] of Object.entries(perDeck)) {
    if (c.total < 40) continue;
    const pct = (c.hit / c.total) * 100;
    if (pct > MAX_LONGEST_RATE_PER_DECK * 100) {
      problems.push(
        `${deck}: 正确项是最长选项的比例 ${pct.toFixed(0)}%（上限 ${MAX_LONGEST_RATE_PER_DECK * 100}%）→ 长度在泄露答案`,
      );
    }
  }
  if (total) {
    const overall = (hit / total) * 100;
    if (overall > MAX_LONGEST_RATE_OVERALL * 100) {
      problems.push(
        `全库"正确项=最长"比例 ${overall.toFixed(1)}%（上限 ${MAX_LONGEST_RATE_OVERALL * 100}%）→ 继续均衡选项长度`,
      );
    }
  }
}

/**
 * 情境题卡组不能是"换了个标签的单步题"：题量要够，而且绝大多数题干必须带刺激材料
 * （多行，或足够长的情境描述）。真正的难度爬坡需要逐题难度标签，这里只挡住最粗的退化。
 */
const SCENARIO_MIN_ITEMS = 20;
// 阈值按真实数据校准：现有练习册的题干中位数 11–28 字（56%–97% 短于 30 字），
// 而情境题是 43–170 字（0%–20% 短于 30 字）。所以这条门禁能挡住"用单步题充数"。
const SCENARIO_MIN_STIMULUS_RATIO = 0.75;
const SCENARIO_STEM_CHARS = 30;

function checkScenarioDecks() {
  for (const card of ALL_CARDS) {
    const deck = card.id.replace(/-\d+$/, '');
    if (!deck.endsWith('-scenario')) continue;
    const stem = stemOf(card);
    const hasStimulus = stem.includes('\n') || stem.length >= SCENARIO_STEM_CHARS;
    checkScenarioDecks.acc = checkScenarioDecks.acc || {};
    const acc = (checkScenarioDecks.acc[deck] = checkScenarioDecks.acc[deck] || { n: 0, stim: 0 });
    acc.n += 1;
    if (hasStimulus) acc.stim += 1;
  }
  for (const [deck, acc] of Object.entries(checkScenarioDecks.acc || {})) {
    if (acc.n < SCENARIO_MIN_ITEMS) {
      problems.push(`${deck}: 情境题只有 ${acc.n} 道（至少 ${SCENARIO_MIN_ITEMS} 道）`);
    }
    const ratio = acc.stim / acc.n;
    if (ratio < SCENARIO_MIN_STIMULUS_RATIO) {
      problems.push(
        `${deck}: 只有 ${(ratio * 100).toFixed(0)}% 的题干带刺激材料（要求 ≥${SCENARIO_MIN_STIMULUS_RATIO * 100}%）→ ` +
          `情境卡组不该塞单步题`,
      );
    }
  }
}

function checkProvenance(rel, card, expected) {
  if (card.source !== expected) {
    problems.push(`${rel}/${card.id}: source 应为 "${expected}"，实际 ${JSON.stringify(card.source)}`);
  }
  const shouldBeVerified = VERIFIED_HASHES[card.id] === hashOf(card.front, card.back);
  if (card.verified !== shouldBeVerified) {
    problems.push(
      `${rel}/${card.id}: verified=${JSON.stringify(card.verified)}，` +
        `但台账哈希${shouldBeVerified ? '对得上' : '对不上（正文改过？）'}`,
    );
  }
}

/** 概念卡：AMC10 卡组，靠翻面复习，不应混进选项块。 */
function checkConceptCard(rel, card) {
  if (card.front.split('\n').some((l) => LABEL_RE.test(l))) {
    problems.push(`${rel}/${card.id}: 概念卡不应带选项行`);
  }
  if (!LEVELS.has(card.level)) {
    problems.push(`${rel}/${card.id}: level "${card.level}" 不在 core/advance/boundary`);
  }
}

const AMC10_REL = 'src/data/amc10-flashcards.ts';
const amc10 = parseCards(AMC10_REL);
counts.amc10 = amc10.length;
checkIdSequence(AMC10_REL, 'amc10', amc10, 4);
for (const card of amc10) {
  checkIdAndCategory(AMC10_REL, card);
  checkConceptCard(AMC10_REL, card);
  checkBackReference(AMC10_REL, card);
  checkProvenance(AMC10_REL, card, 'amc10-concept');
}

for (const deck of SUBJECT_DECKS) {
  const rel = `src/data/subject-decks/${deck}.ts`;
  const cards = parseCards(rel);
  counts[deck] = cards.length;
  ALL_CARDS.push(...cards);
  checkIdSequence(rel, deck, cards);
  for (const card of cards) {
    checkIdAndCategory(rel, card);
    if (card.deck !== deck) problems.push(`${rel}/${card.id}: deck 字段是 "${card.deck}"`);
    checkSubjectCard(rel, card);
    checkProvenance(rel, card, 'ai-mcq');
    checkBackReference(rel, card);
  }
}

checkSourceUnion();
checkAnswerPositions();
checkOptionLengthBias();
checkScenarioDecks();

// 卡组数据与 bundle 里的压缩块必须同步：改过卡片就要重跑打包
if (read('src/data/deck-pack.ts') !== renderPackModule(buildPack(root))) {
  problems.push('src/data/deck-pack.ts 与卡组数据不同步 → 运行 npm run pack:decks');
}

checkNoPlainDeckImport();

/**
 * 英文覆盖层不能只"有"条目，还必须与中文版结构等价：同样的四个选项字母、
 * 同样的答案字母，back 结尾声明的正确选项要与该字母的选项文本逐字一致。
 * 覆盖层腐烂的典型方式是中文改了选项、英文没改，UI 里就会出现自相矛盾的卡片。
 */
const OVERLAY_FILES = [
  'src/data/flashcard-i18n.ts',
  'src/data/flashcard-i18n-drill.ts',
  'src/data/flashcard-i18n-scenario.ts',
];

/** 覆盖层条目都是单行对象字面量；仓库里两种引号风格都存在，这里都接受。 */
function parseOverlay(rel) {
  const out = new Map();
  const patterns = [
    /^\s*'([^']+)':\s*\{\s*front:\s*'((?:\\.|[^'\\])*)',\s*back:\s*'((?:\\.|[^'\\])*)'\s*\},?\s*$/,
    /^\s*"([^"]+)":\s*\{\s*front:\s*"((?:\\.|[^"\\])*)",\s*back:\s*"((?:\\.|[^"\\])*)"\s*\},?\s*$/,
  ];
  for (const raw of read(rel).split('\n')) {
    for (const line of patterns) {
      const m = raw.match(line);
      if (!m) continue;
      const un = (t) => t.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      out.set(m[1], { front: un(m[2]), back: un(m[3]) });
      break;
    }
  }
  return out;
}


/**
 * 同一道题不该在两个卡组里各出现一次。复制粘贴、或把情境题改写后忘了删原件，
 * 都会让题库看起来更大而实际更小；只比较题干（选项之前的正文），
 * 因为同一题干配不同选项同样属于重复题。
 */
function checkDuplicateItems() {
  const byStem = new Map();
  for (const card of [...amc10, ...ALL_CARDS]) {
    const stemOnly = card.front.split('\n').filter((l) => !/^[A-D]\. /.test(l)).join('\n');
    const norm = stemOnly
      .replace(/【承接上题】[^\n]*/, '')
      .replace(/\s+/g, '')
      .replace(/[，。、？；：（）()【】「」《》,.?!:;'"`]/g, '')
      .toLowerCase();
    if (norm.length < 8) continue;
    const key = norm.slice(0, 80);
    const list = byStem.get(key) || [];
    list.push(card.id);
    byStem.set(key, list);
  }
  for (const [key, ids] of byStem) {
    if (ids.length > 1) {
      problems.push(`题干重复：${ids.join(' / ')}（归一化后前 40 字：${key.slice(0, 40)}）`);
    }
  }
}

function checkFlashcardOverlay() {
  const overlay = new Map();
  for (const rel of OVERLAY_FILES) {
    for (const [id, entry] of parseOverlay(rel)) {
      if (overlay.has(id)) problems.push(`${rel}/${id}: 覆盖层里重复定义`);
      overlay.set(id, entry);
    }
  }
  const optionLines = (s) => s.split('\n').filter((l) => /^[A-D]\. /.test(l));
  let covered = 0;
  void covered;
  for (const card of ALL_CARDS) {
    const en = overlay.get(card.id);
    const isScenario = card.deck.endsWith('-scenario');
    if (!en) {
      if (isScenario) problems.push(`${card.id}: 情境题缺少英文覆盖（情境卡组要求全英文）`);
      continue;
    }
    covered += 1;
    const zhOpts = optionLines(card.front);
    const enOpts = optionLines(en.front);
    if (zhOpts.length === 4) {
      if (enOpts.length !== 4) {
        problems.push(`${card.id}: 英文覆盖有 ${enOpts.length} 个选项（中文有 4 个）`);
      } else if (enOpts.map((l) => l[0]).join('') !== 'ABCD') {
        problems.push(`${card.id}: 英文选项字母不是 A/B/C/D`);
      } else {
        const ans = card.back.match(/答案：([A-D])/);
        const enAns = en.back.match(/^Answer:\s*([A-D])/m);
        if (!ans) {
          problems.push(`${card.id}: 中文卡里没有"答案：X"`);
        } else if (!enAns || enAns[1] !== ans[1]) {
          problems.push(`${card.id}: 英文答案 ${enAns ? enAns[1] : '缺失'} 与中文 ${ans[1]} 不一致`);
        } else {
          const declared = en.back.match(/\n\nCorrect option:\s*([\s\S]+)$/);
          const want = enOpts[ans[1].charCodeAt(0) - 65].replace(/^[A-D]\. /, '').trim();
          if (!declared) problems.push(`${card.id}: 英文覆盖缺少 "Correct option:" 结尾`);
          else if (declared[1].trim() !== want) {
            problems.push(
              `${card.id}: 英文 "Correct option" 与选项文本不一致\n      选项: ${want}\n      声明: ${declared[1].trim()}`,
            );
          }
        }
      }
    }
    if (/[\u4e00-\u9fff]/.test(en.front) || /[\u4e00-\u9fff]/.test(en.back)) {
      problems.push(`${card.id}: 英文覆盖里还有中文`);
    }
  }
  for (const id of overlay.keys()) {
    if (!seenIds.has(id)) problems.push(`${OVERLAY_FILES.join('/')}: ${id} 不是任何卡片的 id（孤立条目）`);
  }
  const everyCard = [...amc10, ...ALL_CARDS];
  const coveredEvery = everyCard.filter((c) => overlay.has(c.id)).length;
  overlayStats = {
    covered: coveredEvery,
    total: everyCard.length,
    scenario: ALL_CARDS.filter((c) => c.deck.endsWith('-scenario')).length,
  };
}
let overlayStats = { covered: 0, total: 0, scenario: 0 };

checkFlashcardOverlay();
checkDuplicateItems();
checkDeckSourceSync();

/**
 * content/ 是源、src/data/*.ts 是产物：只在源里改题、忘了重跑生成脚本，
 * 仓库会同时存在两份互相矛盾的题目（UI 用的是产物），而所有形状检查都照样通过。
 * 所以这里把两个生成器重建到临时目录，与提交的产物逐字比对。
 */
function checkDeckSourceSync() {
  const dir = mkdtempSync(path.join(tmpdir(), 'deck-sync-'));
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/build-subject-decks.js')], {
      env: { ...process.env, SUBJECT_DECKS_OUT: dir },
      stdio: 'pipe',
    });
    execFileSync(process.execPath, [path.join(root, 'scripts/build-amc10-flashcards.js')], {
      env: { ...process.env, AMC10_CARDS_OUT: path.join(dir, 'amc10-flashcards.ts') },
      stdio: 'pipe',
    });
    const pairs = [
      ['src/data/amc10-flashcards.ts', path.join(dir, 'amc10-flashcards.ts')],
      ...SUBJECT_DECKS.map((d) => [`src/data/subject-decks/${d}.ts`, path.join(dir, `${d}.ts`)]),
    ];
    const stale = pairs.filter(([rel, tmp]) => read(rel) !== readFileSync(tmp, 'utf8'));
    if (stale.length) {
      problems.push(
        `${stale.length} 个卡组文件与 content/ 源不同步（${stale.map(([r]) => r).join(', ')}）→ 改过源资料就要重跑生成脚本`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
{
  const unknown = Object.keys(VERIFIED_HASHES).filter((id) => !seenIds.has(id));
  if (unknown.length) {
    problems.push(
      `scripts/flashcard-verification.json: ${unknown.length} 个 id 不在任何卡组里 → ${unknown.slice(0, 5).join(', ')}`,
    );
  }
}
const verifiedCount = Object.keys(VERIFIED_HASHES).length;

if (problems.length) {
  console.error(`❌ 闪卡数据校验失败（${problems.length} 处）:`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  …另有 ${problems.length - 40} 处`);
  process.exit(1);
}

console.log(
  `✅ 闪卡数据校验通过: ${Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')}（共 ${total} 张，形状自洽；台账登记已复核 ${verifiedCount} 张；英文覆盖 ${
    overlayStats.covered
  }/${overlayStats.total}（情境题 ${overlayStats.scenario} 张要求全覆盖）；bundle 压缩块 ${
    (read('src/data/deck-pack.ts').length / 1024).toFixed(0)
  } KB 已同步）`,
);
