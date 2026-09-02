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
import { errorMessage } from '@/lib/errors';
import { withTimeout } from '@/lib/timeout';
import { useI18n } from '@/i18n';
import { useCourse } from '@/hooks/use-course';
import { COURSES, getTodayItem } from '@/data/courses';
import { isMilestoneDay } from '@/lib/badges';
import { weeklyStats } from '@/lib/weekly';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSessionUser } from '@/hooks/use-session-user';

import { useDailyGoal } from '@/hooks/use-daily-goal';
import { useIsDesktop } from '@/hooks/use-media';
import { fetchAnswers, todayAnsweredCount, type AnswerRecord } from '@/lib/answers';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 拉取所有课程的答题记录：首页进度/周报/完成日必须覆盖全部课程，不能只统计一门 */
function fetchAllAnswers(userId: string): Promise<AnswerRecord[]> {
  return Promise.all(COURSES.map((c) => fetchAnswers(userId, c.id))).then((lists) => lists.flat());
}

export default function CheckinScreen() {
  const user = useSessionUser();
  const colors = useTheme();
  const { t, formatDate } = useI18n();

  const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justChecked, setJustChecked] = useState(false);
  const [milestoneHit, setMilestoneHit] = useState<number | null>(null);
  const [goal] = useDailyGoal();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [course] = useCourse();
  const todayItem = getTodayItem(course);
  const week = weeklyStats(checkedSet, answers);

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
      Promise.all([fetchCheckins(user.id), fetchAllAnswers(user.id)]),
      10000,
    )
      .then(([dates, ans]) => {
        if (active) {
          setCheckedSet(new Set(dates));
          setAnswers(ans);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e, t));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, t]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      withTimeout(fetchAllAnswers(user.id), 10000)
        .then((ans) => {
          if (active) setAnswers(ans);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [user]),
  );

  const load = useCallback(() => {
    if (!user) return;
    setError(null);
    setLoading(true);
    withTimeout(
      Promise.all([fetchCheckins(user.id), fetchAllAnswers(user.id)]),
      10000,
    )
      .then(([dates, ans]) => {
        setCheckedSet(new Set(dates));
        setAnswers(ans);
      })
      .catch((e) => setError(errorMessage(e, t)))
      .finally(() => setLoading(false));
  }, [user, t]);

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
      const newStreak = computeStreak(new Set([...checkedSet, todayKey]));
      if (isMilestoneDay(newStreak)) {
        setMilestoneHit(newStreak);
        setTimeout(() => setMilestoneHit(null), 4000);
      }
      setTimeout(() => setJustChecked(false), 2500);
    } catch (e) {
      setError(errorMessage(e, t));
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
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.greeting, { color: colors.textSecondary }]}>
          {formatDate(new Date())}
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
              <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>{t('home.streakDays')}</Text>
              {justChecked && (
                <Text accessibilityLiveRegion="polite" style={[styles.celebrate, { color: colors.successText }]}>
                  {t('home.celebrate')}
                </Text>
              )}
              {milestoneHit !== null && (
                <Text accessibilityLiveRegion="polite" style={[styles.milestone, { color: colors.warning }]}>
                  {t('home.milestone', { days: milestoneHit })}
                </Text>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.checkinButton,
                { backgroundColor: todayChecked ? colors.success : colors.primary },
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
              onPress={onCheckIn}
              disabled={busy || todayChecked}>
              <Text style={styles.checkinButtonText}>
                {todayChecked ? t('home.checkedIn') : t('home.checkIn')}
              </Text>
            </Pressable>

            {todayChecked && (
              <Pressable onPress={onUndo} disabled={busy}>
                <Text style={[styles.undoText, { color: colors.textSecondary }]}>{t('home.undoCheckIn')}</Text>
              </Pressable>
            )}

            <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
              <View style={styles.progressHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t('home.todayPractice')}</Text>
                <Text style={[styles.progressCount, { color: colors.textSecondary }]}>
                  {dayCompleted ? t('home.progressDone') : t('home.progressCount', { done: todayAnswered, goal })}
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
                  ? t('home.goalDoneHint')
                  : t('home.goalHint', { goal })}
              </Text>
            </View>

            {error && (
              <View style={styles.errorWrap}>
                <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.errorText }]}>
                  {error}
                </Text>
                {!loading && (
                  <Pressable onPress={load} disabled={busy}>
                    <Text style={[styles.retryText, { color: colors.primary }]}>{t('common.retry')}</Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
              <View style={styles.progressHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t('home.todayLesson')}</Text>
                <Pressable onPress={() => router.push('/study')} accessibilityRole="link">
                  <Text style={[styles.goStudy, { color: colors.primary }]}>{t('home.goStudy')} →</Text>
                </Pressable>
              </View>
              <Text style={[styles.lessonTitle, { color: colors.text }]} numberOfLines={1}>
                [{course.shortName}] {todayItem.title}
              </Text>
              <Text style={[styles.lessonBody, { color: colors.textSecondary }]} numberOfLines={2}>
                {todayItem.body}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('home.weekly')}</Text>
              {week.answered > 0 ? (
                <Text style={[styles.lessonBody, { color: colors.textSecondary }]}>
                  {t('home.weeklySummary', {
                    checked: week.checked,
                    total: week.total,
                    answered: week.answered,
                    rate: week.rate ?? 0,
                  })}
                </Text>
              ) : (
                <Text style={[styles.lessonBody, { color: colors.textSecondary }]}>
                  {t('home.weeklyEmpty')}
                </Text>
              )}
            </View>

            <View style={[styles.twoCol, isDesktop && styles.twoColRow]}>
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card, isDesktop && styles.twoColCard]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t('home.calendar')}</Text>
                <View style={styles.calendarWrap}>
                  <StreakCalendar checkedSet={checkedSet} completedSet={completedSet} />
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.successLight }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('home.legendChecked')}</Text>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('home.legendCompleted')}</Text>
                  <View style={[styles.legendDot, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.warning }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('home.legendToday')}</Text>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card, isDesktop && styles.twoColCard]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t('home.stats')}</Text>
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={[styles.statNumber, { color: colors.text }]}>
                      {checkedSet.size}
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('home.totalCheckins')}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={[styles.statNumber, { color: colors.text }]}>{streak}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('home.currentStreak')}</Text>
                  </View>
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
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  greeting: { fontSize: 13, alignSelf: 'flex-start' },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  streakHero: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.three },
  flame: { fontSize: 64 },
  streakNumber: { fontSize: 56, fontWeight: '900' },
  streakLabel: { fontSize: 15 },
  celebrate: { fontSize: 15, fontWeight: '700', marginTop: Spacing.one },
  milestone: { fontSize: 16, fontWeight: '800', marginTop: Spacing.one },
  goStudy: { fontSize: 14, fontWeight: '700' },
  lessonTitle: { fontSize: 15, fontWeight: '700' },
  lessonBody: { fontSize: 13, lineHeight: 19 },
  checkinButton: {
    borderRadius: Radius.lg,
    minHeight: 44,
    paddingHorizontal: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  checkinButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  undoText: { fontSize: 13, marginTop: Spacing.one },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  errorWrap: { alignItems: 'center', gap: Spacing.two },
  error: { fontSize: 13 },
  retryText: { fontSize: 14, fontWeight: '700' },
  card: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  twoCol: { alignSelf: 'stretch', gap: Spacing.three },
  twoColRow: { flexDirection: 'row' },
  twoColCard: { flex: 1 },
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
