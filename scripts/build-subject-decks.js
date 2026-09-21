/* global __dirname */
/**
 * One-off builder: parse AP subject MCQ question banks + answer keys into
 * self-contained flashcard-deck TS data modules. Supports two source formats:
 *  - 'dot':   "1. Q? A. opt B. opt C. opt D. opt" + markdown table answer (CSA/CSP)
 *  - 'space': "1. Q? A v B v C v D v" + "N LETTER（brief）; ..." answer (Precalc/Calc/Stats)
 *
 * Usage: node scripts/build-subject-decks.js [baseDir]
 *   baseDir defaults to content/subject-banks (committed in this repo).
 */
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || path.join(__dirname, '..', 'content', 'subject-banks');
const OUTDIR = path.join(__dirname, '..', 'src', 'data', 'subject-decks');
const VERIFICATION = path.join(__dirname, 'flashcard-verification.json');

const SUBJECTS = [
  {
    key: 'csa',
    label: 'AP CSA · 选择题',
    style: 'dot',
    mcq: ['csa/07-CSA原创选择题-1.md', 'csa/08-CSA原创选择题-2.md'],
    ans: ['csa/09-CSA选择题答案.md'],
  },
  {
    key: 'csp',
    label: 'AP CSP · 选择题',
    style: 'dot',
    mcq: ['csp/12-CSP原创选择题-1.md', 'csp/13-CSP原创选择题-2.md'],
    ans: ['csp/14-CSP选择题答案.md'],
  },
  {
    key: 'precalc',
    label: 'AP Precalc · 选择题',
    style: 'space',
    mcq: ['precalc/05-Precalculus原创选择题-1.md', 'precalc/06-Precalculus原创选择题-2.md'],
    ans: ['precalc/07-Precalculus选择题答案.md'],
  },
  {
    key: 'calcbc',
    label: 'AP Calc BC · 选择题',
    style: 'space',
    mcq: ['calcbc/15-CalculusBC原创选择题-1.md', 'calcbc/16-CalculusBC原创选择题-2.md'],
    ans: ['calcbc/17-CalculusBC选择题答案.md'],
  },
  {
    key: 'stats',
    label: 'AP Stats · 选择题',
    style: 'space',
    mcq: ['stats/24-Statistics原创选择题-1.md', 'stats/25-Statistics原创选择题-2.md'],
    ans: ['stats/26-Statistics选择题答案.md'],
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

/**
 * 答案位置轮转。
 *
 * 真实出题人会把正确答案打散在 A/B/C/D 上；这批批量生成的题里 B 占 50%、D 只占 2.8%，
 * 学生"永远选 B"就能拿 50 分（Stats 卡组 73%）。所以生成时按固定序列重排每题选项，
 * 让正确项落位均匀。
 *
 * 只换选项挂在哪个字母下：选项文本与正确答案内容一个字都不改。
 * 选项引用其它选项字母（如"A 和 B"）、或解析里用字母指代的题保持原样。
 */
const LETTER_REFERENCE = /(^|[^A-Za-z])([A-D])\s*(和|与|、|或|,)\s*([A-D])([^A-Za-z]|$)|以上都|以上均|都不对|都正确|无正确/;
const ANALYSIS_LETTER = /(^|[^A-Za-z])([A-D])(?![A-Za-z])/;

/** 均衡的目标字母序列（固定种子洗牌，避免 AABBCCDD 这种机械排列）。 */
function positionPlan(count) {
  const letters = [];
  const perLetter = Math.floor(count / 4);
  for (const l of ['A', 'B', 'C', 'D']) for (let i = 0; i < perLetter; i += 1) letters.push(l);
  for (let i = letters.length; i < count; i += 1) letters.push('ABCD'[i % 4]);
  let seed = 20260921;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = letters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
}

/** 把正确项挪到 targetIdx，其余选项按原相对顺序填满剩下的字母。 */
function rotateOptions(options, correctIdx, targetIdx) {
  const others = options.filter((_, i) => i !== correctIdx);
  const out = [];
  let o = 0;
  for (let i = 0; i < options.length; i += 1) {
    out.push(i === targetIdx ? options[correctIdx] : others[o++]);
  }
  return out;
}

function buildDeck(cfg) {
  const hashes = verifiedHashes();
  const answerMap = {};
  for (const af of cfg.ans) {
    const text = fs.readFileSync(path.join(BASE, af), 'utf8');
    Object.assign(answerMap, cfg.style === 'dot' ? parseDotAnswer(text) : parseSpaceAnswer(text));
  }
  const parse = cfg.style === 'dot' ? parseDotMcq : parseSpaceMcq;
  const items = [];
  const unanswered = [];
  const unparsed = [];
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
      items.push({ num: q.num, rawStem, context, options: q.options, letter: ans.letter, brief: ans.brief });
    }
  }

  // 第二次遍历：按均衡序列轮转选项后再组装卡片
  const plan = positionPlan(items.length);
  let planIndex = 0;
  const cards = items.map((it) => {
    const letterIdx = it.letter.charCodeAt(0) - 65;
    const rotatable = !LETTER_REFERENCE.test(it.options.join(' ')) && !ANALYSIS_LETTER.test(it.brief || '');
    const targetIdx = rotatable ? 'ABCD'.indexOf(plan[planIndex++]) : letterIdx;
    const options = rotateOptions(it.options, letterIdx, targetIdx);
    const front = `${it.context}${it.rawStem}\nA. ${options[0] || ''}\nB. ${options[1] || ''}\nC. ${options[2] || ''}\nD. ${options[3] || ''}`;
    const back = `答案：${'ABCD'[targetIdx]}\n${it.brief ? '简析：' + it.brief : ''}\n\n正确选项：${options[targetIdx] || ''}`;
    const cardId = `${cfg.key}-${String(it.num).padStart(3, '0')}`;
    const frontClean = clean(front);
    const backClean = clean(back).replace(/\n{3,}/g, '\n\n');
    return {
      // id 用源题号：卡号与题库题号一一对应，将来补回缺题也不会让后面的卡片整体改号。
      id: cardId,
      deck: cfg.key,
      category: cfg.label.replace(' · 选择题', ''),
      front: frontClean,
      back: backClean,
      source: 'ai-mcq',
      verified: hashes[cardId] === hashOf(frontClean, backClean),
    };
  });
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

// 卡组数据变了就顺手刷新 bundle 里的压缩块，别让它悄悄过期
execFileSync(process.execPath, [path.join(__dirname, 'pack-decks.mjs')], { stdio: 'inherit' });
