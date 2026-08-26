import { useCallback, useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justChecked, setJustChecked] = useState(false);

  const todayKey = toDateKey(new Date());
  const todayChecked = checkedSet.has(todayKey);
  const streak = computeStreak(checkedSet);

  useEffect(() => {
    if (!user) return;
    let active = true;
    withTimeout(fetchCheckins(user.id), 10000)
      .then((dates) => {
        if (active) setCheckedSet(new Set(dates));
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
    withTimeout(fetchCheckins(user.id), 10000)
      .then((dates) => setCheckedSet(new Set(dates)))
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
                <StreakCalendar checkedSet={checkedSet} />
              </View>
              <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                最近 12 周 · 橙色边框 = 今天
              </Text>
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
  cardHint: { fontSize: 11 },
  calendarWrap: { alignItems: 'flex-start' },
  statsRow: { flexDirection: 'row', gap: Spacing.five },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.half },
  statNumber: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12 },
});
