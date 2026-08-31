import { toDateKey } from '@/lib/checkins';
import type { AnswerRecord } from '@/lib/answers';

export interface WeeklyStats {
  /** 过去 7 天打卡天数 */
  checked: number;
  total: number;
  /** 过去 7 天答题数 / 正确数 / 正确率（无答题时为 null） */
  answered: number;
  correct: number;
  rate: number | null;
}

/** 本周（过去 7 天含今天）学习概览 */
export function weeklyStats(checkedSet: Set<string>, answers: AnswerRecord[]): WeeklyStats {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toDateKey(d));
  }
  const checked = days.filter((d) => checkedSet.has(d)).length;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const week = answers.filter((a) => new Date(a.answered_at) >= cutoff);
  const correct = week.filter((a) => a.correct).length;

  return {
    checked,
    total: 7,
    answered: week.length,
    correct,
    rate: week.length > 0 ? Math.round((correct / week.length) * 100) : null,
  };
}
