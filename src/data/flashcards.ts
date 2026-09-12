import { AMC10_DECKS, AMC10_FLASHCARDS } from './amc10-flashcards';
import { SUBJECT_DECKS, SUBJECT_FLASHCARDS } from './subject-decks';

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

/** 结构化题目卡片（从 "题干\nA. …\nB. …" + "答案：X" 解析而来） */
export interface QuizCard {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

/**
 * 若卡片 front 带 "A. …/B. …" 选项、back 带 "答案：X"，则解析成可点选的单选题；
 * 否则（如 AMC10 概念卡）返回 null，走"翻面"。
 */
export function toQuiz(card: Flashcard): QuizCard | null {
  const lines = card.front.split('\n');
  if (lines.length < 2 || !/^[A-D]\.\s/.test(lines[1] ?? '')) return null;
  const question = (lines[0] || '').trim();
  const options = lines.slice(1).map((l) => l.replace(/^[A-D]\.\s*/, '').trim());
  const answer = card.back.match(/答案：([A-D])/);
  if (!answer) return null;
  const explanation =
    card.back.split('\n').find((l) => l.startsWith('简析：'))?.replace('简析：', '').trim() ?? '';
  return { question, options, answerIndex: answer[1].charCodeAt(0) - 65, explanation };
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
