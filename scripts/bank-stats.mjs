#!/usr/bin/env node
/**
 * 题库统计——README 里所有"题库计数"的唯一事实来源。
 *
 * 为什么要有这个脚本：README 的计数（"the 125 scenario items""The 1289 practice
 * cards""All 888 drill and scenario items"）是手写的，于是每加一批题就会漂移一次，
 * 而且没人会注意到——它读起来永远像当前事实。这里的数字全部从生成产物与源文件现算：
 *   - src/data/amc10-flashcards.ts           概念卡（AMC 10）
 *   - src/data/subject-decks/*.ts            练习册（csa/csp/precalc/calcbc/stats）
 *                                            与情境题（各 *-scenario）
 *   - src/data/flashcard-i18n*.ts            英文覆盖层（按 id 计覆盖分子/分母）
 *   - scripts/flashcard-verification.json    复核台账（登记数）
 * 解析复用 scripts/lib/deck-cards.mjs，与打包器、校验器是同一套，不做第二次解析。
 *
 * 用法：
 *   node scripts/bank-stats.mjs                     # 人读的报表
 *   node scripts/bank-stats.mjs --md                # README「按族题数」表的行（可直接粘贴）
 *   node scripts/bank-stats.mjs --md=coverage       # README「哪些卡有英文」表的行
 *   node scripts/bank-stats.mjs --md=difficulty     # README 难度区间表的行
 *
 * 门禁：scripts/check-flashcards.mjs 会 import computeBankStats()，把 README 里这几张表
 * 的数字与这里算出来的逐个比对；不一致就失败，并让开发者跑 npm run bank:stats。
 */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCards } from './lib/deck-cards.mjs';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');

/** 练习册卡组（选择题、单步题）与情境题卡组（多步情境）。 */
export const DRILL_DECKS = ['csa', 'csp', 'precalc', 'calcbc', 'stats'];
export const SCENARIO_DECKS = DRILL_DECKS.map((d) => `${d}-scenario`);
/** 概念卡的卡组键（amc10-flashcards.ts 里的 deck 字段）。 */
export const CONCEPT_DECKS = ['arithmetic', 'algebra', 'geometry', 'counting', 'strategy'];

/**
 * 三个卡族。readmeMatch 用来在 README 表格里认领属于自己的那一行（只认一个特征子串，
 * 这样在 README 里微调文字不会让门禁失效，但族的数量与归属仍然明确）。
 */
export const FAMILIES = [
  {
    key: 'concept',
    label: 'AMC 10（算术与数论 / 代数·函数·数列 / 几何 / 组合·概率 / 综合·策略）',
    short: 'concept',
    readmeMatch: 'AMC 10',
    coverageLabel: 'AMC 10 concept cards',
    coverageStatus: 'complete',
    difficultyLabel: null,
    overlay: 'src/data/flashcard-i18n.ts',
    source: 'the `2*-Flashcards-*.md` files of the AMC 10 material pack',
    generator: '`scripts/build-amc10-flashcards.js`',
    decks: CONCEPT_DECKS,
  },
  {
    key: 'drill',
    label: 'AP CSA, CSP, Precalculus, Calculus BC, Statistics',
    short: 'drill',
    readmeMatch: 'AP CSA',
    coverageLabel: 'Drill banks',
    coverageStatus: 'complete',
    difficultyLabel: 'Drill banks',
    overlay: 'src/data/flashcard-i18n-drill.ts',
    source: 'the `*原创选择题*.md` banks plus their answer keys',
    generator: '`scripts/build-subject-decks.js`',
    decks: DRILL_DECKS,
  },
  {
    key: 'scenario',
    label: '五科情境题（`*-scenario`）',
    short: 'scenario',
    readmeMatch: '*-scenario',
    coverageLabel: 'Scenario decks',
    coverageStatus: 'required by the gate',
    difficultyLabel: 'Scenario decks',
    overlay: 'src/data/flashcard-i18n-scenario.ts',
    source: 'authored for this repo: stimulus plus two to four reasoning steps per item',
    generator: '`scripts/build-subject-decks.js`',
    decks: SCENARIO_DECKS,
  },
];

const AMC10_REL = 'src/data/amc10-flashcards.ts';
const LEDGER_REL = 'scripts/flashcard-verification.json';

/**
 * 覆盖层条目都是单行对象字面量，键用单引号或双引号（仓库里两种风格都存在）。
 * 这里只取 id，所以只认到 `{ front:` 为止；字段解析是 check-flashcards 的事，不在这里重复。
 */
export function readOverlayIds(absPath) {
  const ids = new Set();
  for (const raw of readFileSync(absPath, 'utf8').split('\n')) {
    const m = raw.match(/^\s*(?:'([^']+)'|"([^"]+)")\s*:\s*\{\s*front\s*:/);
    if (m) ids.add(m[1] ?? m[2]);
  }
  return ids;
}

const verifiedOf = (cards) => cards.filter((c) => c.verified === true).length;

/**
 * 直接从生成产物算一份统计。root 为仓库根目录。
 * 返回的对象同时是"打印报表"与"门禁比对"的输入，两边不可能各自算一套。
 */
export function computeBankStats(root = DEFAULT_ROOT) {
  const abs = (rel) => path.join(root, rel);
  const conceptCards = readCards(abs(AMC10_REL));
  const cardsByDeck = new Map();
  for (const deck of [...DRILL_DECKS, ...SCENARIO_DECKS]) {
    cardsByDeck.set(deck, readCards(abs(`src/data/subject-decks/${deck}.ts`)));
  }
  const ledger = JSON.parse(readFileSync(abs(LEDGER_REL), 'utf8'));
  const ledgerCards = ledger.cards || {};

  const overlayIds = new Map(
    FAMILIES.map((fam) => [fam.key, readOverlayIds(abs(fam.overlay))]),
  );

  const cardsOfFamily = (fam) =>
    fam.key === 'concept'
      ? conceptCards
      : fam.decks.flatMap((deck) => cardsByDeck.get(deck) || []);

  const families = FAMILIES.map((fam) => {
    const cards = cardsOfFamily(fam);
    const ids = overlayIds.get(fam.key);
    return {
      key: fam.key,
      short: fam.short,
      label: fam.label,
      readmeMatch: fam.readmeMatch,
      coverageLabel: fam.coverageLabel,
      coverageStatus: fam.coverageStatus,
      difficultyLabel: fam.difficultyLabel,
      overlay: fam.overlay,
      deckCount: fam.decks.length,
      cards: cards.length,
      verified: verifiedOf(cards),
      coverage: { covered: cards.filter((c) => ids.has(c.id)).length, total: cards.length },
    };
  });

  const decks = [];
  for (const fam of FAMILIES) {
    for (const deck of fam.decks) {
      const cards =
        fam.key === 'concept'
          ? conceptCards.filter((c) => c.deck === deck)
          : cardsByDeck.get(deck);
      const difficulties = [0, 0, 0, 0];
      const levels = {};
      for (const card of cards) {
        if (Number.isInteger(card.difficulty) && card.difficulty >= 1 && card.difficulty <= 4) {
          difficulties[card.difficulty - 1] += 1;
        }
        if (card.level) levels[card.level] = (levels[card.level] || 0) + 1;
      }
      const ids = overlayIds.get(fam.key);
      decks.push({
        deck,
        family: fam.key,
        cards: cards.length,
        difficulties,
        levels,
        verified: verifiedOf(cards),
        coverage: { covered: cards.filter((c) => ids.has(c.id)).length, total: cards.length },
      });
    }
  }

  const allCards = [...conceptCards, ...[...cardsByDeck.values()].flat()];
  const total = families.reduce((a, f) => a + f.cards, 0);
  const optionCards = families
    .filter((f) => f.key !== 'concept')
    .reduce((a, f) => a + f.cards, 0);

  return {
    total,
    /** 带 A/B/C/D 选项的卡片数（练习册 + 情境题）——README 里"option cards"指的就是这个。 */
    optionCards,
    families,
    decks,
    ledger: {
      file: LEDGER_REL,
      /** 台账 cards 里的条目数（登记了几张）。 */
      registered: Object.keys(ledgerCards).length,
      /** 卡片上 verified=true 的数量（哈希对得上的那些）。 */
      verified: verifiedOf(allCards),
      total: allCards.length,
    },
  };
}

/**
 * 难度占比：与 README 难度区间表同样的取整口径（四舍五入到整数），这样两边能逐字对上。
 * README 那张表 16 个格子里 15 个就是这个口径；唯一对不上的是 drill 的 Level 3 上限
 * （写成 17，而实际最高的 stats 卡组是 10/128=7.8%、precalc 是 21/128=16.4% → 16），
 * 表已按本函数重算。
 * 先乘后除是为了避开浮点误差——28/50*100 在 IEEE754 里是 56.000000000000005。
 */
const pct = (n, total) => (total ? Math.round((n * 100) / total) : 0);

/** 某族各难度级别的 min–max 区间，例如 [[44, 71], [16, 40], [8, 17], [2, 4]]。 */
export function difficultyRanges(stats, familyKey) {
  const decks = stats.decks.filter((d) => d.family === familyKey);
  return [0, 1, 2, 3].map((i) => {
    const values = decks.map((d) => pct(d.difficulties[i], d.cards));
    return [Math.min(...values), Math.max(...values)];
  });
}

/** README「按族题数」表的行（列：Decks | Cards | Source material | Generator）。 */
export function familyRows(stats) {
  return FAMILIES.map((fam) => {
    const f = stats.families.find((x) => x.key === fam.key);
    return `| ${fam.label} | ${f.cards} | ${fam.source} | ${fam.generator} |`;
  });
}

/** README「哪些卡存在英文」表的行（列：Layer | File | Cards | Status）。 */
export function coverageRows(stats) {
  return FAMILIES.map((fam) => {
    const f = stats.families.find((x) => x.key === fam.key);
    return `| ${fam.coverageLabel} | \`${fam.overlay}\` | ${f.coverage.covered} of ${f.coverage.total} | ${fam.coverageStatus} |`;
  });
}

/** README 难度区间表的行（列：Deck family | Level 1 | Level 2 | Level 3 | Level 4）。 */
export function difficultyRows(stats) {
  return FAMILIES.filter((fam) => fam.difficultyLabel).map((fam) => {
    const f = stats.families.find((x) => x.key === fam.key);
    const ranges = difficultyRanges(stats, fam.key)
      .map(([lo, hi]) => `${lo}–${hi}%`)
      .join(' | ');
    return `| ${fam.difficultyLabel} (${f.cards} items, five subjects) | ${ranges} |`;
  });
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

/** 人读报表。 */
export function renderReport(stats) {
  const out = [];
  out.push('题库统计（现算，来源：src/data/subject-decks/*.ts、src/data/amc10-flashcards.ts、');
  out.push('src/data/flashcard-i18n*.ts、scripts/flashcard-verification.json）');
  out.push('');

  out.push('== 按族 ==');
  out.push(`${pad('family', 10)}${pad('decks', 7)}${lpad('cards', 7)}${lpad('en', 10)}${lpad('verified', 10)}`);
  for (const f of stats.families) {
    out.push(
      `${pad(f.key, 10)}${pad(f.deckCount, 7)}${lpad(f.cards, 7)}` +
        `${lpad(`${f.coverage.covered}/${f.coverage.total}`, 10)}${lpad(`${f.verified}/${f.cards}`, 10)}`,
    );
  }
  out.push(
    `${pad('TOTAL', 10)}${pad('', 7)}${lpad(stats.total, 7)}${lpad(
      `${stats.families.reduce((a, f) => a + f.coverage.covered, 0)}/${stats.total}`,
      10,
    )}${lpad(`${stats.ledger.verified}/${stats.total}`, 10)}`,
  );
  out.push('');
  out.push(`带选项的卡片（练习册 + 情境题，README 里说的 "option cards"）：${stats.optionCards}`);
  out.push('');

  const deckTable = (title, keys) => {
    out.push(`== ${title} ==`);
    out.push(
      `${pad('deck', 20)}${lpad('cards', 7)}${lpad('L1', 6)}${lpad('L2', 6)}${lpad('L3', 6)}${lpad('L4', 6)}` +
        `${lpad('L1%', 6)}${lpad('L2%', 6)}${lpad('L3%', 6)}${lpad('L4%', 6)}`,
    );
    for (const d of stats.decks.filter((x) => keys.includes(x.family))) {
      out.push(
        `${pad(d.deck, 20)}${lpad(d.cards, 7)}${d.difficulties.map((n) => lpad(n, 6)).join('')}` +
          `${d.difficulties.map((n) => lpad(pct(n, d.cards), 6)).join('')}`,
      );
    }
    out.push('');
  };
  deckTable('练习册（drill）按卡组', ['drill']);
  deckTable('情境题（scenario）按卡组', ['scenario']);

  out.push('== 概念卡（AMC 10）按卡组 ==');
  out.push(`${pad('deck', 20)}${lpad('cards', 7)}${lpad('core', 7)}${lpad('advance', 9)}${lpad('boundary', 10)}`);
  for (const d of stats.decks.filter((x) => x.family === 'concept')) {
    out.push(
      `${pad(d.deck, 20)}${lpad(d.cards, 7)}${lpad(d.levels.core || 0, 7)}` +
        `${lpad(d.levels.advance || 0, 9)}${lpad(d.levels.boundary || 0, 10)}`,
    );
  }
  out.push('（概念卡没有 difficulty 字段：它用 level=core/advance/boundary 分级，不是 1–4）');
  out.push('');

  out.push('== 难度区间（与 README 的 Deck family 表同口径，向上取整） ==');
  for (const fam of FAMILIES.filter((x) => x.difficultyLabel)) {
    const f = stats.families.find((x) => x.key === fam.key);
    const ranges = difficultyRanges(stats, fam.key)
      .map(([lo, hi]) => `${lo}–${hi}%`)
      .join('  ');
    out.push(`${pad(fam.difficultyLabel, 16)}${lpad(`${f.cards} items`, 13)}   ${ranges}`);
  }
  out.push('');

  out.push('== 英文覆盖（按族，分子 = 该族覆盖层里有条目的卡片数） ==');
  for (const f of stats.families) {
    out.push(`${pad(f.key, 10)}${lpad(`${f.coverage.covered} of ${f.coverage.total}`, 12)}   ${f.overlay}`);
  }
  out.push('');

  out.push('== 复核台账 ==');
  out.push(`${stats.ledger.file}：登记 ${stats.ledger.registered} 张；当前实际核验 ${stats.ledger.verified} 张`);
  out.push('（实际核验 = 卡片上 verified=true 的数量；台账条目多出来说明正文改过但没重新复核）');
  return out.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const stats = computeBankStats();
  const mdArg = argv.find((a) => a === '--md' || a.startsWith('--md='));
  if (mdArg) {
    const which = mdArg.includes('=') ? mdArg.split('=')[1] : 'family';
    const rows =
      which === 'coverage'
        ? coverageRows(stats)
        : which === 'difficulty'
          ? difficultyRows(stats)
          : which === 'family'
            ? familyRows(stats)
            : null;
    if (!rows) {
      console.error(`未知的 --md 表名 "${which}"，可用：family（默认）、coverage、difficulty`);
      process.exit(2);
    }
    console.log(rows.join('\n'));
    return;
  }
  console.log(renderReport(stats));
}

const invokedDirectly =
  process.argv[1] &&
  (() => {
    try {
      return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
      return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    }
  })();

if (invokedDirectly) main();
