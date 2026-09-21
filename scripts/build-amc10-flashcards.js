/* global __dirname */
/**
 * One-off builder: parse the AMC10 flashcards from the materials folder into
 * a self-contained TS data module committed into the repo.
 *
 * Usage: node scripts/build-amc10-flashcards.js [srcDir]
 *   srcDir defaults to content/amc10-flashcards (committed in this repo);
 *   pass a path to build from an external material pack instead.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(__dirname, '..', 'content', 'amc10-flashcards');
const OUT = path.join(__dirname, '..', 'src', 'data', 'amc10-flashcards.ts');
const VERIFICATION = path.join(__dirname, 'flashcard-verification.json');

const FILES = [
  ['21-Flashcards-算术与数论.md', 'arithmetic', '算术与数论'],
  ['22-Flashcards-代数函数数列与不等式.md', 'algebra', '代数·函数·数列·不等式'],
  ['23-Flashcards-几何.md', 'geometry', '几何'],
  ['24-Flashcards-组合概率期望.md', 'counting', '组合·概率·期望'],
  ['25-Flashcards-综合方法策略与范围边界.md', 'strategy', '综合·方法·策略'],
];

const LEVEL = { '[核心]': 'core', '[提高]': 'advance', '[边界]': 'boundary' };

/** Strip markdown inline markers (backticks, **bold**) so the app shows plain text. */
function clean(s) {
  return s.replace(/`/g, '').replace(/\*\*/g, '').trim();
}

function parse(line) {
  const t = line.trim();
  const re = /^\[(核心|提高|边界)\](?:\[([^\]]*)\])?\s*([\s\S]*?)\s*::\s*([\s\S]*)$/;
  const m = t.match(re);
  if (!m) return null;
  return {
    level: LEVEL['[' + m[1] + ']'],
    category: (m[2] || '').trim(),
    front: clean(m[3]),
    back: clean(m[4]),
  };
}

/** 复核台账（id → 正文哈希）；哈希对得上才算 verified。 */
function verifiedHashes() {
  if (!fs.existsSync(VERIFICATION)) return {};
  return JSON.parse(fs.readFileSync(VERIFICATION, 'utf8')).cards || {};
}

function hashOf(front, back) {
  return crypto.createHash('sha1').update(`${front}\u0000${back}`).digest('hex').slice(0, 12);
}

const hashes = verifiedHashes();
let id = 0;
const cards = [];
const deckLabels = {};
for (const [file, deck, label] of FILES) {
  deckLabels[deck] = label;
  const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n');
  for (const line of lines) {
    const c = parse(line);
    if (!c) continue;
    id += 1;
    const cardId = `amc10-${String(id).padStart(4, '0')}`;
    cards.push({
      id: cardId,
      level: c.level,
      deck,
      category: c.category || label,
      front: c.front,
      back: c.back,
      source: 'amc10-concept',
      verified: hashes[cardId] === hashOf(c.front, c.back),
    });
  }
}

// 台账里写错的 id 不能静默失效
{
  const known = new Set(cards.map((c) => c.id));
  const unknown = Object.keys(hashes).filter((id) => id.startsWith('amc10-') && !known.has(id));
  if (unknown.length) {
    console.error(`❌ ${VERIFICATION} 里有 ${unknown.length} 个 id 不在卡组里: ${unknown.slice(0, 5).join(', ')}`);
    process.exit(1);
  }
}

const q = (s) => JSON.stringify(s);
const deckArr = Object.entries(deckLabels)
  .map(([k, v]) => `  { key: ${q(k)}, label: ${q(v)} },`)
  .join('\n');
const cardLines = cards
  .map(
    (c) =>
      `  { id: ${q(c.id)}, level: ${q(c.level)}, deck: ${q(c.deck)}, category: ${q(c.category)}, front: ${q(c.front)}, back: ${q(c.back)}, source: ${q(c.source)}, verified: ${c.verified} },`,
  )
  .join('\n');

const ts = `// AUTO-GENERATED from the AMC10 flashcards materials (${cards.length} cards). Do not hand-edit.
// Regenerate: node scripts/build-amc10-flashcards.js

export type FlashcardLevel = 'core' | 'advance' | 'boundary';
export type AMC10Deck = 'arithmetic' | 'algebra' | 'geometry' | 'counting' | 'strategy';

export interface AMC10Flashcard {
  id: string;
  level: FlashcardLevel;
  deck: AMC10Deck;
  category: string;
  front: string;
  back: string;
  /** 文本来源：amc10-concept = 依据考点审计把知识点拆成的问答卡，不是真题 */
  source: 'amc10-concept';
  /** 是否经过逐题独立验算/事实核查 */
  verified: boolean;
}

export const AMC10_DECKS: { key: AMC10Deck; label: string }[] = [
${deckArr}
];

export const AMC10_FLASHCARDS: AMC10Flashcard[] = [
${cardLines}
];
`;

fs.writeFileSync(OUT, ts);
console.log(`wrote ${OUT}`);
console.log(`cards=${cards.length}`);
const levels = cards.reduce((a, c) => ((a[c.level] = (a[c.level] || 0) + 1), a), {});
const decks = cards.reduce((a, c) => ((a[c.deck] = (a[c.deck] || 0) + 1), a), {});
console.log('levels=', JSON.stringify(levels));
console.log('decks=', JSON.stringify(decks));
