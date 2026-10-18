import { ALL_FLASHCARDS, toQuiz, type Flashcard, type FlashcardLevel } from '@/data/flashcards';

/** 卡片题型：带选项可点选的是选择题，其余（AMC10 知识卡）靠翻面复习。 */
export type CardKind = 'quiz' | 'concept';

/** 一场自由练的筛选条件；某维度为 null 表示不限。 */
export interface SessionFilter {
  deck: string | null;
  level: FlashcardLevel | null;
  /**
   * 选中的难度集合（练习册与情境题的 1-4；AMC10 概念卡用 level 而不是这个）。
   *
   * 语义：**null 与空数组都表示不限**（界面上"一个档都没选"就是空数组，
   * 不必再区分"没选"和"不限"两种状态），非空时保留 difficulty 落在集合里的卡片——
   * 于是 [3, 4] 是"只要 3 和 4"的并集，而不是单选时代那种"最后一个点中的档"。
   * 0 是一个真实取值（打包格式里"没有分级"的占位），但它只能靠显式选中 [0] 命中。
   */
  difficulty?: readonly number[] | null;
  kind: CardKind | null;
}

export function cardKind(card: Flashcard): CardKind {
  return toQuiz(card) ? 'quiz' : 'concept';
}

/** 按筛选条件取卡，默认作用于全部卡片。 */
export function filterCards(
  filter: SessionFilter,
  cards: readonly Flashcard[] = ALL_FLASHCARDS,
): Flashcard[] {
  // null 与空数组等价：都表示"不限难度"。非空时按集合命中（多选是并集，与选中顺序无关）。
  const wanted = filter.difficulty ?? [];
  return cards.filter((card) => {
    const hitDifficulty =
      wanted.length === 0 || (card.difficulty !== undefined && wanted.includes(card.difficulty));
    return (
      (filter.deck == null || card.deck === filter.deck) &&
      (filter.level == null || card.level === filter.level) &&
      hitDifficulty &&
      (filter.kind == null || cardKind(card) === filter.kind)
    );
  });
}

/**
 * 一张卡在"难度"这个维度上算不算一档：只有正整数才算。
 *
 * 三件事在这里统一：练习册与情境题的 1-4 是真实分级；AMC10 概念卡连 `difficulty` 字段
 * 都没有（undefined）；打包格式给"没有分级"写的是 0（见 scripts/pack-decks.mjs 的 packCard）。
 * 0 与负数都不是一档，所以排序时不能把它们当成"最简单的题"。
 */
function gradedDifficulty(card: Flashcard): number | null {
  return typeof card.difficulty === 'number' && card.difficulty > 0 ? card.difficulty : null;
}

/** 当前卡池里出现过的难度级别（升序），供筛选行渲染。 */
export function availableDifficulties(cards: readonly Flashcard[]): number[] {
  const seen = new Set<number>();
  // 0 是"这张卡没有分级"的占位，不该变成界面上的一个筛选项
  for (const card of cards) {
    const d = gradedDifficulty(card);
    if (d !== null) seen.add(d);
  }
  return [...seen].sort((a, b) => a - b);
}

/** 会话的排序方式；null = 不排序（保持卡池原来的顺序）。 */
export type CardOrder = 'difficulty-asc' | 'difficulty-desc' | null;

/**
 * 按难度排序，供"从简单到难 / 从难到简单"地过一遍用。
 *
 * 语义（三条都由 scripts/test-session-logic.mjs 锁住）：
 * - `order === null` → 不排序：返回卡池原顺序的副本（不是把卡池本身排序）。
 * - **没有难度的卡一律排在末尾**，升序降序都一样：AMC10 概念卡没有 `difficulty` 字段，
 *   打包格式里也可能写成 0。若把缺失值当成 0，选了"由易到难"的学生会先看到一堆
 *   "XX 是什么？"的词条，而这正是排序想避开的；它们没有难度这个维度，
 *   所以只在"排序过的那部分之后"按原相对顺序挂在队尾，而不是插在某一档里。
 * - **同一难度内部保持卡池里的相对顺序**（稳定排序）：所以"由易到难"在一个卡组里
 *   就是"按文件的出题顺序把 1 档读完、再读 2 档……"。这里显式用原下标兜底比较，
 *   不依赖 Array.prototype.sort 的稳定性（引擎实现虽然已经稳定，但这是对外承诺的一部分）。
 */
export function orderCards(cards: readonly Flashcard[], order: CardOrder): Flashcard[] {
  if (order === null) return [...cards];
  const direction = order === 'difficulty-asc' ? 1 : -1;
  return cards
    .map((card, index) => ({ card, index, difficulty: gradedDifficulty(card) }))
    .sort((a, b) => {
      // 缺难度的一律去末尾：两个都缺就保持原来的相对顺序
      if (a.difficulty === null && b.difficulty === null) return a.index - b.index;
      if (a.difficulty === null) return 1;
      if (b.difficulty === null) return -1;
      if (a.difficulty !== b.difficulty) return (a.difficulty - b.difficulty) * direction;
      return a.index - b.index;
    })
    .map((entry) => entry.card);
}

/**
 * 某个卡组里实际存在的题型。
 * AMC10 卡组整组都是概念卡，题型筛选在那里没有意义，界面据此决定要不要显示这一行。
 */
export function availableKinds(
  deck: string | null,
  cards: readonly Flashcard[] = ALL_FLASHCARDS,
): CardKind[] {
  const kinds = new Set(filterCards({ deck, level: null, kind: null }, cards).map(cardKind));
  return (['quiz', 'concept'] as CardKind[]).filter((kind) => kinds.has(kind));
}

/**
 * 确定性乱序（mulberry32）：同一个种子给出同一个顺序，
 * 这样一次会话里"上一张/下一张"稳定可复现，冒烟测试也能断言顺序。
 */
export function shuffleCards<T>(cards: readonly T[], seed: number): T[] {
  const out = [...cards];
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
