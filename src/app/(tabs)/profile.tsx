import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { computeStreak, fetchCheckins } from '@/lib/checkins';
import { COURSES } from '@/data/courses';
import { computeMastery, fetchAnswers, type AnswerRecord } from '@/lib/answers';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { withTimeout } from '@/lib/timeout';
import { useSessionUser } from '@/hooks/use-session-user';
import { DAILY_GOALS, useDailyGoal, type DailyGoal } from '@/hooks/use-daily-goal';
import { LOCALES, LOCALE_META, useI18n, type Locale } from '@/i18n';
import { maxStreak, milestoneStatus } from '@/lib/badges';
import { summarizePool } from '@/lib/flashcard-session';
import { useThemePreference, type ThemePreference } from '@/contexts/theme-preference';
import { Progress, Tag } from '@ant-design/react-native';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const user = useSessionUser();
  const colors = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { preference, setPreference } = useThemePreference();

  const THEME_OPTIONS: { value: ThemePreference; labelKey: 'profile.themeSystem' | 'profile.themeLight' | 'profile.themeDark' }[] = [
    { value: 'system', labelKey: 'profile.themeSystem' },
    { value: 'light', labelKey: 'profile.themeLight' },
    { value: 'dark', labelKey: 'profile.themeDark' },
  ];

  const [checkedSet, setCheckedSet] = useState<Set<string> | null>(null);
  const [answersByCourse, setAnswersByCourse] = useState<Record<string, AnswerRecord[]>>({});
  const [signingOut, setSigningOut] = useState(false);
  const [goal, setGoal] = useDailyGoal();
  // 卡组明细默认收起：15 行摊开会把这一页拉得很长，而学生多数时候只想看总量与难度分布
  const [decksOpen, setDecksOpen] = useState(false);

  /**
   * 题库概览：数字全部从卡片数据里数出来（summarizePool 用的是与筛选/排序同一套
   * "算不算一档"的口径），这里不写死任何一个数。本地题库（运行时按开关拉取的
   * 那份 public/local-deck.json）不在内：它只有本机打开开关时才存在，概览描述的是
   * 随 bundle 一起发出去的那套题库，也就是学生在任何环境都能练到的那些卡。
   */
  const pool = useMemo(() => summarizePool(), []);

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
  const milestones = milestoneStatus(maxStreak(checkedSet ?? new Set()));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
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
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('home.totalCheckins')}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              {streak === null ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.statNumber, { color: colors.text }]}>{streak}</Text>
              )}
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('home.currentStreak')}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('profile.mastery')}</Text>
          {COURSES.map((c) => {
            const mastery = computeMastery(c, answersByCourse[c.id] ?? []);
            return (
              <View key={c.id} style={styles.masteryRow}>
                <Tag>{c.shortName}</Tag>
                <Progress percent={mastery.percent} barStyle={{ backgroundColor: c.color }} style={styles.masteryBar} />
                <Text style={[styles.masteryPercent, { color: colors.textSecondary }]}>
                  {mastery.percent}%
                </Text>
              </View>
            );
          })}
        </View>

        <View
          testID="pool-card"
          style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
            {t('profile.pool')}
          </Text>
          <View
            testID="pool-total-row"
            style={styles.poolTotalRow}
            accessibilityLabel={t('profile.poolTotalA11y', { count: pool.total })}>
            <Text testID="pool-total" style={[styles.statNumber, { color: colors.text }]}>
              {pool.total}
            </Text>
            <Text style={[styles.poolTotalLabel, { color: colors.textSecondary }]}>
              {t('profile.poolTotalLabel')}
            </Text>
          </View>

          <Text style={[styles.poolSectionLabel, { color: colors.textSecondary }]}>
            {t('flashcards.difficulty')}
            <Text style={[styles.cardHint, { color: colors.textTertiary }]}>
              {' · '}
              {t('profile.poolDifficultyHint')}
            </Text>
          </Text>
          {pool.grades.map((grade) => (
            <View
              key={grade.difficulty}
              testID={`pool-grade-${grade.difficulty}`}
              style={styles.poolRow}
              accessibilityLabel={t('profile.poolGradeA11y', { level: grade.difficulty, count: grade.count })}>
              <Text
                style={[
                  styles.poolGradeBadge,
                  {
                    backgroundColor: colors.backgroundSelected,
                    borderColor: colors.primary,
                    color: colors.primary,
                  },
                ]}>
                {t('flashcards.difficultyLabel', { level: grade.difficulty })}
              </Text>
              <Progress
                percent={pool.total === 0 ? 0 : Math.round((grade.count / pool.total) * 100)}
                barStyle={{ backgroundColor: colors.primary }}
                style={styles.poolBar}
              />
              <Text
                testID={`pool-grade-count-${grade.difficulty}`}
                style={[styles.poolCount, { color: colors.textSecondary }]}>
                {t('profile.poolCount', { count: grade.count })}
              </Text>
            </View>
          ))}
          {/* 没有分级的卡单列一行、不给进度条：它不是一个档位，画成一条"0 档"的横条等于把
              564 张概念卡混进难度分布里，正是这一行要避免的误读 */}
          <View
            testID="pool-ungraded-row"
            style={styles.poolUngradedRow}
            accessibilityLabel={t('profile.poolUngradedA11y', { count: pool.ungraded })}>
            <Text
              style={[
                styles.poolGradeBadge,
                {
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.border,
                  color: colors.textSecondary,
                },
              ]}>
              {t('profile.poolUngraded')}
            </Text>
            <Text
              testID="pool-ungraded-count"
              style={[styles.poolCount, { color: colors.textSecondary }]}>
              {t('profile.poolCount', { count: pool.ungraded })}
            </Text>
          </View>
          <Text style={[styles.cardHint, { color: colors.textTertiary }]}>
            {t('profile.poolUngradedHint')}
          </Text>

          <Pressable
            testID="pool-decks-toggle"
            style={({ pressed }) => [styles.poolDeckToggle, pressed && styles.pressed]}
            onPress={() => setDecksOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: decksOpen }}
            accessibilityLabel={
              decksOpen ? t('profile.poolDecksHide') : t('profile.poolDecksShow', { count: pool.decks.length })
            }>
            <Text style={[styles.poolSectionLabel, styles.poolSectionLabelFlat, { color: colors.textSecondary }]}>
              {t('profile.poolDecks')}
            </Text>
            <Text style={[styles.poolToggleText, { color: colors.primary }]}>
              {decksOpen
                ? t('profile.poolDecksHide')
                : t('profile.poolDecksShow', { count: pool.decks.length })}
            </Text>
          </Pressable>
          {decksOpen &&
            pool.decks.map((deck) => (
              <View
                key={deck.key}
                testID={`pool-deck-${deck.key}`}
                style={styles.poolDeckRow}
                accessibilityLabel={t('profile.poolDeckA11y', { deck: deck.label, count: deck.count })}>
                <Text style={[styles.poolDeckLabel, { color: colors.text }]}>{deck.label}</Text>
                <Text
                  testID={`pool-deck-count-${deck.key}`}
                  style={[styles.poolCount, { color: colors.textSecondary }]}>
                  {t('profile.poolCount', { count: deck.count })}
                </Text>
              </View>
            ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('profile.dailyGoal')}</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
            {t('profile.goalHint')}
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
                    {t('profile.goalQuestions', { count: g })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('profile.language')}</Text>
          <View style={styles.goalRow}>
            {LOCALES.map((l: Locale) => {
              const active = locale === l;
              return (
                <Pressable
                  key={l}
                  style={({ pressed }) => [
                    styles.langChip,
                    {
                      backgroundColor: active ? colors.primary : colors.backgroundElement,
                      borderColor: active ? colors.primary : colors.border,
                    },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setLocale(l)}
                  accessibilityLabel={LOCALE_META[l].nativeName}
                  accessibilityState={{ selected: active }}>
                  <Text
                    style={[styles.goalChipText, { color: active ? '#fff' : colors.text }]}>
                    {LOCALE_META[l].nativeName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('profile.theme')}</Text>
          <View style={styles.goalRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = preference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.langChip,
                    {
                      backgroundColor: active ? colors.primary : colors.backgroundElement,
                      borderColor: active ? colors.primary : colors.border,
                    },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setPreference(opt.value)}
                  accessibilityState={{ selected: active }}>
                  <Text
                    style={[styles.goalChipText, { color: active ? '#fff' : colors.text }]}>
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('badges.title')}</Text>
          <View style={styles.badgeRow}>
            {milestones.map((m) => (
              <Tag
                key={m.days}
                style={m.earned ? { backgroundColor: colors.successBg, borderColor: colors.success } : undefined}>
                {m.earned ? '🏆' : '🔒'} {t('badges.streakDays', { days: m.days })}
                {m.earned ? '' : ` · ${t('badges.locked')}`}
              </Tag>
            ))}
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
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={[styles.signOutText, { color: colors.errorText }]}>{t('profile.signOut')}</Text>
          )}
        </Pressable>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          {t('profile.footer')}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  nickname: { fontSize: 22, fontWeight: '800' },
  email: { fontSize: 13 },
  card: { borderRadius: Radius.lg, padding: Spacing.four },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.one },
  statDivider: { width: StyleSheet.hairlineWidth, height: 40 },
  statNumber: { fontSize: 30, fontWeight: '900' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardHint: { fontSize: 12, lineHeight: 18 },
  masteryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  masteryBar: { flex: 1 },
  masteryBadge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  masteryBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  masteryPercent: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },
  goalRow: { flexDirection: 'row', gap: Spacing.two },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  badgeChip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    gap: 2,
  },
  badgeDays: { fontSize: 12, fontWeight: '700' },
  badgeHint: { fontSize: 10 },
  goalChip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
  },
  goalChipText: { fontSize: 14, fontWeight: '700' },
  langChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.two + 2,
  },
  statLabel: { fontSize: 12 },
  poolTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  poolTotalLabel: { fontSize: 13, fontWeight: '600' },
  poolSectionLabel: { fontSize: 12, fontWeight: '700', marginTop: Spacing.three },
  poolSectionLabelFlat: { marginTop: 0 },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  poolGradeBadge: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  poolBar: { flex: 1 },
  poolCount: { fontSize: 12, fontWeight: '700', width: 56, textAlign: 'right' },
  poolUngradedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  poolDeckToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  poolToggleText: { fontSize: 12, fontWeight: '700' },
  poolDeckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  poolDeckLabel: { fontSize: 13, flexShrink: 1 },
  signOut: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: Spacing.two },
});
