import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { computeStreak, fetchCheckins } from '@/lib/checkins';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useSessionUser } from '@/hooks/use-session-user';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const user = useSessionUser();
  const colors = useTheme();

  const [checkedSet, setCheckedSet] = useState<Set<string> | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchCheckins(user.id)
      .then((dates) => {
        if (active) setCheckedSet(new Set(dates));
      })
      .catch(() => {
        if (active) setCheckedSet(new Set());
      });
    return () => {
      active = false;
    };
  }, [user]);

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

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {total === null ? '—' : total}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>累计打卡</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              {streak === null ? (
                <ActivityIndicator color="#58CC02" />
              ) : (
                <Text style={[styles.statNumber, { color: colors.text }]}>{streak}</Text>
              )}
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>当前连胜</Text>
            </View>
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
            <ActivityIndicator color="#EA2B2B" />
          ) : (
            <Text style={styles.signOutText}>退出登录</Text>
          )}
        </Pressable>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          DailyStreak v1.0 · 今天也要加油哦 💪
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.four, alignItems: 'stretch' },
  avatarWrap: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#58CC02',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  nickname: { fontSize: 22, fontWeight: '800' },
  email: { fontSize: 13 },
  card: { borderRadius: 16, padding: Spacing.four },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.one },
  statDivider: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: '#A0A4AB' },
  statNumber: { fontSize: 30, fontWeight: '900' },
  statLabel: { fontSize: 12 },
  signOut: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#EA2B2B', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: Spacing.two },
});
