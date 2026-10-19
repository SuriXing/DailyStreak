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
 * 另一类"自述数字"在同一份 README 里，却从来没有门禁管过：打包块的体积
 * （"132 KB instead of 321 KB"）和冒烟测试的断言条数（"30 assertions"）。两个都错了很久，
 * 而它们读起来和真的一样。computeBundleStats() 把这几项也现算出来：
 *   - src/data/deck-pack.ts                     体积（字节 → KB），以及其中 base64 解出来的 gzip 载荷长度
 *   - src/data/subject-decks/*.ts + amc10-flashcards.ts  明文卡组模块的总体积
 *   - scripts/smoke-test.js                     断言调用点数量（assert / assertI18n / assertLabel）
 * 体积一律按 1024 进制取整到 KB，与 scripts/pack-decks.mjs 打印的口径一致。
 *
 * 用法：
 *   node scripts/bank-stats.mjs                     # 人读的报表
 *   node scripts/bank-stats.mjs --md                # README「按族题数」表的行（可直接粘贴）
 *   node scripts/bank-stats.mjs --md=coverage       # README「哪些卡有英文」表的行
 *   node scripts/bank-stats.mjs --md=difficulty     # README 难度区间表的行
 *   node scripts/bank-stats.mjs --md=bundle         # README 里体积句与冒烟测试那行的句子
 *
 * 门禁：scripts/check-flashcards.mjs 会 import computeBankStats() 与 computeBundleStats()，
 * 把 README 里这些表与句子的数字与这里算出来的逐个比对；不一致就失败，并让开发者跑
 * npm run bank:stats。
 */
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
/** 打包产物（gzip+base64 块）与它的明文来源，见 scripts/pack-decks.mjs。 */
const PACK_REL = 'src/data/deck-pack.ts';
const PLAIN_DECK_DIR = 'src/data/subject-decks';
/** 冒烟测试：README 里那句 "N assertion call sites" 数的是它。 */
const SMOKE_REL = 'scripts/smoke-test.js';

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

// ---------------------------------------------------------------------------
// 体积与冒烟测试断言数
// ---------------------------------------------------------------------------

/** README 里的 KB 是 1024 进制（和 scripts/pack-decks.mjs 的 /1024 同口径），取整到整数。 */
const KB = 1024;
const toKb = (bytes) => Math.round(bytes / KB);

/**
 * 把注释、字符串、模板字面量与正则字面量涂成空格（换行保留），只留代码。
 *
 * 为什么需要：上面的计数规则是"只数调用点"，而 `assert(` 这样的串也会出现在注释、
 * 字符串和断言消息里（"预期 assert( 失败"这种）。直接在原文上正则匹配，改一句注释就能
 * 让 README 的断言数漂移——那正是这轮想消灭的东西。涂成空格而不是删掉，是为了让偏移量
 * 与原文一一对应：后面还要按花括号配对切出 helper 的函数体。
 *
 * `${ ... }` 里的代码保留（插值里也可能有断言），所以模板字面量用一个栈来跟踪，
 * 而不是整块涂掉。
 */
export function maskNonCode(src) {
  const out = src.split('');
  const N = src.length;
  const paint = (from, to) => {
    for (let i = from; i < to && i < N; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };
  /** 栈底永远是 'code'：'template' = 模板字面量的文本里，'interp' = `${` 之后的表达式里。 */
  const stack = ['code'];
  const top = () => stack[stack.length - 1];
  let i = 0;
  /** 上一个非空白代码字符，用来区分正则字面量与除号。 */
  let lastSig = '';

  while (i < N) {
    const c = src[i];
    const next = src[i + 1];

    if (top() === 'template') {
      if (c === '\\') {
        paint(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '`') {
        paint(i, i + 1);
        stack.pop();
        lastSig = '`';
        i += 1;
        continue;
      }
      if (c === '$' && next === '{') {
        paint(i, i + 2);
        stack.push('interp');
        lastSig = '{';
        i += 2;
        continue;
      }
      paint(i, i + 1);
      i += 1;
      continue;
    }

    // 以下都在代码里（'code' 或 'interp'）
    if (c === '/' && next === '/') {
      const nl = src.indexOf('\n', i);
      const end = nl < 0 ? N : nl;
      paint(i, end);
      i = end;
      continue;
    }
    if (c === '/' && next === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close < 0 ? N : close + 2;
      paint(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < N && src[j] !== c) {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '\n') break;
        else j += 1;
      }
      const end = Math.min(j + 1, N);
      paint(i, end);
      i = end;
      lastSig = c;
      continue;
    }
    if (c === '`') {
      stack.push('template');
      i += 1;
      continue;
    }
    if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig))) {
      // 正则字面量：字符组里的 `/` 不结束它
      let j = i + 1;
      let inClass = false;
      while (j < N) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '\n') break;
        else if (d === '/' && !inClass) {
          j += 1;
          break;
        }
        j += 1;
      }
      paint(i, j);
      i = j;
      lastSig = '/';
      continue;
    }
    if (c === '{') {
      stack.push('code');
    } else if (c === '}') {
      if (stack.length > 1) stack.pop();
    }
    if (!/\s/.test(c)) lastSig = c;
    i += 1;
  }
  return out.join('');
}

/** 花括号配对：从 `from` 处的第一个 `{` 开始，返回配对的 `}` 之后一位（配不上就到最后）。 */
function blockEnd(masked, from) {
  const open = masked.indexOf('{', from);
  if (open < 0) return masked.length;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return masked.length;
}

/** 三个断言 helper 的名字：它们的声明与函数体都不算调用点。 */
export const ASSERT_HELPERS = ['assert', 'assertI18n', 'assertLabel'];

/**
 * 数冒烟测试里的断言调用点：只数 `assert(` / `assertI18n(` / `assertLabel(` 的**调用**，
 * 不算三个 helper 的声明，也不算 helper 体内那条转发调用（assertI18n/assertLabel 各有一条
 * `assert(...)`，那是实现不是用例）。
 *
 * 为什么数调用点而不是"断言条数"：有的调用在循环里（每次只检查一张卡的顺序），
 * 一条调用点可能跑几十次。README 说的就是调用点，措辞与口径一致才不会又漂一次。
 */
export function countAssertionCallSites(source) {
  const masked = maskNonCode(source);
  const helperBodies = [];
  const declRe = /(?:^|\n)[ \t]*(?:async\s+)?function\s+(assert|assertI18n|assertLabel)\s*\(/g;
  let decl;
  while ((decl = declRe.exec(masked))) {
    const start = decl.index + (decl[0].startsWith('\n') ? 1 : 0);
    helperBodies.push([start, blockEnd(masked, decl.index)]);
  }
  const inHelper = (at) => helperBodies.some(([from, to]) => at >= from && at < to);

  const byName = Object.fromEntries(ASSERT_HELPERS.map((n) => [n, 0]));
  const callRe = /\b(assert|assertI18n|assertLabel)\s*\(/g;
  let call;
  while ((call = callRe.exec(masked))) {
    if (inHelper(call.index)) continue;
    byName[call[1]] += 1;
  }
  return {
    total: ASSERT_HELPERS.reduce((a, n) => a + byName[n], 0),
    byName,
  };
}

/**
 * README 里两个"自述数字"的真值：打包块的体积、gzip 载荷、明文卡组模块的体积、冒烟断言数。
 *
 * 为什么单独一个函数：这几项和题库张数是两回事（一个是数据形状，一个是产物体积），
 * 但它们漂移的方式一模一样——手写的数字读起来永远像当前事实。
 */
export function computeBundleStats(root = DEFAULT_ROOT) {
  const abs = (rel) => path.join(root, rel);

  const packBytes = statSync(abs(PACK_REL)).size;
  const packSrc = readFileSync(abs(PACK_REL), 'utf8');
  const b64 = packSrc.match(/DECK_PACK_BASE64\s*=\s*'([A-Za-z0-9+/=]+)'/);
  if (!b64) throw new Error(`${PACK_REL}: 找不到 DECK_PACK_BASE64 字面量（打包格式改过了？）`);
  const gzip = Buffer.from(b64[1], 'base64');
  if (gzip.length < 18 || gzip[0] !== 0x1f || gzip[1] !== 0x8b) {
    throw new Error(`${PACK_REL}: 解出来的不是 gzip 流（魔数 ${gzip[0]}/${gzip[1]}）`);
  }
  const rawBytes = gunzipSync(gzip).length;

  // 明文卡组模块：卡组文件（index.ts 只是再导出的 barrel，不含题面）加 AMC10 概念卡。
  const plainFiles = [
    ...readdirSync(abs(PLAIN_DECK_DIR))
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .sort()
      .map((f) => `${PLAIN_DECK_DIR}/${f}`),
    AMC10_REL,
  ];
  const plainBytes = plainFiles.reduce((a, rel) => a + statSync(abs(rel)).size, 0);

  const assertions = countAssertionCallSites(readFileSync(abs(SMOKE_REL), 'utf8'));

  return {
    pack: { file: PACK_REL, bytes: packBytes, kb: toKb(packBytes) },
    gzip: {
      file: PACK_REL,
      bytes: gzip.length,
      kb: toKb(gzip.length),
      /** 解压后的 JSON 载荷（pack-decks.mjs 报表里那个 "raw"）。 */
      rawBytes,
      rawKb: toKb(rawBytes),
    },
    plain: { files: plainFiles, bytes: plainBytes, kb: toKb(plainBytes) },
    saving: { bytes: plainBytes - packBytes, kb: toKb(plainBytes - packBytes) },
    assertions: { file: SMOKE_REL, callSites: assertions.total, byName: assertions.byName },
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

/**
 * README 里那两句"自述数字"（打包体积 / 冒烟断言数）的成品句子，`--md=bundle` 直接打印。
 *
 * 句子的措辞就是 README 里的措辞（体积句是 "The bundle carries a packed copy" 那一节的
 * 第二句，冒烟那行在 Quality Gates 的命令块里），所以整行粘回去即可，不用再对一遍换行。
 * 门禁按同样的措辞反解数字——这里是产出口，scripts/check-flashcards.mjs 是入口。
 */
export function bundleFragments(bundle) {
  return [
    `The packed form is ${bundle.pack.kb} KB instead of ${bundle.plain.kb} KB of plain object ` +
      `literals, which takes about ${bundle.saving.kb} KB off the web bundle and keeps the card ` +
      `text out of a straightforward grep of the shipped JS.`,
    `${'npm run smoke'.padEnd(34)}# ${bundle.assertions.callSites} assertion call sites, exits non-zero on failure`,
  ];
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

/** 人读报表。 */
export function renderReport(stats, bundle = computeBundleStats()) {
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
  out.push('');

  out.push('== 体积与冒烟断言（README 那两句"自述数字"的真值） ==');
  out.push(
    `${bundle.pack.file}（打包块，含头部注释）：${bundle.pack.bytes} 字节 = ${bundle.pack.kb} KB`,
  );
  out.push(
    `  其中 base64 解出来的 gzip 载荷：${bundle.gzip.bytes} 字节 = ${bundle.gzip.kb} KB` +
      `（解压后 JSON ${bundle.gzip.rawBytes} 字节 = ${bundle.gzip.rawKb} KB）`,
  );
  out.push(
    `明文卡组模块（${bundle.plain.files.length} 个文件，含 amc10-flashcards.ts）：` +
      `${bundle.plain.bytes} 字节 = ${bundle.plain.kb} KB`,
  );
  out.push(`  打包省下的体积：${bundle.plain.kb} KB - ${bundle.pack.kb} KB = ${bundle.saving.kb} KB`);
  out.push(
    `${bundle.assertions.file} 断言调用点：${bundle.assertions.callSites}` +
      `（assert ${bundle.assertions.byName.assert} + assertI18n ${bundle.assertions.byName.assertI18n}` +
      ` + assertLabel ${bundle.assertions.byName.assertLabel}；不含 helper 声明与 helper 体内的转发）`,
  );
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
          : which === 'bundle'
            ? bundleFragments(computeBundleStats())
            : which === 'family'
              ? familyRows(stats)
              : null;
    if (!rows) {
      console.error(
        `未知的 --md 表名 "${which}"，可用：family（默认）、coverage、difficulty、bundle`,
      );
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
