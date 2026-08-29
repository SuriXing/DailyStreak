import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

const COLLAPSE_KEY = 'dailystreak.sidebar.collapsed';
const SIDEBAR_WIDE = 220;
const SIDEBAR_NARROW = 64;

/** 桌面端左侧导航（宽度 ≥900px 时替代底部 Tab），可折叠为图标栏 */
export function Sidebar() {
  const colors = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const user = useSessionUser();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(COLLAPSE_KEY).then((v) => {
      if (active && v === '1') setCollapsed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      AsyncStorage.setItem(COLLAPSE_KEY, c ? '0' : '1').catch(() => {});
      return !c;
    });
  }, []);

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
      style={[
        styles.container,
        collapsed && styles.containerCollapsed,
        {
          width: collapsed ? SIDEBAR_NARROW : SIDEBAR_WIDE,
          backgroundColor: colors.backgroundElement,
          borderRightColor: colors.borderSecondary,
        },
      ]}>
      <View style={[styles.topRow, collapsed && styles.topRowCollapsed]}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Ionicons name="flash" size={18} color="#fff" />
        </View>
        {!collapsed && (
          <View style={styles.brandText}>
            <Text style={[styles.brandName, { color: colors.text }]}>DailyStreak</Text>
            <Text style={[styles.brandSub, { color: colors.textSecondary }]}>每日学习打卡</Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.collapseBtn, pressed && styles.pressed]}
          onPress={toggle}
          accessibilityLabel={collapsed ? '展开侧边栏' : '折叠侧边栏'}>
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-back'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>
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
                  justifyContent: collapsed ? 'center' : 'flex-start',
                },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(item.path)}
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}>
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? colors.primary : colors.textSecondary}
              />
              {!collapsed && (
                <Text
                  style={[
                    styles.navLabel,
                    { color: active ? colors.primary : colors.textSecondary },
                  ]}>
                  {item.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.footer, collapsed && styles.footerCollapsed]}>
        <View style={[styles.userRow, collapsed && styles.userRowCollapsed]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{nickname.slice(0, 1).toUpperCase()}</Text>
          </View>
          {!collapsed && (
            <Text style={[styles.nickname, { color: colors.text }]} numberOfLines={1}>
              {nickname}
            </Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.signOut,
            collapsed && styles.signOutCollapsed,
            pressed && styles.pressed,
          ]}
          onPress={onSignOut}
          accessibilityLabel="退出登录">
          <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} />
          {!collapsed && (
            <Text style={[styles.signOutText, { color: colors.textSecondary }]}>退出登录</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRightWidth: 1,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  containerCollapsed: { paddingHorizontal: Spacing.one },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two },
  topRowCollapsed: { flexDirection: 'column', gap: Spacing.one, paddingHorizontal: 0, alignItems: 'center' },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { flex: 1 },
  brandName: { fontSize: 17, fontWeight: '800' },
  brandSub: { fontSize: 11 },
  collapseBtn: {
    padding: 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
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
  footerCollapsed: { paddingHorizontal: 0 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  userRowCollapsed: { justifyContent: 'center' },
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
  signOutCollapsed: { justifyContent: 'center' },
  signOutText: { fontSize: 13 },
  pressed: { opacity: 0.7 },
});
