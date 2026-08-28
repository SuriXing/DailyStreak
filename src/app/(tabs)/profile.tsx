import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { computeStreak, fetchCheckins } from '@/lib/checkins';
import { COURSES } from '@/data/courses';
import { computeMastery, fetchAnswers, type AnswerRecord } from '@/lib/answers';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useSessionUser } from '@/hooks/use-session-user';
import { DAILY_GOALS, useDailyGoal, type DailyGoal } from '@/hooks/use-daily-goal';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 给请求加超时，避免慢网络下无限转圈 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('网络超时')), ms);
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

export default function ProfileScreen() {
  const user = useSessionUser();
  const colors = useTheme();

  const [checkedSet, setCheckedSet] = useState<Set<string> | null>(null);
  const [answersByCourse, setAnswersByCourse] = useState<Record<string, AnswerRecord[]>>({});
  const [signingOut, setSigningOut] = useState(false);
  const [goal, setGoal] = useDailyGoal();

  useEffect(() => {
    if (!user) return;
    let active = true;
    withTimeout(fetchCheckins(user.id), 10000)
      .then((dates) => {
        if (active) setCheckedSet(new Set(dates));
      })
      .catch(() => {
        if (active) setCheckedSet(new Set());
      });
    withTimeout(Promise.all(COURSES.map((c) => fetchAnswers(user.id, c.id))), 10000)
      .then((lists) => {
        if (active) {
          const map: Record<string, AnswerRecord[]> = {};
          COURSES.forEach((c, i) => {
            map[c.id] = lists[i];
          });
          setAnswersByCourse(map);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  // 安全网：15 秒后无论请求是否完成，统计区都停止转圈
  useEffect(() => {
    const timer = setTimeout(() => {
      setCheckedSet((prev) => prev ?? new Set());
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  async function onSignOut() {
    if (!isSupabaseConfigured || signingOut) return;
    setSigningOut(true);
    await getSupabase().auth.signOut();
    setSigningOut(false);
  }

  const nickname =
    (user?.user_metadata?.username as string | undefined) ||
    (user?.email ?? '').split('@')[0] ||
    'Suri';
  const total = checkedSet?.size ?? null;
  const streak = checkedSet ? computeStreak(checkedSet) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{nickname.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={[styles.nickname, { color: colors.text }]}>{nickname}</Text>
          <Text style={[styles.email, { color: colors.textSecondary }]}>{user?.email}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {total === null ? '…' : total}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>累计打卡</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              {streak === null ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.statNumber, { color: colors.text }]}>{streak}</Text>
              )}
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>当前连胜</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>课程掌握度</Text>
          {COURSES.map((c) => {
            const mastery = computeMastery(c, answersByCourse[c.id] ?? []);
            return (
              <View key={c.id} style={styles.masteryRow}>
                <View style={[styles.masteryBadge, { backgroundColor: c.color }]}>
                  <Text style={styles.masteryBadgeText}>{c.shortName}</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.fillTertiary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: c.color, width: `${mastery.percent}%` },
                    ]}
                  />
                </View>
                <Text style={[styles.masteryPercent, { color: colors.textSecondary }]}>
                  {mastery.percent}%
                </Text>
              </View>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>每日目标</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            保底 3 题 · 推荐 5 题 · 冲刺 10 题（业界研究建议 3-10 分钟/天）
          </Text>
          <View style={styles.goalRow}>
            {DAILY_GOALS.map((g) => {
              const active = goal === g;
              return (
                <Pressable
                  key={g}
                  style={({ pressed }) => [
                    styles.goalChip,
                    {
                      backgroundColor: active ? colors.primary : colors.backgroundElement,
                      borderColor: active ? colors.primary : colors.border,
                    },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setGoal(g as DailyGoal)}
                  accessibilityState={{ selected: active }}>
                  <Text
                    style={[styles.goalChipText, { color: active ? '#fff' : colors.text }]}>
                    {g} 题
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.signOut,
            { backgroundColor: colors.backgroundElement },
            pressed && styles.pressed,
          ]}
          onPress={onSignOut}
          disabled={signingOut}>
          {signingOut ? (
            <ActivityIndicator color="#ff4d4f" />
          ) : (
            <Text style={styles.signOutText}>退出登录</Text>
          )}
        </Pressable>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          DailyStreak · 每天进步一点点
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  avatarWrap: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#1677ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  nickname: { fontSize: 22, fontWeight: '800' },
  email: { fontSize: 13 },
  card: { borderRadius: Radius.lg, padding: Spacing.four },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.one },
  statDivider: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: '#A0A4AB' },
  statNumber: { fontSize: 30, fontWeight: '900' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardHint: { fontSize: 12, lineHeight: 18 },
  masteryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  masteryBadge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  masteryBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  masteryPercent: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },
  goalRow: { flexDirection: 'row', gap: Spacing.two },
  goalChip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
  },
  goalChipText: { fontSize: 14, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  signOut: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#ff4d4f', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: Spacing.two },
});
