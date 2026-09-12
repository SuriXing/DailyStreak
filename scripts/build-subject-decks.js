/* global __dirname */
/**
 * One-off builder: parse AP subject MCQ question banks + answer keys into
 * self-contained flashcard-deck TS data modules. Supports two source formats:
 *  - 'dot':   "1. Q? A. opt B. opt C. opt D. opt" + markdown table answer (CSA/CSP)
 *  - 'space': "1. Q? A v B v C v D v" + "N LETTER（brief）; ..." answer (Precalc/Calc/Stats)
 *
 * Usage: node scripts/build-subject-decks.js <baseDir>
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const BASE = process.argv[2] || path.join(home, 'Downloads', 'AP-AMC学习资料-2026-27');
const OUTDIR = path.join(__dirname, '..', 'src', 'data', 'subject-decks');

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

/* ---------- 'dot' style (CSA/CSP): "1. Q? A. a B. b C. c D. d" + table answer ---------- */
function parseDotMcq(line) {
  const t = line.trim();
  if (!/^\d+\./.test(t)) return null;
  const idx = t.search(/\sA\.\s/);
  if (idx < 0) return null;
  const stem = t.slice(0, idx).trim();
  const opts = t.slice(idx).split(/\s(?=[BCD]\.\s)/).map((o) => o.replace(/^[A-D]\.\s*/, '').trim());
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
  return { num: parseInt(t.match(/^(\d+)/)[1], 10), stem, options: m.slice(1).map((s) => s.trim()) };
}
function parseSpaceAnswer(text) {
  const map = {};
  // entries: "N LETTER（brief）; " — split on ; or 。 across all answer files
  const joined = text.split('\n').join(' ');
  for (const entry of joined.split(/[;。]/)) {
    const m = entry.trim().match(/^(\d+)\s*([A-D])(?:（([^）]*)）)?/);
    if (m) map[parseInt(m[1], 10)] = { letter: m[2], brief: (m[3] || '').trim() };
  }
  return map;
}

function buildDeck(cfg) {
  const answerMap = {};
  for (const af of cfg.ans) {
    const text = fs.readFileSync(path.join(BASE, af), 'utf8');
    Object.assign(answerMap, cfg.style === 'dot' ? parseDotAnswer(text) : parseSpaceAnswer(text));
  }
  const parse = cfg.style === 'dot' ? parseDotMcq : parseSpaceMcq;
  const cards = [];
  let n = 0;
  for (const mf of cfg.mcq) {
    for (const line of fs.readFileSync(path.join(BASE, mf), 'utf8').split('\n')) {
      const q = parse(line);
      if (!q) continue;
      const ans = answerMap[q.num];
      if (!ans) continue;
      n += 1;
      const letterIdx = ans.letter.charCodeAt(0) - 65;
      const stem = q.stem.replace(/^\d+\.\s*/, '');
      const front = `${stem}\nA. ${q.options[0] || ''}\nB. ${q.options[1] || ''}\nC. ${q.options[2] || ''}\nD. ${q.options[3] || ''}`;
      const correct = q.options[letterIdx] || ans.letter;
      const back = `答案：${ans.letter}\n${ans.brief ? '简析：' + ans.brief : ''}\n\n正确选项：${correct}`;
      cards.push({
        id: `${cfg.key}-${String(n).padStart(3, '0')}`,
        deck: cfg.key,
        category: cfg.label.replace(' · 选择题', ''),
        front: clean(front),
        back: clean(back).replace(/\n{3,}/g, '\n\n'),
      });
    }
  }
  return { key: cfg.key, label: cfg.label, cards };
}

fs.mkdirSync(OUTDIR, { recursive: true });
const q = JSON.stringify.bind(JSON);
const generated = [];
for (const cfg of SUBJECTS) {
  const { key, label, cards } = buildDeck(cfg);
  const cardLines = cards
    .map((c) => `  { id: ${q(c.id)}, deck: ${q(c.deck)}, category: ${q(c.category)}, front: ${q(c.front)}, back: ${q(c.back)} },`)
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
