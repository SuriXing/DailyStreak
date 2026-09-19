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
 *
 * 运行时的 toQuiz() 解析行为由 scripts/smoke-test.js 端到端覆盖，这里只管数据形状。
 *
 * 用法：npm run check:flashcards（退出码非 0 表示数据坏了）。
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECT_DECKS = ['csa', 'csp', 'precalc', 'calcbc', 'stats'];
const LEVELS = new Set(['core', 'advance', 'boundary']);
const LABELS = ['A', 'B', 'C', 'D'];
const LABEL_RE = /^[A-D]\.\s/;

const problems = [];
const counts = {};

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

/**
 * 生成文件里每张卡是一行 TS 对象字面量（键没有引号，所以不是合法 JSON）。
 * 这里用一个只认字符串边界的小扫描器给键补上引号，再做 JSON.parse：
 * 字符串内部的冒号不会被误判成键名。
 */
function toJson(line) {
  const src = line.trim().replace(/,$/, '');
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch) && /(?:^|[{,]\s*)$/.test(out)) {
      let end = i;
      while (end < src.length && /[A-Za-z0-9_$]/.test(src[end])) end += 1;
      let colon = end;
      while (colon < src.length && src[colon] === ' ') colon += 1;
      if (src[colon] === ':') {
        out += `"${src.slice(i, end)}"`;
        i = end - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** 生成文件里每张卡是一行对象字面量，解析成对象后逐张校验。 */
function parseCards(rel) {
  const src = read(rel);
  const declared = src.match(/\((\d+) cards\)/);
  const cards = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{ id: ')) continue;
    try {
      cards.push(JSON.parse(toJson(t)));
    } catch (e) {
      problems.push(`${rel}: 卡片行解析失败（${e.message}）: ${t.slice(0, 90)}`);
    }
  }
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
    .join(' ')}（共 ${total} 张，形状自洽；台账登记已复核 ${verifiedCount} 张）`,
);
