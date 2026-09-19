/* global __dirname */
/**
 * One-off builder: parse AP subject MCQ question banks + answer keys into
 * self-contained flashcard-deck TS data modules. Supports two source formats:
 *  - 'dot':   "1. Q? A. opt B. opt C. opt D. opt" + markdown table answer (CSA/CSP)
 *  - 'space': "1. Q? A v B v C v D v" + "N LETTER（brief）; ..." answer (Precalc/Calc/Stats)
 *
 * Usage: node scripts/build-subject-decks.js <baseDir>
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const BASE = process.argv[2] || path.join(home, 'Downloads', 'AP-AMC学习资料-2026-27');
const OUTDIR = path.join(__dirname, '..', 'src', 'data', 'subject-decks');
const VERIFICATION = path.join(__dirname, 'flashcard-verification.json');

const SUBJECTS = [
  {
    key: 'csa',
    label: 'AP CSA · 选择题',
    style: 'dot',
    mcq: ['AP-CSA-CSP-知识点与题库/07-CSA原创选择题-1.md', 'AP-CSA-CSP-知识点与题库/08-CSA原创选择题-2.md'],
    ans: ['AP-CSA-CSP-知识点与题库/09-CSA选择题答案.md'],
  },
  {
    key: 'csp',
    label: 'AP CSP · 选择题',
    style: 'dot',
    mcq: ['AP-CSA-CSP-知识点与题库/12-CSP原创选择题-1.md', 'AP-CSA-CSP-知识点与题库/13-CSP原创选择题-2.md'],
    ans: ['AP-CSA-CSP-知识点与题库/14-CSP选择题答案.md'],
  },
  {
    key: 'precalc',
    label: 'AP Precalc · 选择题',
    style: 'space',
    mcq: ['AP-Precalculus-Calculus-BC-Statistics-知识点与题库/05-Precalculus原创选择题-1.md', 'AP-Precalculus-Calculus-BC-Statistics-知识点与题库/06-Precalculus原创选择题-2.md'],
    ans: ['AP-Precalculus-Calculus-BC-Statistics-知识点与题库/07-Precalculus选择题答案.md'],
  },
  {
    key: 'calcbc',
    label: 'AP Calc BC · 选择题',
    style: 'space',
    mcq: ['AP-Precalculus-Calculus-BC-Statistics-知识点与题库/15-CalculusBC原创选择题-1.md', 'AP-Precalculus-Calculus-BC-Statistics-知识点与题库/16-CalculusBC原创选择题-2.md'],
    ans: ['AP-Precalculus-Calculus-BC-Statistics-知识点与题库/17-CalculusBC选择题答案.md'],
  },
  {
    key: 'stats',
    label: 'AP Stats · 选择题',
    style: 'space',
    mcq: ['AP-Precalculus-Calculus-BC-Statistics-知识点与题库/24-Statistics原创选择题-1.md', 'AP-Precalculus-Calculus-BC-Statistics-知识点与题库/25-Statistics原创选择题-2.md'],
    ans: ['AP-Precalculus-Calculus-BC-Statistics-知识点与题库/26-Statistics选择题答案.md'],
  },
];

function clean(s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<code>/gi, '')
    .replace(/<\/code>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/`/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 选项文本统一剥掉残留的 "A. " 前缀。
 * 切分出的第一段带前导空格，必须先 trim 再剥标签，否则 "A. 3" 会被当成选项文本，
 * 在 UI 里渲染成 "A. A. 3"（CSA/CSP 全部 240 张卡都踩过这个坑）。
 */
function stripOptionLabel(s) {
  return s.trim().replace(/^[A-D]\.\s*/, '');
}

/* ---------- 'dot' style (CSA/CSP): "1. Q? A. a B. b C. c D. d" + table answer ---------- */
function parseDotMcq(line) {
  const t = line.trim();
  if (!/^\d+\./.test(t)) return null;
  const idx = t.search(/\sA\.\s/);
  if (idx < 0) return null;
  const stem = t.slice(0, idx).trim();
  const opts = t.slice(idx).split(/\s(?=[BCD]\.\s)/).map(stripOptionLabel);
  if (opts.length < 2) return null;
  return { num: parseInt(t.match(/^(\d+)/)[1], 10), stem, options: opts };
}
function parseDotAnswer(text) {
  const map = {};
  for (const line of text.split('\n')) {
    const c = line.trim().match(/^\|\s*(\d+)\s*\|\s*([A-D])\s*\|\s*(.*?)\s*\|$/);
    if (c) map[parseInt(c[1], 10)] = { letter: c[2], brief: c[3].trim() };
  }
  return map;
}

/* ---------- 'space' style (math): "1. Q? A a B b C c D d" + "N LETTER（brief）; ..." ---------- */
function parseSpaceMcq(line) {
  const t = line.trim();
  if (!/^\d+\./.test(t)) return null;
  const idx = t.search(/\sA\s/);
  if (idx < 0) return null;
  const stem = t.slice(0, idx).trim();
  const rest = t.slice(idx).trim();
  const m = rest.match(/^A\s+(.+?)\s+B\s+(.+?)\s+C\s+(.+?)\s+D\s+(.+)$/);
  if (!m) return null;
  return { num: parseInt(t.match(/^(\d+)/)[1], 10), stem, options: m.slice(1).map(stripOptionLabel) };
}
function parseSpaceAnswer(text) {
  const map = {};
  // entries: "N LETTER（brief）; " —— 逐行切分。
  // 旧实现先把全文拼成一行再按 ; 。 切分，并用 ^(\d+) 从头锚定：
  // 块标题（## 1–20）会和该块第一个答案黏成同一条 entry，从头匹配失败后整条被丢，
  // 于是每 20 题的第一题答案消失（18 道题因此从未进入 app）。
  // 现在允许 entry 前带非数字前缀，块标题再也吞不掉答案。
  for (const line of text.split('\n')) {
    for (const entry of line.split(/[;。]/)) {
      const m = entry.trim().match(/(?:^|[^\d])(\d+)\s*([A-D])(?:（([^）]*)）)?/);
      if (m) map[parseInt(m[1], 10)] = { letter: m[2], brief: (m[3] || '').trim() };
    }
  }
  return map;
}

/**
 * 题干里的“上题/上式/上述”说明这道题依赖上一题。卡片在 app 里是单张展示的
 * （自由练还默认乱序），所以生成时把上一题的题干作为承接行内联进来，
 * 否则这张卡根本没条件作答——审计里 19 张卡就是这样失效的。
 */
const REFERS_BACK = /上题|上式|上述|前一题/;
const CONTEXT_PREFIX = '【承接上题】';

/**
 * 复核台账（id → 复核时正文的短哈希）。只有哈希对得上才算 verified，
 * 所以改过正文的卡会自动回到未核验，必须重新复核后更新台账。
 */
function verifiedHashes() {
  if (!fs.existsSync(VERIFICATION)) return {};
  return JSON.parse(fs.readFileSync(VERIFICATION, 'utf8')).cards || {};
}

/** 与台账生成脚本一致：sha1(front + NUL + back) 前 12 位。 */
function hashOf(front, back) {
  return crypto.createHash('sha1').update(`${front}\u0000${back}`).digest('hex').slice(0, 12);
}

function buildDeck(cfg) {
  const hashes = verifiedHashes();
  const answerMap = {};
  for (const af of cfg.ans) {
    const text = fs.readFileSync(path.join(BASE, af), 'utf8');
    Object.assign(answerMap, cfg.style === 'dot' ? parseDotAnswer(text) : parseSpaceAnswer(text));
  }
  const parse = cfg.style === 'dot' ? parseDotMcq : parseSpaceMcq;
  const cards = [];
  const unanswered = [];
  const unparsed = [];
  let n = 0;
  let prevStem = '';
  for (const mf of cfg.mcq) {
    prevStem = '';   // 承接只看同一份文件内的上一题
    for (const line of fs.readFileSync(path.join(BASE, mf), 'utf8').split('\n')) {
      const q = parse(line);
      if (!q) {
        // 只记“看起来是编号题但解析不出来”的行，普通标题/正文不算
        if (/^\d+\.\s/.test(line.trim())) unparsed.push(line.trim().slice(0, 60));
        continue;
      }
      const rawStem = q.stem.replace(/^\d+\.\s*/, '');
      const context = REFERS_BACK.test(rawStem) && prevStem ? `${CONTEXT_PREFIX}${prevStem}\n` : '';
      prevStem = rawStem;
      const ans = answerMap[q.num];
      if (!ans) {
        unanswered.push(q.num);
        continue;
      }
      n += 1;
      const letterIdx = ans.letter.charCodeAt(0) - 65;
      const front = `${context}${rawStem}\nA. ${q.options[0] || ''}\nB. ${q.options[1] || ''}\nC. ${q.options[2] || ''}\nD. ${q.options[3] || ''}`;
      const correct = q.options[letterIdx] || ans.letter;
      const back = `答案：${ans.letter}\n${ans.brief ? '简析：' + ans.brief : ''}\n\n正确选项：${correct}`;
      const cardId = `${cfg.key}-${String(q.num).padStart(3, '0')}`;
      const frontClean = clean(front);
      const backClean = clean(back).replace(/\n{3,}/g, '\n\n');
      cards.push({
        // id 用源题号：卡号与题库题号一一对应，将来补回缺题也不会让后面的卡片整体改号。
        id: cardId,
        deck: cfg.key,
        category: cfg.label.replace(' · 选择题', ''),
        front: frontClean,
        back: backClean,
        source: 'ai-mcq',
        verified: hashes[cardId] === hashOf(frontClean, backClean),
      });
    }
  }
  // 源题必须一道不落地变成卡片：缺答案或编号行解析不出来就直接失败。
  // 静默跳过正是“18 道题从未进入 app”的成因，这里不给它留后门。
  const dropped = [
    ...unanswered.map((num) => `第 ${num} 题找不到答案`),
    ...unparsed.map((text) => `解析不出题目: ${text}`),
  ];
  if (dropped.length) {
    throw new Error(`${cfg.key}: ${dropped.length} 处源题会被丢弃 —— ${dropped.join('；')}`);
  }

  return { key: cfg.key, label: cfg.label, cards };
}

// 台账里写错的 id 不能静默失效
{
  const known = new Set(SUBJECTS.flatMap((cfg) => buildDeck(cfg).cards.map((c) => c.id)));
  const unknown = Object.keys(verifiedHashes()).filter((id) => !id.startsWith('amc10-') && !known.has(id));
  if (unknown.length) {
    console.error(`❌ ${VERIFICATION} 里有 ${unknown.length} 个 id 不在卡组里: ${unknown.slice(0, 5).join(', ')}`);
    process.exit(1);
  }
}

fs.mkdirSync(OUTDIR, { recursive: true });
const q = JSON.stringify.bind(JSON);
const generated = [];
for (const cfg of SUBJECTS) {
  const { key, label, cards } = buildDeck(cfg);
  const cardLines = cards
    .map((c) => `  { id: ${q(c.id)}, deck: ${q(c.deck)}, category: ${q(c.category)}, front: ${q(c.front)}, back: ${q(c.back)}, source: ${q(c.source)}, verified: ${c.verified} },`)
    .join('\n');
  const ts = `// AUTO-GENERATED from the ${label} materials (${cards.length} cards). Do not hand-edit.
// Regenerate: node scripts/build-subject-decks.js
export type SubjectDeckKey = '${key}';

export interface SubjectFlashcard {
  id: string;
  deck: SubjectDeckKey;
  category: string;
  front: string;
  back: string;
  /** 文本来源：ai-mcq = AI 生成的原创选择题，不是 College Board 真题 */
  source: 'ai-mcq';
  /** 是否经过逐题独立验算/事实核查 */
  verified: boolean;
}

export const SUBJECT_DECKS_${key.toUpperCase()}: { key: SubjectDeckKey; label: string }[] = [
  { key: ${q(key)}, label: ${q(label)} },
];

export const SUBJECT_FLASHCARDS_${key.toUpperCase()}: SubjectFlashcard[] = [
${cardLines}
];
`;
  fs.writeFileSync(path.join(OUTDIR, `${key}.ts`), ts);
  generated.push({ key, label, count: cards.length });
  console.log(`wrote ${key}.ts cards=${cards.length}`);
}

/* index aggregator */
const imports = generated
  .map((g) => `import { SUBJECT_DECKS_${g.key.toUpperCase()}, SUBJECT_FLASHCARDS_${g.key.toUpperCase()} } from './${g.key}';`)
  .join('\n');
const decksAgg = generated.map((g) => `...SUBJECT_DECKS_${g.key.toUpperCase()}`).join(',\n  ');
const cardsAgg = generated.map((g) => `...SUBJECT_FLASHCARDS_${g.key.toUpperCase()}`).join(',\n  ');
fs.writeFileSync(
  path.join(OUTDIR, 'index.ts'),
  `// AUTO-GENERATED aggregator. Do not hand-edit.
${imports}

export const SUBJECT_DECKS = [
  ${decksAgg},
];
export const SUBJECT_FLASHCARDS = [
  ${cardsAgg},
];
`,
);
console.log(`wrote index.ts total=${generated.reduce((a, g) => a + g.count, 0)} cards`);
