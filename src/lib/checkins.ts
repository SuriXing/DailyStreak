import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/** 本地日期 → 'YYYY-MM-DD'（避免时区偏差） */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' → 本地日期 */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface CheckinRecord {
  id: number;
  user_id: string;
  checkin_date: string;
  created_at: string;
}

export async function fetchCheckins(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from('checkins')
    .select('checkin_date')
    .eq('user_id', userId)
    .order('checkin_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.checkin_date as string);
}

export async function checkInToday(userId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase 未配置');
  const { error } = await getSupabase().from('checkins').insert({
    user_id: userId,
    checkin_date: toDateKey(new Date()),
  });
  if (error) throw new Error(error.message);
}

export async function undoCheckIn(userId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase 未配置');
  const { error } = await getSupabase()
    .from('checkins')
    .delete()
    .eq('user_id', userId)
    .eq('checkin_date', toDateKey(new Date()));
  if (error) throw new Error(error.message);
}

/**
 * 计算连续打卡天数（Duolingo 规则）：
 * 今天已打卡 → 从今天往前数；今天还没打卡 → 从昨天往前数（今天仍可保住连胜）
 */
export function computeStreak(checkedSet: Set<string>): number {
  const cursor = new Date();
  if (!checkedSet.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (checkedSet.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 最近 N 周的打卡格子（每列一周，从周一开始，今天在最后一列） */
export function buildWeekGrid(checkedSet: Set<string>, weeks = 12) {
  const today = new Date();
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay())); // 本周日
  const cells: { dateKey: string; day: number; checked: boolean }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(endOfWeek);
      date.setDate(endOfWeek.getDate() - (w * 7 + (6 - d)));
      const dateKey = toDateKey(date);
      cells.push({ dateKey, day: d, checked: checkedSet.has(dateKey) });
    }
  }
  return cells;
}
