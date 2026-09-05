import { AMC10_DECKS, AMC10_FLASHCARDS } from './amc10-flashcards';
import { SUBJECT_DECKS, SUBJECT_FLASHCARDS } from './subject-decks/csa';

export type FlashcardLevel = 'core' | 'advance' | 'boundary';

export interface Flashcard {
  id: string;
  deck: string;
  category: string;
  front: string;
  back: string;
  /** AMC10-only: 难度分层 */
  level?: FlashcardLevel;
}

export interface FlashcardDeck {
  key: string;
  label: string;
  /** 是否有 core/advance/boundary 层级筛选（目前仅 AMC10） */
  hasLevels: boolean;
}

export const FLASHCARD_DECKS: FlashcardDeck[] = [
  ...AMC10_DECKS.map((d) => ({ key: d.key, label: d.label, hasLevels: true })),
  ...SUBJECT_DECKS.map((d) => ({ key: d.key, label: d.label, hasLevels: false })),
];

export const ALL_FLASHCARDS: Flashcard[] = [
  ...AMC10_FLASHCARDS.map((c) => ({
    id: c.id,
    deck: c.deck,
    category: c.category,
    front: c.front,
    back: c.back,
    level: c.level,
  })),
  ...SUBJECT_FLASHCARDS.map((c) => ({
    id: c.id,
    deck: c.deck,
    category: c.category,
    front: c.front,
    back: c.back,
  })),
];
