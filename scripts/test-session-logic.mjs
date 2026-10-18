#!/usr/bin/env node
/**
 * 练习页筛选/乱序逻辑的单元测试：src/lib/flashcard-session.ts。
 *
 * 为什么要有这个脚本：filterCards / availableDifficulties / availableKinds / shuffleCards / orderCards
 * 这几块被改过好几次（拆出模块、加难度筛选、加题型筛选、确定性乱序、难度 0 的占位、加难度排序），
 * 但一直没有单测，只有浏览器冒烟间接覆盖。冒烟要起 dev server、只走默认筛选，
 * 像"难度池为空时返回空数组""availableDifficulties 不把 0 当成一个难度"这类分支
 * 改坏了不会有人发现——而 0 那条已经真的坏过一次（见 726a1c9）。
 *
 * 这里把语义固化成断言：零依赖，只用 node:test + node:assert，不引入 jest/vitest。
 * 覆盖的是 lib 层能观察到的行为；"整卡组只有一种题型时那一行不显示""难度只有一档时不显示"
 * "AMC10 卡组不显示排序开关"是 UI 层语义（src/app/(tabs)/study.tsx 里的
 * showKinds / showDifficulty / showOrder），这里只断言 availableKinds / availableDifficulties
 * 的返回值，不测渲染，也不测点选与翻面。
 *
 * orderCards 的三条语义是这次要锁住的重点：null = 不排序、缺难度的卡排在**末尾**
 * （不是当成 0 排到最前）、同难度内部稳定。乱序与排序互斥是界面层的取舍（pickOrder 会关掉乱序），
 * lib 层不做互斥，所以这里不测"两个同时为真会怎样"，只测排序函数自己。
 *
 * 难度筛选的 SessionFilter.difficulty 是"集合"而不是单个档（null / 空数组 = 不限），
 * 所以"多选是并集""空数组与 null 同义""集合里没有能命中的档就该是空池"这几条也在这里锁住：
 * 界面上的多选 chip 与冒烟里的分母断言都建立在这些语义上。
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
const { availableDifficulties, availableKinds, cardKind, filterCards, orderCards, shuffleCards, summarizePool } = session;

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
  for (const name of ['filterCards', 'availableDifficulties', 'availableKinds', 'cardKind', 'shuffleCards', 'orderCards', 'summarizePool']) {
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
  assert.deepEqual(filterCards({ deck: 'no-such-deck', level: null, difficulty: [2], kind: 'quiz' }, POOL), []);
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

test('filterCards：难度单选（集合里一个档）只留该档，null / undefined / 空数组都表示不限', () => {
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: [2], kind: 'quiz' }, POOL)),
    ['precalc-quiz-d2'],
  );
  const unrestricted = ['precalc-quiz-d2', 'precalc-quiz-d4', 'precalc-quiz-d0', 'precalc-quiz-nodiff'];
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: null, kind: 'quiz' }, POOL)),
    unrestricted,
    'difficulty: null 不能顺手把没有分级/难度为 0 的卡滤掉',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: undefined, kind: 'quiz' }, POOL)),
    unrestricted,
    'difficulty 缺省（undefined）也按不限处理——availableKinds 就是这么调 filterCards 的',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: [], kind: 'quiz' }, POOL)),
    unrestricted,
    '空数组与 null 同义：界面上"一个档都没选"就是空数组',
  );
});

test('filterCards：难度多选是并集（"只要 3 和 4"），与选中顺序无关', () => {
  const cards = [
    makeCard({ id: 'd1', difficulty: 1 }),
    makeCard({ id: 'd2', difficulty: 2 }),
    makeCard({ id: 'd3', difficulty: 3 }),
    makeCard({ id: 'd4', difficulty: 4 }),
  ];
  assert.deepEqual(
    ids(filterCards({ deck: null, level: null, difficulty: [3, 4], kind: 'quiz' }, cards)),
    ['d3', 'd4'],
    '两个档都要留下，不是"最后一个点中的那个"',
  );
  assert.deepEqual(
    ids(filterCards({ deck: null, level: null, difficulty: [4, 3], kind: 'quiz' }, cards)),
    ['d3', 'd4'],
    '结果与选中顺序无关，顺序沿用卡池本身的顺序',
  );
  assert.deepEqual(
    ids(filterCards({ deck: null, level: null, difficulty: [1, 2], kind: 'quiz' }, cards)),
    ['d1', 'd2'],
  );
  assert.deepEqual(
    ids(filterCards({ deck: null, level: null, difficulty: [3, 4], kind: 'quiz' }, cards)),
    ids(filterCards({ deck: null, level: null, difficulty: [3], kind: 'quiz' }, cards)).concat(
      ids(filterCards({ deck: null, level: null, difficulty: [4], kind: 'quiz' }, cards)),
    ),
    '多选的结果 = 各档单选结果之和（冒烟里"分母等于两档之和"断言的就是这条）',
  );
  assert.equal(
    filterCards({ deck: null, level: null, difficulty: [2, 2], kind: 'quiz' }, cards).length,
    filterCards({ deck: null, level: null, difficulty: [2], kind: 'quiz' }, cards).length,
    '集合里重复同一个档不该把卡片算两次',
  );
});

test('filterCards：多选里的档一个都不存在 → 空池（不是退化成不限）', () => {
  const oneCard = [makeCard({ id: 'only-d2', difficulty: 2 })];
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: [0, 9], kind: 'quiz' }, oneCard), []);
  assert.deepEqual(
    ids(filterCards({ deck: null, level: null, difficulty: [2, 9], kind: 'quiz' }, oneCard)),
    ['only-d2'],
    '集合里有一个能命中的档就够了',
  );
});

test('filterCards：difficulty 集合里放 0 时只匹配"没有分级"的占位卡（UI 从不会传 0）', () => {
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: [0], kind: 'quiz' }, POOL)),
    ['precalc-quiz-d0'],
    '0 是一个真实的筛选值，不能被当成"不限"',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'precalc', level: null, difficulty: [0, 4], kind: 'quiz' }, POOL)),
    ['precalc-quiz-d4', 'precalc-quiz-d0'],
    '0 和正常的档可以一起选',
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
    ids(filterCards({ deck: 'precalc', level: null, difficulty: [4], kind: 'concept' }, POOL)),
    [],
    'precalc 的 d4 卡是选择题，叠上 kind: concept 之后应该是空池',
  );
});

test('filterCards：难度/题型是空池时返回空数组，不抛错', () => {
  const noDifficultyCards = [makeCard({ id: 'only-concept', quiz: false })];
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: [3], kind: null }, noDifficultyCards), []);
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: null, kind: 'quiz' }, noDifficultyCards), []);
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: [3], kind: 'quiz' }, []), []);
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
 * summarizePool（「我的」页题库概览的数字来源）
 * ------------------------------------------------------------------ *
 * 这一块要锁住的只有一条：**没有分级的卡绝不能被算成某一档**。界面上"没有分级"那一行
 * 是单列的，学生看到的是"四档各有几题 + 还有多少张没有档"；如果这里把打包格式的 0
 * 或缺失字段当成 0 档，那一行就会凭空多出一个"难度 0"或者把 564 张概念卡并进 1 档，
 * 而概览恰恰是"我到底有多少题可练、难度怎么分布"的唯一入口。所以 0 / 缺字段 / 空池
 * 三条都在这里用构造卡池测，真实数据上再验证"四档之和 + 无分级 = 总题数"这个恒等式。
 */

/** 给 POOL 配一份卡组名单：summarizePool 的 decks 只管显示名与顺序，题数仍由 cards 数出来。 */
const POOL_DECKS = [
  { key: 'precalc', label: '微积分预备', hasLevels: false },
  { key: 'arithmetic', label: '算术与数论', hasLevels: true },
  { key: 'geometry', label: '几何', hasLevels: false },
];

test('summarizePool：0 与缺字段都只进"没有分级"，不会变成 0 档', () => {
  const summary = summarizePool(POOL, POOL_DECKS);
  assert.equal(summary.total, POOL.length);
  assert.deepEqual(
    summary.grades,
    [
      { difficulty: 2, count: 1 },
      { difficulty: 3, count: 1 },
      { difficulty: 4, count: 1 },
    ],
    '档位只列真实存在的 2/3/4：POOL 里那张 difficulty: 0 的占位卡不是一档',
  );
  assert.equal(summary.ungraded, 5, 'difficulty 0、没有 difficulty 字段、两张概念卡与一张混合卡都算"没有分级"');
  const graded = summary.grades.reduce((n, g) => n + g.count, 0);
  assert.equal(graded + summary.ungraded, summary.total, '各档之和 + 没有分级 = 总题数');
  assert.deepEqual(
    summary.decks.map((d) => [d.key, d.count]),
    [
      ['precalc', 4],
      ['arithmetic', 3],
      ['geometry', 1],
    ],
    '卡组题数按 deck 数出来，顺序沿用传进来的卡组名单',
  );
  assert.equal(summary.decks.reduce((n, d) => n + d.count, 0), summary.total, '各卡组之和 = 总题数');
});

test('summarizePool：空池 → 全 0（不抛错、也不编出一个 0 档）', () => {
  const summary = summarizePool([], POOL_DECKS);
  assert.deepEqual(summary.grades, []);
  assert.equal(summary.total, 0);
  assert.equal(summary.ungraded, 0);
  assert.deepEqual(summary.decks.map((d) => d.count), [0, 0, 0]);
});

test('summarizePool：整池都没有分级时，档位是空的、题数全落在"没有分级"', () => {
  const concepts = [
    makeCard({ id: 'c1', deck: 'arithmetic', level: 'core', quiz: false }),
    makeCard({ id: 'c2', deck: 'arithmetic', level: 'advance', quiz: false }),
  ];
  const summary = summarizePool(concepts, POOL_DECKS);
  assert.deepEqual(summary.grades, []);
  assert.equal(summary.ungraded, 2);
  assert.equal(summary.total, 2);
});

test('summarizePool：真实题库上每档题数与难度筛选数出来的一致，且四档之和 + 无分级 = 总题数', () => {
  const summary = summarizePool();
  const countIn = (filter) => filterCards({ deck: null, level: null, difficulty: null, ...filter }).length;
  assert.equal(summary.total, ALL_FLASHCARDS.length, '总题数就是整套题库的卡片数');
  assert.deepEqual(
    summary.grades.map((g) => g.difficulty),
    availableDifficulties(ALL_FLASHCARDS),
    '概览里的档位与练习页难度筛选行同源（列出来的档就是数据里真有的档）',
  );
  for (const grade of summary.grades) {
    assert.ok(grade.count > 0, `难度 ${grade.difficulty} 列出来了就必须真有题`);
    assert.equal(
      grade.count,
      countIn({ difficulty: [grade.difficulty] }),
      `难度 ${grade.difficulty} 的题数与按该档筛出来的池子一致`,
    );
  }
  const graded = summary.grades.reduce((n, g) => n + g.count, 0);
  assert.equal(graded + summary.ungraded, summary.total, '四档之和 + 没有分级的题数 = 总题数（无分级的卡没被算进任何一档）');
  assert.equal(
    summary.ungraded,
    ALL_FLASHCARDS.filter((card) => card.source === 'amc10-concept').length,
    '"没有分级"那一行的题数就是 AMC10 概念卡的张数——界面正是这么标注的',
  );
  assert.ok(summary.ungraded > 0, '真实题库里确实有一批没有分级的卡，否则那一行没有意义');
  assert.deepEqual(
    summary.decks.map((d) => d.key),
    [...AMC10_DECKS, ...SUBJECT_DECKS],
    '卡组明细的顺序与练习页的卡组 chip 一致（AMC10 五个在前）',
  );
  assert.equal(summary.decks.reduce((n, d) => n + d.count, 0), summary.total, '各卡组题数之和 = 总题数');
  for (const deck of [...AMC10_DECKS, ...SUBJECT_DECKS]) {
    const row = summary.decks.find((d) => d.key === deck);
    assert.ok(row, `${deck} 应该在卡组明细里`);
    assert.equal(row.count, countIn({ deck }), `${deck} 的题数与按该卡组筛出来的池子一致`);
  }
  for (const deck of AMC10_DECKS) {
    const row = summary.decks.find((d) => d.key === deck);
    assert.ok(row.count > 0, `${deck} 不该是空卡组`);
    assert.equal(
      countIn({ deck, difficulty: summary.grades.map((g) => g.difficulty) }),
      0,
      `${deck} 整组是概念卡，按任何一个难度档去筛都该是空池（它们只出现在"没有分级"那一行）`,
    );
    assert.equal(countIn({ deck, kind: 'concept' }), row.count, `${deck} 整组都是概念卡，没有一张带选项`);
  }
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
 * orderCards
 * ------------------------------------------------------------------ *
 * 练习页的"按难度排序"开关（由易到难 / 由难到易）直接绑在这个函数上。
 * 三条语义在这里锁死：null = 不排序；缺难度的卡排**末尾**（不是当成 0 排到最前）；
 * 同一难度内部保持卡池原顺序（稳定）。最后两条各有专门的断言，因为它们都是"看不出错"的那种错：
 * 把 AMC10 概念卡当成 0，界面上照样能翻卡，只是学生一开排序就先看到一堆词条。
 */

/** 一张卡的难度（按 orderCards 的口径：只有正整数算一档，缺字段与 0 都算"没有"）。 */
const graded = (card) => (typeof card.difficulty === 'number' && card.difficulty > 0 ? card.difficulty : null);

/** 排序结果的难度序列，写成 "d1,d2,-" 这种形状（"-" = 没有难度）便于断言。 */
const difficultySeq = (cards) => cards.map((card) => graded(card) ?? '-').join(',');

/** 排序结果的 id 序列，用于断言稳定性。 */
const idSeq = (cards) => ids(cards).join(',');

/** 一份专门用来测排序的卡池：难度乱序、有重复档、混着"没有难度"的卡（含 0 占位）。 */
const ORDER_POOL = [
  makeCard({ id: 'o-d3a', deck: 'precalc', difficulty: 3 }),
  makeCard({ id: 'o-nodiff', deck: 'arithmetic' }), // 连字段都没有，等同 AMC10 概念卡
  makeCard({ id: 'o-d1a', deck: 'precalc', difficulty: 1 }),
  makeCard({ id: 'o-d0', deck: 'precalc', difficulty: 0 }), // 打包格式里"没有分级"的占位
  makeCard({ id: 'o-d3b', deck: 'precalc', difficulty: 3 }),
  makeCard({ id: 'o-d2', deck: 'precalc', difficulty: 2 }),
];

test('orderCards：null 表示不排序（原顺序、新数组、不改动入参）', () => {
  const before = idSeq(ORDER_POOL);
  const out = orderCards(ORDER_POOL, null);
  assert.equal(idSeq(out), before, 'order: null 必须原样保持卡池顺序，而不是顺手排一遍');
  assert.notEqual(out, ORDER_POOL, '应该是新数组，不是入参本身');
  assert.equal(idSeq(ORDER_POOL), before, '入参卡池的顺序不该被改动');
  assert.equal(out[0], ORDER_POOL[0], '不排序时元素还是原来的卡片对象（同一个引用）');
});

test('orderCards：difficulty-asc 按难度升序', () => {
  assert.equal(
    idSeq(orderCards(ORDER_POOL, 'difficulty-asc')),
    'o-d1a,o-d2,o-d3a,o-d3b,o-nodiff,o-d0',
    '1 档在前、3 档在后；两张没有难度的卡挂在末尾（0 也不算一档）',
  );
  assert.equal(
    difficultySeq(orderCards(ORDER_POOL, 'difficulty-asc')),
    '1,2,3,3,-,-',
    '升序的难度序列（- = 没有难度）',
  );
});

test('orderCards：difficulty-desc 按难度降序', () => {
  assert.equal(
    idSeq(orderCards(ORDER_POOL, 'difficulty-desc')),
    'o-d3a,o-d3b,o-d2,o-d1a,o-nodiff,o-d0',
    '降序是 3 → 2 → 1',
  );
  assert.equal(difficultySeq(orderCards(ORDER_POOL, 'difficulty-desc')), '3,3,2,1,-,-');
});

test('orderCards：没有 difficulty 的卡无论升序降序都排在末尾（不能当成 0 排到最前）', () => {
  for (const order of ['difficulty-asc', 'difficulty-desc']) {
    const out = orderCards(ORDER_POOL, order);
    const firstMissing = out.findIndex((card) => graded(card) === null);
    assert.notEqual(firstMissing, -1, `${order}：这份卡池本来就该有没难度的卡`);
    assert.ok(
      out.slice(firstMissing).every((card) => graded(card) === null),
      `${order}：第一张没难度的卡之后不该再出现带分级的卡（缺难度的卡全在末尾）`,
    );
    assert.equal(
      out.filter((card) => graded(card) === null).length,
      2,
      `${order}：缺难度的卡既不能丢、也不能被塞进某一档里`,
    );
    assert.notEqual(out[0].id, 'o-nodiff', `${order}：首张卡不能是没难度的卡`);
    assert.notEqual(out[0].id, 'o-d0', `${order}：0（打包格式的占位）同样不是"最简单的一档"`);
  }
  // 全是没难度的卡时，排序是恒等操作（AMC10 概念卡整组就是这个形状）
  const concepts = [
    makeCard({ id: 'c1', deck: 'geometry', quiz: false }),
    makeCard({ id: 'c2', deck: 'geometry', quiz: false }),
    makeCard({ id: 'c3', deck: 'geometry', quiz: false }),
  ];
  assert.equal(idSeq(orderCards(concepts, 'difficulty-asc')), 'c1,c2,c3');
  assert.equal(idSeq(orderCards(concepts, 'difficulty-desc')), 'c1,c2,c3');
});

test('orderCards：稳定排序——同一难度内部保持卡池原顺序', () => {
  const cards = [
    makeCard({ id: 'd2-first', difficulty: 2 }),
    makeCard({ id: 'd1-first', difficulty: 1 }),
    makeCard({ id: 'd2-second', difficulty: 2 }),
    makeCard({ id: 'd1-second', difficulty: 1 }),
    makeCard({ id: 'd3-only', difficulty: 3 }),
    makeCard({ id: 'd2-third', difficulty: 2 }),
  ];
  assert.equal(
    idSeq(orderCards(cards, 'difficulty-asc')),
    'd1-first,d1-second,d2-first,d2-second,d2-third,d3-only',
    '同档内按入参顺序，不被排序打乱（否则每次排序都会跳着显示，复习时无法接着看）',
  );
  assert.equal(
    idSeq(orderCards(cards, 'difficulty-desc')),
    'd3-only,d2-first,d2-second,d2-third,d1-first,d1-second',
    '降序同样稳定：变化的是档与档的先后，不是同档内部的先后',
  );
  // 末尾那组"没有难度"的卡内部也要保持原顺序
  const tail = [
    makeCard({ id: 'n1' }),
    makeCard({ id: 'n2' }),
    makeCard({ id: 'd1', difficulty: 1 }),
    makeCard({ id: 'n3' }),
  ];
  assert.equal(idSeq(orderCards(tail, 'difficulty-asc')), 'd1,n1,n2,n3', '缺难度的卡之间也按原顺序');
  assert.equal(idSeq(orderCards(tail, 'difficulty-desc')), 'd1,n1,n2,n3');
});

test('orderCards：输出是输入的排列（不丢卡、不重复、元素还是原来的对象）', () => {
  for (const order of ['difficulty-asc', 'difficulty-desc']) {
    const out = orderCards(ORDER_POOL, order);
    assert.equal(out.length, ORDER_POOL.length, `${order}：长度不变`);
    assert.deepEqual([...ids(out)].sort(), [...ids(ORDER_POOL)].sort(), `${order}：元素集合不变`);
    assert.equal(new Set(out).size, ORDER_POOL.length, `${order}：不能出现重复的卡片对象`);
    assert.ok(out.every((card) => ORDER_POOL.includes(card)), `${order}：元素应该是原来的对象`);
  }
  const before = idSeq(ORDER_POOL);
  orderCards(ORDER_POOL, 'difficulty-asc');
  orderCards(ORDER_POOL, 'difficulty-desc');
  assert.equal(idSeq(ORDER_POOL), before, '反复排序不该把入参改坏');
});

test('orderCards：空池 → 空数组；单元素与全同难度原样', () => {
  assert.deepEqual(orderCards([], 'difficulty-asc'), []);
  assert.deepEqual(orderCards([], 'difficulty-desc'), []);
  assert.deepEqual(orderCards([], null), []);
  const single = [makeCard({ id: 'solo', difficulty: 2 })];
  assert.equal(idSeq(orderCards(single, 'difficulty-asc')), 'solo');
  assert.equal(idSeq(orderCards(single, 'difficulty-desc')), 'solo');
  const same = [1, 2, 3].map((n) => makeCard({ id: `same-${n}`, difficulty: 2 }));
  assert.equal(idSeq(orderCards(same, 'difficulty-asc')), 'same-1,same-2,same-3');
  assert.equal(idSeq(orderCards(same, 'difficulty-desc')), 'same-1,same-2,same-3');
});

test('orderCards：先用 shuffleCards 打乱再排序，结果仍是有序的（排序优先于乱序）', () => {
  // 界面层让两个开关互斥，但 lib 层不做互斥：只要 order 传进来，排完就是有序的，
  // 所以即使某天界面同时为真，学生看到的也是"有序"，而不是"洗过又排了一半"。
  const shuffled = shuffleCards(ORDER_POOL, 20261015);
  assert.notEqual(idSeq(shuffled), idSeq(ORDER_POOL), '这个种子应该真的打乱了顺序');
  assert.equal(difficultySeq(orderCards(shuffled, 'difficulty-asc')), '1,2,3,3,-,-');
  assert.equal(difficultySeq(orderCards(shuffled, 'difficulty-desc')), '3,3,2,1,-,-');
});

test('orderCards：真实题库上，练习册卡组升序得到的首尾就是该卡组的最低/最高档', () => {
  const precalc = filterCards({ deck: 'precalc', level: null, difficulty: null, kind: 'quiz' });
  const levels = availableDifficulties(precalc);
  assert.ok(levels.length > 1, `precalc 卡组应该有多个难度档（${levels.join('/')}）`);
  const [min, max] = [levels[0], levels[levels.length - 1]];

  const asc = orderCards(precalc, 'difficulty-asc');
  assert.equal(asc[0].difficulty, min, '由易到难的第一张是卡组里最低档');
  assert.equal(asc[asc.length - 1].difficulty, max, '由易到难的最后一张是卡组里最高档');
  assert.deepEqual(
    asc.map((card) => card.difficulty),
    [...asc].map((card) => card.difficulty).sort((a, b) => a - b),
    '整条序列必须单调不减',
  );
  assert.equal(
    idSeq(orderCards(asc, 'difficulty-asc')),
    idSeq(asc),
    '已经有序的卡池再排一次还是同样的顺序（稳定 + 幂等）',
  );

  const desc = orderCards(precalc, 'difficulty-desc');
  assert.equal(desc[0].difficulty, max, '由难到易的第一张是最高档');
  assert.equal(desc[desc.length - 1].difficulty, min);
  assert.deepEqual(
    desc.map((card) => card.difficulty),
    [...desc].map((card) => card.difficulty).sort((a, b) => b - a),
    '整条序列必须单调不增',
  );
  assert.equal(
    idSeq(orderCards(desc, 'difficulty-desc')),
    idSeq(desc),
    '由难到易再排一次也是同样的顺序（幂等）',
  );
  assert.deepEqual([...ids(asc)].sort(), [...ids(precalc)].sort(), '排序不该丢卡或多卡');
});

test('orderCards：真实题库的混合卡池里，AMC10 概念卡整组挂在末尾且保持原顺序', () => {
  // deck 不限 + 题型不限 = 练习册/情境题的选择题 + AMC10 概念卡，正是"排序时缺难度怎么办"的真实场景
  const mixed = filterCards({ deck: null, level: null, difficulty: null, kind: null });
  const gradedCount = mixed.filter((card) => graded(card) !== null).length;
  const ungradedIds = ids(mixed.filter((card) => graded(card) === null));
  assert.ok(gradedCount > 0 && ungradedIds.length > 0, '真实卡池里两种卡都该有');

  for (const order of ['difficulty-asc', 'difficulty-desc']) {
    const out = orderCards(mixed, order);
    assert.ok(
      out.slice(0, gradedCount).every((card) => graded(card) !== null),
      `${order}：带分级的卡全在前面`,
    );
    assert.ok(
      out.slice(gradedCount).every((card) => graded(card) === null),
      `${order}：AMC10 概念卡（没有 difficulty）全在末尾，不会被当成 0 排到最前`,
    );
    assert.deepEqual(
      ids(out.slice(gradedCount)),
      ungradedIds,
      `${order}：末尾那一组内部保持卡池原顺序`,
    );
    assert.deepEqual(
      availableDifficulties(out),
      availableDifficulties(mixed),
      `${order}：排序不改变"有哪些档"，只改变先后`,
    );
  }
});

test('orderCards：真实数据上"按难度排序"与"难度筛选"可以叠用（先筛后排）', () => {
  for (const deck of SUBJECT_DECKS) {
    const pool = filterCards({ deck, level: null, difficulty: [3, 4], kind: 'quiz' });
    if (pool.length === 0) continue;
    const asc = orderCards(pool, 'difficulty-asc');
    assert.ok(
      asc.every((card) => card.difficulty === 3 || card.difficulty === 4),
      `${deck}：排序不会把没选中的档混进来`,
    );
    assert.deepEqual(
      asc.map((card) => card.difficulty),
      [...asc].map((card) => card.difficulty).sort((a, b) => a - b),
      `${deck}：筛出来的 3、4 档按升序排（3 全在 4 前面）`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * 边界
 * ------------------------------------------------------------------ */

test('边界：六个函数在空卡池上都不抛错', () => {
  assert.deepEqual(filterCards({ deck: null, level: null, difficulty: null, kind: null }, []), []);
  assert.deepEqual(availableDifficulties([]), []);
  assert.deepEqual(availableKinds(null, []), []);
  assert.deepEqual(availableKinds('precalc', []), []);
  assert.deepEqual(shuffleCards([], 0), []);
  assert.deepEqual(orderCards([], 'difficulty-asc'), []);
  assert.deepEqual(orderCards([], 'difficulty-desc'), []);
});

test('边界：单元素卡池', () => {
  const single = [makeCard({ id: 'solo', deck: 'precalc', difficulty: 1 })];
  assert.deepEqual(ids(filterCards({ deck: 'precalc', level: null, difficulty: [1], kind: 'quiz' }, single)), ['solo']);
  assert.deepEqual(filterCards({ deck: 'precalc', level: null, difficulty: [2], kind: 'quiz' }, single), []);
  assert.deepEqual(availableDifficulties(single), [1]);
  assert.deepEqual(availableKinds('precalc', single), ['quiz']);
  assert.deepEqual(ids(shuffleCards(single, 20261011)), ['solo']);
  assert.deepEqual(ids(orderCards(single, 'difficulty-asc')), ['solo']);
  assert.deepEqual(ids(orderCards(single, 'difficulty-desc')), ['solo']);
});

test('边界：难度筛选叠上未知 deck → 空数组（不抛错）', () => {
  assert.deepEqual(filterCards({ deck: 'no-such-deck', level: null, difficulty: [4], kind: null }, POOL), []);
  assert.deepEqual(filterCards({ deck: 'no-such-deck', level: 'core', difficulty: [1], kind: 'quiz' }, POOL), []);
  assert.deepEqual(availableKinds('no-such-deck', POOL), []);
});

test('边界：难度筛选用在真实数据上（AMC10 概念卡没有难度，会整组被滤掉）', () => {
  const filtered = filterCards({ deck: null, level: null, difficulty: [1], kind: null });
  assert.ok(filtered.length > 0, '真实题库里应该有难度 1 的卡');
  assert.ok(
    filtered.every((card) => card.difficulty === 1),
    '难度 1 的结果里不该混进别的难度（尤其不该混进没有难度的 AMC10 概念卡）',
  );
  assert.deepEqual(
    ids(filterCards({ deck: 'arithmetic', level: null, difficulty: [1], kind: null })),
    [],
    'AMC10 卡组用 level 分级、没有 difficulty，按难度筛就该是空池',
  );
});

test('边界：真实数据上多选两档 = 两档各自题数之和（这就是冒烟里分母的来源）', () => {
  const count = (difficulty, deck = null) =>
    filterCards({ deck, level: null, difficulty, kind: 'quiz' }).length;
  const d3 = count([3]);
  const d4 = count([4]);
  assert.ok(d3 > 0 && d4 > 0, '真实题库里 3 档和 4 档都该有题，否则冒烟没法拿它们做断言');
  assert.equal(count([3, 4]), d3 + d4, '多选是并集：两档的题数相加，既不漏也不重复');
  for (const deck of SUBJECT_DECKS) {
    assert.equal(
      count([3, 4], deck),
      count([3], deck) + count([4], deck),
      `${deck}：卡组内多选同样是"该卡组里这两档的题数之和"（冒烟里选卡组后看到的就是这个数）`,
    );
  }
  assert.equal(
    count([1, 2, 3, 4]),
    count([]),
    '四档全选与"不限"结果相同——练习册/情境题的每张卡都带 1-4 的 rubric 分级，AMC10 概念卡本来就不是选择题',
  );
});
