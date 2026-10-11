#!/usr/bin/env node
/**
 * 练习页筛选/乱序逻辑的单元测试：src/lib/flashcard-session.ts。
 *
 * 为什么要有这个脚本：filterCards / availableDifficulties / availableKinds / shuffleCards
 * 这几块被改过好几次（拆出模块、加难度筛选、加题型筛选、确定性乱序、难度 0 的占位），
 * 但一直没有单测，只有浏览器冒烟间接覆盖。冒烟要起 dev server、只走默认筛选，
 * 像"难度池为空时返回空数组""availableDifficulties 不把 0 当成一个难度"这类分支
 * 改坏了不会有人发现——而 0 那条已经真的坏过一次（见 726a1c9）。
 *
 * 这里把语义固化成断言：零依赖，只用 node:test + node:assert，不引入 jest/vitest。
 * 覆盖的是 lib 层能观察到的行为；"整卡组只有一种题型时那一行不显示""难度只有一档时不显示"
 * 是 UI 层语义（src/app/(tabs)/study.tsx 里的 showKinds / showDifficulty = xxx.length > 1），
 * 这里只断言 availableKinds / availableDifficulties 的返回值，不测渲染，也不测点选与翻面。
 *
 * 直接跑 node 就能加载 src 下的 .ts：Node 22.18+ 默认剥离类型，但它既不认 tsconfig 的 "@/*"
 * 映射、也不给无扩展名的相对导入补扩展名，所以下面注册一个解析钩子补齐这两件事
 * （用 module.registerHooks，需要 Node >= 22.15；CI 的 node-version 22 与本地 Node 26 都满足）。
 *
 * 用法：node scripts/test-session-logic.mjs（= npm run test:session），失败时退出码非 0。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (typeof registerHooks !== 'function') {
  throw new Error(`这个测试需要 Node >= 22.15（module.registerHooks），当前是 ${process.version}`);
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

/** 依次试 base、base+扩展名、base/index+扩展名，返回第一个真实存在的文件。 */
function firstExistingFile(base) {
  const candidates = [base];
  for (const ext of EXTENSIONS) candidates.push(`${base}${ext}`);
  for (const ext of EXTENSIONS) candidates.push(path.join(base, `index${ext}`));
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // 不存在就试下一个候选
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // 只接管两件事：tsconfig 的 "@/*" 别名，以及无扩展名的相对导入。其余（fflate 等裸包名）交给 Node。
    const bases = [];
    if (specifier.startsWith('@/')) {
      const rest = specifier.slice(2);
      // tsconfig 里 @/* → ./src/*，但 @/assets/* → ./assets/*（在仓库根，不在 src 下）
      bases.push(path.resolve(ROOT, 'src', rest), path.resolve(ROOT, rest));
    } else if (context.parentURL?.startsWith('file:') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
      bases.push(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    }
    for (const base of bases) {
      const hit = firstExistingFile(base);
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

// src 下没有 "type": "module"，Node 会为每个被剥离类型的 .ts 打一条 MODULE_TYPELESS_PACKAGE_JSON 警告。
// 给 package.json 加 "type": "module" 会波及 Expo/Metro 与仓库里的 CJS 脚本，所以只滤掉这一条噪音，
// 其他警告照旧打印（别把它改成吞掉全部警告）。
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const code = typeof rest[0] === 'string' ? rest[0] : rest[0]?.code;
  if (code === 'MODULE_TYPELESS_PACKAGE_JSON') return undefined;
  return emitWarning(warning, ...rest);
};

const loadTypeScript = (relativePath) => import(pathToFileURL(path.join(ROOT, relativePath)).href);
const session = await loadTypeScript('src/lib/flashcard-session.ts');
const { ALL_FLASHCARDS } = await loadTypeScript('src/data/flashcards.ts');
const { availableDifficulties, availableKinds, cardKind, filterCards, shuffleCards } = session;

/* ------------------------------------------------------------------ *
 * 测试用卡池
 * ------------------------------------------------------------------ */

/** 选择题：front 里有 "A. …" 选项行、back 里有"答案：X"，toQuiz() 认得出来。 */
const QUIZ_FRONT = '计算 2 + 2。\nA. 3\nB. 4\nC. 5\nD. 6';
const QUIZ_BACK = '答案：B\n简析：2 + 2 = 4。';
/** 概念卡：没有选项行、没有"答案："，toQuiz() 返回 null，走翻面。 */
const CONCEPT_FRONT = '什么是斜率？';
const CONCEPT_BACK = '斜率是纵坐标变化量与横坐标变化量之比。';

let seq = 0;

/** 造一张卡。quiz=false 造概念卡；level/difficulty 只在显式传入时才写字段。 */
function makeCard({ id, deck = 'precalc', level, difficulty, quiz = true } = {}) {
  seq += 1;
  const card = {
    id: id ?? `fix-${seq}`,
    deck,
    category: 'unit-test',
    front: quiz ? QUIZ_FRONT : CONCEPT_FRONT,
    back: quiz ? QUIZ_BACK : CONCEPT_BACK,
    source: quiz ? 'ai-mcq' : 'amc10-concept',
    verified: true,
  };
  if (level !== undefined) card.level = level;
  if (difficulty !== undefined) card.difficulty = difficulty;
  return card;
}

const ids = (cards) => cards.map((card) => card.id);

/**
 * 一份混合卡池：两个卡组、两种题型、四个难度值（含 0 与"没有 difficulty 字段"）。
 * 真实题库里没有 0（见下面真实数据的注释），所以"0 不算难度"这类回归只能靠这个池子来测。
 */
const POOL = [
  makeCard({ id: 'precalc-quiz-d2', deck: 'precalc', difficulty: 2 }),
  makeCard({ id: 'precalc-quiz-d4', deck: 'precalc', difficulty: 4 }),
  makeCard({ id: 'precalc-quiz-d0', deck: 'precalc', difficulty: 0 }), // 0 = 打包格式里"没有分级"的占位
  makeCard({ id: 'precalc-quiz-nodiff', deck: 'precalc' }), // 连字段都没有（AMC10 概念卡就是这样）
  makeCard({ id: 'arith-concept-core', deck: 'arithmetic', level: 'core', quiz: false }),
  makeCard({ id: 'arith-concept-advance', deck: 'arithmetic', level: 'advance', quiz: false }),
  makeCard({ id: 'arith-quiz-core', deck: 'arithmetic', level: 'core' }), // 真实数据里没有这种组合，用来测交集
  makeCard({ id: 'geometry-quiz-d3', deck: 'geometry', difficulty: 3 }),
];

/** 真实题库的卡组键（AMC10 五个概念卡组 + 五个练习册 + 五个情境题）。 */
const AMC10_DECKS = ['arithmetic', 'algebra', 'geometry', 'counting', 'strategy'];
const SUBJECT_DECKS = [
  'csa',
  'csp',
  'precalc',
  'calcbc',
  'stats',
  'csa-scenario',
  'csp-scenario',
  'precalc-scenario',
  'calcbc-scenario',
  'stats-scenario',
];

/* ------------------------------------------------------------------ *
 * 模块本身
 * ------------------------------------------------------------------ */

test('被测模块导出齐全（脚本真的加载了 flashcard-session.ts，而不是某个空壳）', () => {
  for (const name of ['filterCards', 'availableDifficulties', 'availableKinds', 'cardKind', 'shuffleCards']) {
    assert.equal(typeof session[name], 'function', `${name} 应该是函数`);
  }
  assert.ok(ALL_FLASHCARDS.length > 0, '真实题库不该是空的');
});

/* ------------------------------------------------------------------ *
 * cardKind
 * ------------------------------------------------------------------ */

test('cardKind：有选项行 + "答案：X" 的卡是 quiz，概念卡是 concept', () => {
  assert.equal(cardKind(makeCard({ id: 'q' })), 'quiz');
  assert.equal(cardKind(makeCard({ id: 'c', quiz: false })), 'concept');
});

test('cardKind：front 有选项但 back 没有"答案："时退回 concept（toQuiz 返回 null 的语义）', () => {
  const halfQuiz = { ...makeCard({ id: 'half' }), back: '只有解释，没有答案行' };
  assert.equal(cardKind(halfQuiz), 'concept', '解析不成单选题就该按翻面卡处理');
});

/* ------------------------------------------------------------------ *
 * filterCards
 * ------------------------------------------------------------------ */

test('filterCards：deck 为 null 表示不限，指定 deck 只留该卡组', () => {
  assert.deepEqual(
    ids(filterCards({ deck: null, level: null, kind: null }, POOL)),
    ids(POOL),
    'deck: null 应该原样返回整个卡池',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, kind: null }, POOL)),
    ['precalc-quiz-d2', 'precalc-quiz-d4', 'precalc-quiz-d0', 'precalc-quiz-nodiff'],
    'deck: precalc 应该只留 precalc 的卡',
  );
});

test('filterCards：未知 deck 返回空数组（不是抛错、也不是退化成"不限"）', () => {
  assert.deepEqual(filterCards({ deck: 'no-such-deck', level: null, kind: null }, POOL), []);
  assert.deepEqual(filterCards({ deck: 'no-such-deck', level: null, difficulty: 2, kind: 'quiz' }, POOL), []);
});

test('filterCards：kind 只留对应题型，null 表示不限', () => {
  assert.deepEqual(
    ids(filterCards({ deck: 'arithmetic', level: null, kind: 'quiz' }, POOL)),
    ['arith-quiz-core'],
    'kind: quiz 不该留下概念卡（即使同属 arithmetic）',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'arithmetic', level: null, kind: 'concept' }, POOL)),
    ['arith-concept-core', 'arith-concept-advance'],
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'arithmetic', level: null, kind: null }, POOL)),
    ['arith-concept-core', 'arith-concept-advance', 'arith-quiz-core'],
    'kind: null 表示两种题型都要',
  );
});

test('filterCards：difficulty 精确匹配，null 与 undefined 都表示不限', () => {
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: 2, kind: 'quiz' }, POOL)),
    ['precalc-quiz-d2'],
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: null, kind: 'quiz' }, POOL)),
    ['precalc-quiz-d2', 'precalc-quiz-d4', 'precalc-quiz-d0', 'precalc-quiz-nodiff'],
    'difficulty: null 不能顺手把没有分级/难度为 0 的卡滤掉',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: undefined, kind: 'quiz' }, POOL)),
    ['precalc-quiz-d2', 'precalc-quiz-d4', 'precalc-quiz-d0', 'precalc-quiz-nodiff'],
    'difficulty 缺省（undefined）也按不限处理——availableKinds 就是这么调 filterCards 的',
  );
});

test('filterCards：difficulty 为 0 时只匹配"没有分级"的占位卡（UI 从不会传 0）', () => {
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: 0, kind: 'quiz' }, POOL)),
    ['precalc-quiz-d0'],
    '0 是一个真实的筛选值，不能被当成"不限"',
  );
});

test('filterCards：level 精确匹配，没有 level 的卡不会混进来', () => {
  assert.deepEqual(
    ids(filterCards({ deck: null, level: 'core', kind: null }, POOL)),
    ['arith-concept-core', 'arith-quiz-core'],
    '练习册卡没有 level 字段，不该匹配 level: core',
  );
  assert.deepEqual(ids(filterCards({ deck: null, level: 'boundary', kind: null }, POOL)), []);
});

test('filterCards：四个维度是交集（deck + level + difficulty + kind）', () => {
  assert.deepEqual(
    ids(filterCards({ deck: 'arithmetic', level: 'core', difficulty: null, kind: 'concept' }, POOL)),
    ['arith-concept-core'],
    'level 筛掉 advance、kind 筛掉同卡组的选择题',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: 4, kind: 'concept' }, POOL)),
    [],
    'precalc 的 d4 卡是选择题，叠上 kind: concept 之后应该是空池',
  );
});

test('filterCards：难度/题型是空池时返回空数组，不抛错', () => {
  const noDifficultyCards = [makeCard({ id: 'only-concept', quiz: false })];
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: 3, kind: null }, noDifficultyCards), []);
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: null, kind: 'quiz' }, noDifficultyCards), []);
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: 3, kind: 'quiz' }, []), []);
});

test('filterCards：返回新数组，不改动入参', () => {
  const before = ids(POOL);
  const result = filterCards({ deck: 'precalc', level: null, difficulty: null, kind: 'quiz' }, POOL);
  assert.notEqual(result, POOL, '应该是新数组，不是原数组本身');
  assert.deepEqual(ids(POOL), before, '入参卡池的顺序与长度都不该被改动');
  assert.equal(result[0], POOL[0], '筛出来的应该是原来的卡片对象（同一个引用）');
});

test('filterCards：不传 cards 时作用于全部卡片（ALL_FLASHCARDS 默认值）', () => {
  const allConcepts = filterCards({ deck: null, level: null, kind: 'concept' });
  const expected = ALL_FLASHCARDS.filter((card) => cardKind(card) === 'concept');
  assert.ok(expected.length > 0, '真实题库里应该有概念卡');
  assert.equal(allConcepts.length, expected.length, '默认卡池应该是 ALL_FLASHCARDS');
  assert.ok(
    allConcepts.every((card) => cardKind(card) === 'concept'),
    'kind: concept 的结果里不该混进选择题',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'arithmetic', level: 'core', kind: null })),
    ids(ALL_FLASHCARDS.filter((card) => card.deck === 'arithmetic' && card.level === 'core')),
    '真实数据上 deck + level 的组合筛选',
  );
});

/* ------------------------------------------------------------------ *
 * availableDifficulties
 * ------------------------------------------------------------------ */

test('availableDifficulties：只列出现过的难度，升序、去重', () => {
  const cards = [
    makeCard({ id: 'd3', difficulty: 3 }),
    makeCard({ id: 'd1', difficulty: 1 }),
    makeCard({ id: 'd2a', difficulty: 2 }),
    makeCard({ id: 'd2b', difficulty: 2 }),
  ];
  assert.deepEqual(availableDifficulties(cards), [1, 2, 3], '重复的 2 只出现一次，且按升序');
});

test('availableDifficulties：不包含 0（0 是"这张卡没有分级"的占位，曾把 0 当成一个筛选项）', () => {
  assert.deepEqual(
    availableDifficulties([makeCard({ id: 'zero', difficulty: 0 })]),
    [],
    '一池全是 0 时应该没有任何难度可选，而不是给出一个叫 0 的档',
  );
  assert.deepEqual(
    availableDifficulties([makeCard({ id: 'zero', difficulty: 0 }), makeCard({ id: 'one', difficulty: 1 })]),
    [1],
  );
  assert.deepEqual(availableDifficulties([makeCard({ id: 'neg', difficulty: -1 })]), [], '负数也不是难度档');
});

test('availableDifficulties：没有 difficulty 字段的卡不贡献难度', () => {
  assert.deepEqual(availableDifficulties([makeCard({ id: 'nodiff' })]), []);
  assert.deepEqual(
    availableDifficulties([makeCard({ id: 'nodiff' }), makeCard({ id: 'd2', difficulty: 2 })]),
    [2],
  );
});

test('availableDifficulties：空数组 → 空数组', () => {
  assert.deepEqual(availableDifficulties([]), []);
});

test('availableDifficulties：这份混合卡池给 [2,3,4]（0 与缺字段都不算）', () => {
  assert.deepEqual(availableDifficulties(POOL), [2, 3, 4]);
});

test('availableDifficulties：真实题库里是升序正整数，含 rubric 的 1-4，没有 0', () => {
  // 现在真实数据里每张带分级的卡都是 1-4（0 只存在于打包格式里表示"没有分级"），
  // 所以"0 不该出现"这条回归由上面构造的卡池负责，这里盯的是真实数据本身的口径。
  const difficulties = availableDifficulties(ALL_FLASHCARDS);
  assert.ok(difficulties.length > 0, '真实题库应该有分级');
  assert.ok(
    difficulties.every((d) => Number.isInteger(d) && d > 0),
    `难度只能是正整数：${difficulties.join(',')}`,
  );
  assert.deepEqual(difficulties, [...difficulties].sort((a, b) => a - b), '必须升序');
  assert.deepEqual(
    [1, 2, 3, 4].filter((d) => difficulties.includes(d)),
    [1, 2, 3, 4],
    'rubric 的四档 1-4 都应该在题库里出现过',
  );
});

/* ------------------------------------------------------------------ *
 * availableKinds / cardKind
 * ------------------------------------------------------------------ *
 * "整卡组只有一种题型时那一行不显示"由 UI 负责（study.tsx 的 showKinds = kinds.length > 1），
 * lib 层能测的是：availableKinds 只列实际存在的题型。所以这里断言返回值本身，
 * 不断言那一行有没有渲染出来。
 */

test('availableKinds：一个卡组里两种题型都有时，按 quiz、concept 的固定顺序列出', () => {
  assert.deepEqual(availableKinds('arithmetic', POOL), ['quiz', 'concept'], '顺序是固定的，不按出现先后');
});

test('availableKinds：卡组里只有一种题型时只列一个（UI 据此不显示这一行）', () => {
  const conceptOnly = [makeCard({ id: 'c1', deck: 'arithmetic', quiz: false })];
  const quizOnly = [makeCard({ id: 'q1', deck: 'precalc' })];
  assert.deepEqual(availableKinds('arithmetic', conceptOnly), ['concept']);
  assert.deepEqual(availableKinds('precalc', quizOnly), ['quiz']);
  assert.equal(availableKinds('arithmetic', conceptOnly).length, 1, '长度 1 → UI 的 showKinds 为 false');
  assert.deepEqual(availableKinds('precalc', POOL), ['quiz'], '真实卡池里 precalc 全是选择题');
});

test('availableKinds：只按 deck 过滤，level / difficulty 不影响题型行', () => {
  const cards = [
    makeCard({ id: 'm1', deck: 'mixed', level: 'core', difficulty: 1, quiz: false }),
    makeCard({ id: 'm2', deck: 'mixed', level: 'boundary', difficulty: 4 }),
  ];
  assert.deepEqual(
    availableKinds('mixed', cards),
    ['quiz', 'concept'],
    '两种题型分散在不同 level/difficulty 上，题型行仍然要出现',
  );
});

test('availableKinds：未知 deck → 空数组；deck 为 null 时看整个卡池', () => {
  assert.deepEqual(availableKinds('no-such-deck', POOL), []);
  assert.deepEqual(availableKinds('no-such-deck'), []);
  assert.deepEqual(availableKinds(null, POOL), ['quiz', 'concept']);
  assert.deepEqual(
    availableKinds(null, POOL.filter((card) => cardKind(card) === 'concept')),
    ['concept'],
  );
});

test('availableKinds：空卡池 → 空数组', () => {
  assert.deepEqual(availableKinds('precalc', []), []);
  assert.deepEqual(availableKinds(null, []), []);
});

test('availableKinds：真实题库里 AMC10 卡组整组是概念卡，练习册与情境题整组是选择题', () => {
  for (const deck of AMC10_DECKS) {
    assert.deepEqual(
      availableKinds(deck, ALL_FLASHCARDS),
      ['concept'],
      `${deck} 整组都是概念卡；这里一旦多出第二种题型，练习页就会冒出题型筛选行`,
    );
  }
  for (const deck of SUBJECT_DECKS) {
    assert.deepEqual(availableKinds(deck, ALL_FLASHCARDS), ['quiz'], `${deck} 整组都是选择题`);
  }
  assert.deepEqual(availableKinds(null, ALL_FLASHCARDS), ['quiz', 'concept'], '总共两种题型都有');
});

/* ------------------------------------------------------------------ *
 * shuffleCards
 * ------------------------------------------------------------------ */

const SHUFFLE_INPUT = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `c${n}` }));

test('shuffleCards：同样输入 + 同样种子 → 同样输出（可复现）', () => {
  const first = shuffleCards(SHUFFLE_INPUT, 20261011);
  const second = shuffleCards(SHUFFLE_INPUT, 20261011);
  const third = shuffleCards(SHUFFLE_INPUT, 20261011);
  assert.deepEqual(ids(first), ids(second));
  assert.deepEqual(ids(first), ids(third), '反复调用不能依赖 Math.random 或内部残留状态');
});

test('shuffleCards：输出是输入的排列（元素集合与长度都不变）', () => {
  const out = shuffleCards(SHUFFLE_INPUT, 7);
  assert.equal(out.length, SHUFFLE_INPUT.length);
  assert.deepEqual([...ids(out)].sort(), [...ids(SHUFFLE_INPUT)].sort(), '不能丢卡、也不能多卡');
  assert.equal(new Set(out).size, SHUFFLE_INPUT.length, '不能重复同一张卡（元素引用也不该出现两次）');
});

test('shuffleCards：返回新数组，不改动入参', () => {
  const before = ids(SHUFFLE_INPUT);
  const out = shuffleCards(SHUFFLE_INPUT, 12345);
  assert.notEqual(out, SHUFFLE_INPUT);
  assert.deepEqual(ids(SHUFFLE_INPUT), before, '入参顺序必须原样保留（study.tsx 的 useMemo 依赖它）');
  assert.ok(
    out.every((card) => SHUFFLE_INPUT.includes(card)),
    '洗牌只是换顺序，元素还是原来那些对象',
  );
});

test('shuffleCards：空数组 → 空数组，单元素 → 原样', () => {
  assert.deepEqual(shuffleCards([], 20261011), []);
  assert.deepEqual(ids(shuffleCards([{ id: 'only' }], 0)), ['only']);
  assert.deepEqual(ids(shuffleCards([{ id: 'only' }], 999)), ['only']);
});

test('shuffleCards：种子决定顺序（锁定 mulberry32 的输出，换实现就会红）', () => {
  // 这条是快照，不是"一定被打乱"的断言：洗出来恰好等于原顺序在数学上也是允许的，
  // 这里锁的是"同一个种子永远给出同一个顺序"这个对外承诺（冒烟测试也依赖它）。
  assert.deepEqual(ids(shuffleCards(SHUFFLE_INPUT, 20261011)), ['c7', 'c5', 'c8', 'c1', 'c2', 'c4', 'c6', 'c3']);
  assert.deepEqual(ids(shuffleCards([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 7)), ['b', 'c', 'a']);
});

test('shuffleCards：换种子不会污染上一次调用（各次独立）', () => {
  const a = ids(shuffleCards(SHUFFLE_INPUT, 1));
  shuffleCards(SHUFFLE_INPUT, 2);
  shuffleCards(SHUFFLE_INPUT, 3);
  assert.deepEqual(ids(shuffleCards(SHUFFLE_INPUT, 1)), a, '在别的种子之后再用种子 1，结果必须一样');
  assert.deepEqual(ids(shuffleCards(SHUFFLE_INPUT, 1)), ids(shuffleCards(SHUFFLE_INPUT, 1)));
});

test('shuffleCards：能配合筛选结果使用（先筛后洗，筛出来的卡池长度就是会话长度）', () => {
  const filtered = filterCards({ deck: 'precalc', level: null, difficulty: null, kind: 'quiz' }, POOL);
  const out = shuffleCards(filtered, 42);
  assert.equal(out.length, filtered.length);
  assert.deepEqual([...ids(out)].sort(), [...ids(filtered)].sort());
});

/* ------------------------------------------------------------------ *
 * 边界
 * ------------------------------------------------------------------ */

test('边界：五个函数在空卡池上都不抛错', () => {
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: null, kind: null }, []), []);
  assert.deepEqual(availableDifficulties([]), []);
  assert.deepEqual(availableKinds(null, []), []);
  assert.deepEqual(availableKinds('precalc', []), []);
  assert.deepEqual(shuffleCards([], 0), []);
});

test('边界：单元素卡池', () => {
  const single = [makeCard({ id: 'solo', deck: 'precalc', difficulty: 1 })];
  assert.deepEqual(ids(filterCards({ deck: 'precalc', level: null, difficulty: 1, kind: 'quiz' }, single)), ['solo']);
  assert.deepEqual(filterCards({ deck: 'precalc', level: null, difficulty: 2, kind: 'quiz' }, single), []);
  assert.deepEqual(availableDifficulties(single), [1]);
  assert.deepEqual(availableKinds('precalc', single), ['quiz']);
  assert.deepEqual(ids(shuffleCards(single, 20261011)), ['solo']);
});

test('边界：难度筛选叠上未知 deck → 空数组（不抛错）', () => {
  assert.deepEqual(filterCards({ deck: 'no-such-deck', level: null, difficulty: 4, kind: null }, POOL), []);
  assert.deepEqual(filterCards({ deck: 'no-such-deck', level: 'core', difficulty: 1, kind: 'quiz' }, POOL), []);
  assert.deepEqual(availableKinds('no-such-deck', POOL), []);
});

test('边界：难度筛选用在真实数据上（AMC10 概念卡没有难度，会整组被滤掉）', () => {
  const filtered = filterCards({ deck: null, level: null, difficulty: 1, kind: null });
  assert.ok(filtered.length > 0, '真实题库里应该有难度 1 的卡');
  assert.ok(
    filtered.every((card) => card.difficulty === 1),
    '难度 1 的结果里不该混进别的难度（尤其不该混进没有难度的 AMC10 概念卡）',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'arithmetic', level: null, difficulty: 1, kind: null })),
    [],
    'AMC10 卡组用 level 分级、没有 difficulty，按难度筛就该是空池',
  );
});
