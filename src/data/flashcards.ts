// 卡片数据在 bundle 里是 gzip+base64 块（scripts/pack-decks.mjs 打包），这里只做解开。
import { AMC10_DECKS, AMC10_FLASHCARDS, SUBJECT_DECKS, SUBJECT_FLASHCARDS } from './deck-pack-loader';

export type FlashcardLevel = 'core' | 'advance' | 'boundary';

/**
 * 卡片文本来源，与生成脚本写进数据模块的字面量类型一一对应：
 * - amc10-concept：依据考点审计把 AMC10 知识点拆成的问答卡，不是真题；
 * - ai-mcq：AI 生成的 AP 原创选择题，不是 College Board 真题。
 */
export type FlashcardSource = 'amc10-concept' | 'ai-mcq';

export interface Flashcard {
  id: string;
  deck: string;
  category: string;
  front: string;
  back: string;
  /** AMC10-only: 难度分层 */
  level?: FlashcardLevel;
  /** 文本来源，界面据此标注这是哪一种"AI 生成" */
  source: FlashcardSource;
  /** 是否经过逐题独立验算/事实核查；当前全部为 false */
  verified: boolean;
}

/** 选项行可能连着两层标签（生成脚本回归时会产出 "A. A. 3"），一次性剥干净。 */
const OPTION_LABELS = /^(?:[A-D]\.\s*)+/;

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
 * 题干可以有多行：源资料里用 <br> 换行的代码题会生成"题干\n代码\nA. …"，
 * 所以选项块要从第一行 "A. " 开始找，不能假设它固定在第 2 行。
 */
export function toQuiz(card: Flashcard): QuizCard | null {
  const lines = card.front.split('\n');
  const first = lines.findIndex((l) => /^A\.\s/.test(l));
  if (first < 1) return null;
  const question = lines.slice(0, first).join('\n').trim();
  const options = lines.slice(first).map((l) => l.trim().replace(OPTION_LABELS, '').trim());
  if (!question || options.length < 2 || options.some((o) => !o)) return null;
  const answer = card.back.match(/(?:答案：|Answer[:：])\s*([A-D])/);
  if (!answer) return null;
  const answerIndex = answer[1].charCodeAt(0) - 65;
  if (answerIndex >= options.length) return null;
  const explanation =
    card.back
      .split('\n')
      .find((l) => /^(简析：|Why[:：])/.test(l))
      ?.replace(/^(简析：|Why[:：])\s*/, '')
      .trim() ?? '';
  return { question, options, answerIndex, explanation };
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
    source: c.source,
    verified: c.verified,
  })),
  ...SUBJECT_FLASHCARDS.map((c) => ({
    id: c.id,
    deck: c.deck,
    category: c.category,
    front: c.front,
    back: c.back,
    source: c.source,
    verified: c.verified,
  })),
];
