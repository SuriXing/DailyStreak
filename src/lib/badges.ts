import { fromDateKey } from '@/lib/checkins';

/** 连胜里程碑（天），研究建议的单维度成就体系 */
export const MILESTONES = [7, 30, 90, 180, 365] as const;

function isConsecutive(a: string, b: string): boolean {
  const da = fromDateKey(a).getTime();
  const db = fromDateKey(b).getTime();
  return db - da === 86400000;
}

/** 历史最长连续打卡天数 */
export function maxStreak(checkedSet: Set<string>): number {
  const dates = [...checkedSet].sort();
  let max = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of dates) {
    cur = prev && isConsecutive(prev, d) ? cur + 1 : 1;
    if (cur > max) max = cur;
    prev = d;
  }
  return max;
}

/** 已达成 / 未达成的里程碑列表 */
export function milestoneStatus(max: number): { days: number; earned: boolean }[] {
  return MILESTONES.map((days) => ({ days, earned: max >= days }));
}

/** 今天是否刚达成某个里程碑（用于打卡时的庆祝） */
export function isMilestoneDay(streak: number): boolean {
  return (MILESTONES as readonly number[]).includes(streak);
}
