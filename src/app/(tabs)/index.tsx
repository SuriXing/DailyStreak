import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StreakCalendar } from '@/components/streak-calendar';
import {
  checkInToday,
  computeStreak,
  fetchCheckins,
  toDateKey,
  undoCheckIn,
} from '@/lib/checkins';
import { useSessionUser } from '@/hooks/use-session-user';
import { useDailyGoal } from '@/hooks/use-daily-goal';
import { fetchAnswers, todayAnsweredCount, type AnswerRecord } from '@/lib/answers';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 给请求加超时，避免慢网络下无限转圈 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('网络超时，请检查网络后重试')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export default function CheckinScreen() {
  const user = useSessionUser();
  const colors = useTheme();

  const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justChecked, setJustChecked] = useState(false);
  const [goal] = useDailyGoal();

  const todayKey = toDateKey(new Date());
  const todayChecked = checkedSet.has(todayKey);
  const streak = computeStreak(checkedSet);
  const todayAnswered = todayAnsweredCount(answers);
  const dayCompleted = todayAnswered >= goal;
  /** 完成过当日题量的日期集合（双层日历） */
  const completedSet = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const a of answers) {
      const k = toDateKey(new Date(a.answered_at));
      byDate.set(k, (byDate.get(k) ?? 0) + 1);
    }
    return new Set([...byDate.entries()].filter(([, n]) => n >= goal).map(([k]) => k));
  }, [answers, goal]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    withTimeout(
      Promise.all([fetchCheckins(user.id), fetchAnswers(user.id, 'csa')]),
      10000,
    )
      .then(([dates, ans]) => {
        if (active) {
          setCheckedSet(new Set(dates));
          setAnswers(ans);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const load = useCallback(() => {
    if (!user) return;
    setError(null);
    setLoading(true);
    withTimeout(
      Promise.all([fetchCheckins(user.id), fetchAnswers(user.id, 'csa')]),
      10000,
    )
      .then(([dates, ans]) => {
        setCheckedSet(new Set(dates));
        setAnswers(ans);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [user]);

  async function onCheckIn() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checkInToday(user.id);
      setCheckedSet((prev) => {
        const next = new Set(prev);
        next.add(todayKey);
        return next;
      });
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '打卡失败，请检查网络');
    } finally {
      setBusy(false);
    }
  }

  async function onUndo() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      await undoCheckIn(user.id);
      setCheckedSet((prev) => {
        const next = new Set(prev);
        next.delete(todayKey);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.greeting, { color: colors.textSecondary }]}>
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            <View style={styles.streakHero}>
              <Text style={styles.flame}>🔥</Text>
              <Text style={[styles.streakNumber, { color: colors.text }]}>{streak}</Text>
              <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>天连胜</Text>
              {justChecked && (
                <Text accessibilityLiveRegion="polite" style={styles.celebrate}>
                  🎉 今日打卡成功！
                </Text>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.checkinButton,
                todayChecked && styles.checkinButtonDone,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
              onPress={onCheckIn}
              disabled={busy || todayChecked}>
              <Text style={styles.checkinButtonText}>
                {todayChecked ? '✅ 今日已打卡' : '📌 今日打卡'}
              </Text>
            </Pressable>

            {todayChecked && (
              <Pressable onPress={onUndo} disabled={busy}>
                <Text style={[styles.undoText, { color: colors.textSecondary }]}>撤销今日打卡</Text>
              </Pressable>
            )}

            <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
              <View style={styles.progressHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>今日练习</Text>
                <Text style={[styles.progressCount, { color: colors.textSecondary }]}>
                  {dayCompleted ? '✅ 已完成' : `${todayAnswered}/${goal} 题`}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.fillTertiary }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: dayCompleted ? colors.success : colors.primary,
                      width: `${Math.min((todayAnswered / goal) * 100, 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                {dayCompleted
                  ? '今日目标已完成，去学习页看明天的内容吧'
                  : `完成今日 ${goal} 题后，当天会从"已打卡"升级为"已完成"`}
              </Text>
            </View>

            {error && (
              <View style={styles.errorWrap}>
                <Text accessibilityLiveRegion="polite" style={styles.error}>
                  {error}
                </Text>
                {!loading && (
                  <Pressable onPress={load} disabled={busy}>
                    <Text style={[styles.retryText, { color: colors.primary }]}>重试</Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>打卡日历</Text>
              <View style={styles.calendarWrap}>
                <StreakCalendar checkedSet={checkedSet} completedSet={completedSet} />
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#B7EB8F' }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>已打卡</Text>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>已完成题量</Text>
                <View style={[styles.legendDot, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.warning }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>今天</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>统计</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statNumber, { color: colors.text }]}>
                    {checkedSet.size}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>累计打卡</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statNumber, { color: colors.text }]}>{streak}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>当前连胜</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three, alignItems: 'center' },
  greeting: { fontSize: 13, alignSelf: 'flex-start' },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  streakHero: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.three },
  flame: { fontSize: 64 },
  streakNumber: { fontSize: 56, fontWeight: '900' },
  streakLabel: { fontSize: 15 },
  celebrate: { color: '#52c41a', fontSize: 15, fontWeight: '700', marginTop: Spacing.one },
  checkinButton: {
    backgroundColor: '#1677ff',
    borderRadius: Radius.lg,
    minHeight: 48,
    paddingHorizontal: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  checkinButtonDone: { backgroundColor: '#52c41a' },
  checkinButtonText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  undoText: { fontSize: 13, marginTop: Spacing.one },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  errorWrap: { alignItems: 'center', gap: Spacing.two },
  error: { color: '#ff4d4f', fontSize: 13 },
  retryText: { fontSize: 14, fontWeight: '700' },
  card: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressCount: { fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 10 },
  cardHint: { fontSize: 11 },
  calendarWrap: { alignItems: 'flex-start' },
  statsRow: { flexDirection: 'row', gap: Spacing.five },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.half },
  statNumber: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12 },
});
