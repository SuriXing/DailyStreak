import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useSessionUser } from '@/hooks/use-session-user';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const NAV = [
  { path: '/', label: '打卡', icon: 'flame' as const },
  { path: '/study', label: '学习', icon: 'book' as const },
  { path: '/profile', label: '我的', icon: 'person' as const },
] as const;

/** 桌面端左侧导航（宽度 ≥900px 时替代底部 Tab） */
export function Sidebar() {
  const colors = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const user = useSessionUser();

  const nickname =
    (user?.user_metadata?.username as string | undefined) ||
    (user?.email ?? '').split('@')[0] ||
    'Suri';

  async function onSignOut() {
    if (!isSupabaseConfigured) return;
    await getSupabase().auth.signOut();
  }

  return (
    <View
      role="navigation"
      style={[styles.container, { backgroundColor: colors.backgroundElement, borderRightColor: colors.borderSecondary }]}>
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Ionicons name="flash" size={18} color="#fff" />
        </View>
        <View>
          <Text style={[styles.brandName, { color: colors.text }]}>DailyStreak</Text>
          <Text style={[styles.brandSub, { color: colors.textSecondary }]}>每日学习打卡</Text>
        </View>
      </View>

      <View style={styles.nav}>
        {NAV.map((item) => {
          const active = pathname === item.path;
          return (
            <Pressable
              key={item.path}
              style={({ pressed }) => [
                styles.navItem,
                {
                  backgroundColor: active ? colors.backgroundSelected : 'transparent',
                },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(item.path)}
              accessibilityState={{ selected: active }}>
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.navLabel,
                  { color: active ? colors.primary : colors.textSecondary },
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{nickname.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={[styles.nickname, { color: colors.text }]} numberOfLines={1}>
            {nickname}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          onPress={onSignOut}
          accessibilityLabel="退出登录">
          <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.signOutText, { color: colors.textSecondary }]}>退出登录</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 220,
    borderRightWidth: 1,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 17, fontWeight: '800' },
  brandSub: { fontSize: 11 },
  nav: { flex: 1, gap: Spacing.one },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
  },
  navLabel: { fontSize: 15, fontWeight: '600' },
  footer: { gap: Spacing.two, paddingHorizontal: Spacing.two },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  nickname: { fontSize: 13, fontWeight: '600', flex: 1 },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.one },
  signOutText: { fontSize: 13 },
  pressed: { opacity: 0.7 },
});
