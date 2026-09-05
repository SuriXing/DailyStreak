/* global __dirname */
/**
 * One-off builder: parse an AP subject's MCQ question bank + answer key into a
 * self-contained flashcard-deck TS data module committed into the repo.
 *
 * Usage: node scripts/build-subject-decks.js <srcDir>
 *   <srcDir> = a subject folder inside the AP-AMC materials package.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const BASE =
  process.argv[2] ||
  path.join(home, 'Downloads', 'AP-AMC学习资料-2026-27', 'AP-CSA-CSP-知识点与题库');
const OUTDIR = path.join(__dirname, '..', 'src', 'data', 'subject-decks');
fs.mkdirSync(OUTDIR, { recursive: true });

/** Parse a line like: `1. Question text? A. opt1 B. opt2 C. opt3 D. opt4` */
function parseMcq(line) {
  const t = line.trim();
  if (!t || !/^\d+\./.test(t)) return null;
  // split the trailing " A. ... B. ..." options block off of the stem
  const idx = t.search(/\sA\.\s/);
  if (idx < 0) return null;
  const stem = t.slice(0, idx).trim();
  const optsStr = t.slice(idx).trim();
  const opts = optsStr.split(/\s(?=[BCD]\.\s)/);
  const options = opts.map((o) => o.replace(/^[A-D]\.\s*/, '').trim());
  if (options.length < 2) return null;
  return { num: parseInt(t.match(/^(\d+)/)[1], 10), stem, options };
}

/** Parse a markdown answer table: `|1|B|简析...|` rows. */
function parseAnswerTable(text) {
  const map = {};
  for (const line of text.split('\n')) {
    const cells = line.trim().match(/^\|\s*(\d+)\s*\|\s*([A-D])\s*\|\s*(.*?)\s*\|$/);
    if (cells) {
      map[parseInt(cells[1], 10)] = { letter: cells[2], brief: cells[3].trim() };
    }
  }
  return map;
}

function clean(s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<code>/gi, '')
    .replace(/<\/code>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/`/g, '')
    .replace(/[ \t]+/g, ' ') // collapse spaces/tabs within a line only
    .replace(/ ?\n ?/g, '\n') // trim spaces around newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build a deck from a set of MCQ/answer files.
 * @param {string} deckKey
 * @param {string} deckLabel
 * @param {string} category
 * @param {string[]} mcqFiles
 * @param {string[]} answerFiles
 */
function buildDeck(deckKey, deckLabel, category, mcqFiles, answerFiles) {
  const answerMap = {};
  for (const af of answerFiles) {
    Object.assign(answerMap, parseAnswerTable(fs.readFileSync(af, 'utf8')));
  }
  const cards = [];
  let n = 0;
  for (const mf of mcqFiles) {
    for (const line of fs.readFileSync(mf, 'utf8').split('\n')) {
      const q = parseMcq(line);
      if (!q) continue;
      const ans = answerMap[q.num];
      if (!ans) continue; // skip questions without an answer entry
      n += 1;
      const letterIdx = ans.letter.charCodeAt(0) - 65;
      const stem = q.stem.replace(/^\d+\.\s*/, '');
      const front = `${stem}\nA. ${q.options[0] || ''}\nB. ${q.options[1] || ''}\nC. ${q.options[2] || ''}\nD. ${q.options[3] || ''}`;
      const correct = q.options[letterIdx] || ans.letter;
      const back = `答案：${ans.letter}\n${ans.brief ? '简析：' + ans.brief : ''}\n\n正确选项：${correct}`;
      cards.push({
        id: `${deckKey}-${String(n).padStart(3, '0')}`,
        deck: deckKey,
        category: category || deckLabel,
        front: clean(front),
        back: clean(back).replace(/\n{3,}/g, '\n\n'),
      });
    }
  }
  return { key: deckKey, label: deckLabel, cards };
}

// CSA deck: MCQ files 07 + 08, answer file 09.
const CSA = buildDeck(
  'csa',
  'AP CSA · 选择题',
  'CSA',
  [path.join(BASE, '07-CSA原创选择题-1.md'), path.join(BASE, '08-CSA原创选择题-2.md')],
  [path.join(BASE, '09-CSA选择题答案.md')],
);

const q = JSON.stringify.bind(JSON);
const deck = CSA;
const cardLines = deck.cards
  .map((c) => `  { id: ${q(c.id)}, deck: ${q(c.deck)}, category: ${q(c.category)}, front: ${q(c.front)}, back: ${q(c.back)} },`)
  .join('\n');

const ts = `// AUTO-GENERATED from the AP ${deck.label} materials (${deck.cards.length} cards). Do not hand-edit.
// Regenerate: node scripts/build-subject-decks.js
export type SubjectDeckKey = '${deck.key}';

export interface SubjectFlashcard {
  id: string;
  deck: SubjectDeckKey;
  category: string;
  front: string;
  back: string;
}

export const SUBJECT_DECKS: { key: SubjectDeckKey; label: string }[] = [
  { key: ${JSON.stringify(deck.key)}, label: ${JSON.stringify(deck.label)} },
];

export const SUBJECT_FLASHCARDS: SubjectFlashcard[] = [
${cardLines}
];
`;
const out = path.join(OUTDIR, `${deck.key}.ts`);
fs.writeFileSync(out, ts);
console.log(`wrote ${out} cards=${deck.cards.length}`);
