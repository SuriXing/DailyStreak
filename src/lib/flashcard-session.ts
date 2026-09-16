import { ALL_FLASHCARDS, toQuiz, type Flashcard, type FlashcardLevel } from '@/data/flashcards';

/** 卡片题型：带选项可点选的是选择题，其余（AMC10 知识卡）靠翻面复习。 */
export type CardKind = 'quiz' | 'concept';

/** 一场自由练的筛选条件；某维度为 null 表示不限。 */
export interface SessionFilter {
  deck: string | null;
  level: FlashcardLevel | null;
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
  return cards.filter(
    (card) =>
      (filter.deck == null || card.deck === filter.deck) &&
      (filter.level == null || card.level === filter.level) &&
      (filter.kind == null || cardKind(card) === filter.kind),
  );
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
