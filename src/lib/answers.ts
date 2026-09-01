import type { Course, StudyItem } from '@/data/courses';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { toDateKey } from '@/lib/checkins';

export interface AnswerRecord {
  id: number;
  course_id: string;
  item_id: string;
  correct: boolean;
  answered_at: string;
}

/** SRS 阶梯间隔（天）：连续答对 1/2/3+ 次后下次复习间隔 */
const INTERVALS = [1, 3, 7, 14];

export interface ItemState {
  itemId: string;
  correctStreak: number;
  lastAnsweredAt: string | null;
  nextReviewAt: string | null;
  due: boolean;
}

export async function fetchAnswers(userId: string, courseId: string): Promise<AnswerRecord[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from('answers')
    .select('id, course_id, item_id, correct, answered_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .order('answered_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AnswerRecord[];
}

export async function recordAnswer(
  userId: string,
  courseId: string,
  itemId: string,
  correct: boolean,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase().from('answers').insert({
    user_id: userId,
    course_id: courseId,
    item_id: itemId,
    correct,
  });
  if (error) throw new Error(error.message);
}

/** 按条目聚合答题历史，计算 SRS 状态 */
export function computeItemStates(answers: AnswerRecord[]): Map<string, ItemState> {
  const byItem = new Map<string, AnswerRecord[]>();
  for (const a of answers) {
    const list = byItem.get(a.item_id) ?? [];
    list.push(a);
    byItem.set(a.item_id, list);
  }
  const states = new Map<string, ItemState>();
  const now = Date.now();
  for (const [itemId, list] of byItem) {
    // 从最近一次往回数连续答对；遇到任何一次答错即停（答错会重置连击）
    let streak = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].correct) {
        streak += 1;
      } else {
        break;
      }
    }
    const last = list[list.length - 1].answered_at;
    const lastTs = new Date(last).getTime();
    const intervalDays = INTERVALS[Math.min(Math.max(streak, 0), INTERVALS.length - 1)];
    const next = lastTs + intervalDays * 86400000;
    states.set(itemId, {
      itemId,
      correctStreak: streak,
      lastAnsweredAt: last,
      nextReviewAt: new Date(next).toISOString(),
      due: next <= now,
    });
  }
  return states;
}

export interface SessionPlan {
  reviews: StudyItem[];
  news: StudyItem[];
  total: number;
}

/**
 * 构建今日练习会话：复习优先（最多 3 道到期题），动态补新题到每日目标。
 * 复习积压大时自动少出新题（墨墨式防复习雪球）。
 */
export function buildSessionPlan(course: Course, answers: AnswerRecord[], goal: number): SessionPlan {
  const states = computeItemStates(answers);
  const reviewed = new Set<string>();
  const news: StudyItem[] = [];
  const reviews: StudyItem[] = [];

  const dueItems = course.items
    .filter((it) => states.get(it.id)?.due)
    .sort((a, b) => {
      const ta = states.get(a.id)?.nextReviewAt ?? '';
      const tb = states.get(b.id)?.nextReviewAt ?? '';
      return ta.localeCompare(tb);
    });

  for (const it of dueItems) {
    if (reviews.length >= 3) break;
    reviews.push(it);
    reviewed.add(it.id);
  }

  for (const it of course.items) {
    if (news.length >= goal - reviews.length) break;
    if (!reviewed.has(it.id) && !states.has(it.id)) news.push(it);
  }

  return { reviews, news, total: reviews.length + news.length };
}

/** 单条目掌握分：0=尝试过 / 50=熟悉 / 80=精通 / 100=掌握（连续答对 3+ 次） */
export function masteryScore(state: ItemState | undefined): number {
  if (!state) return 0;
  if (state.correctStreak >= 3) return 100;
  if (state.correctStreak === 2) return 80;
  if (state.correctStreak === 1) return 50;
  return 0;
}

export interface CourseMastery {
  percent: number;
  bySkill: { skill: string; percent: number }[];
}

/** 课程掌握度：按技能聚合（Khan 式 100 分制） */
export function computeMastery(course: Course, answers: AnswerRecord[]): CourseMastery {
  const states = computeItemStates(answers);
  const bySkill = new Map<string, { earned: number; total: number }>();
  for (const it of course.items) {
    const bucket = bySkill.get(it.skill) ?? { earned: 0, total: 100 };
    bucket.earned += masteryScore(states.get(it.id));
    bucket.total += 100;
    bySkill.set(it.skill, bucket);
  }
  const skills = [...bySkill.entries()].map(([skill, b]) => ({
    skill,
    percent: Math.round((b.earned / b.total) * 100),
  }));
  const totalEarned = [...bySkill.values()].reduce((s, b) => s + b.earned, 0);
  const totalAll = [...bySkill.values()].reduce((s, b) => s + b.total, 0);
  return { percent: Math.round((totalEarned / totalAll) * 100), bySkill: skills };
}

/** 清除今天（本地日期）记录的全部答题，用于"重新做一遍" */
export async function clearTodayAnswers(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { error } = await getSupabase()
    .from('answers')
    .delete()
    .eq('user_id', userId)
    .gte('answered_at', startOfDay.toISOString());
  if (error) throw new Error(error.message);
}

/** 今天已答题目数（按本地日期） */
export function todayAnsweredCount(answers: AnswerRecord[]): number {
  const today = toDateKey(new Date());
  return answers.filter((a) => toDateKey(new Date(a.answered_at)) === today).length;
}
