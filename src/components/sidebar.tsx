import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useSessionUser } from '@/hooks/use-session-user';
import { useI18n, type TKey } from '@/i18n';
import { useThemePreference } from '@/contexts/theme-preference';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const NAV = [
  { path: '/', labelKey: 'tabs.checkin' as TKey, icon: 'flame' as const },
  { path: '/study', labelKey: 'tabs.study' as TKey, icon: 'book' as const },
  { path: '/flashcards', labelKey: 'tabs.flashcards' as TKey, icon: 'albums' as const },
  { path: '/profile', labelKey: 'tabs.profile' as TKey, icon: 'person' as const },
] as const;

const COLLAPSE_KEY = 'dailystreak.sidebar.collapsed';
const SIDEBAR_WIDE = 224;
const SIDEBAR_NARROW = 64;

/** 桌面端左侧导航（宽度 ≥900px 时替代底部 Tab），可折叠为图标栏。
 *  采用 antd Layout.Sider 的结构：品牌头 + 顶部菜单 + 底部用户卡片。 */
export function Sidebar() {
  const colors = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const user = useSessionUser();
  const { t } = useI18n();
  const { resolved, setPreference } = useThemePreference();
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
      {/* 品牌头 */}
      <View style={[styles.header, collapsed && styles.headerCollapsed]}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Ionicons name="flash" size={18} color={colors.primaryText} />
        </View>
        {!collapsed && (
          <View style={styles.brandText}>
            <Text style={[styles.brandName, { color: colors.text }]} numberOfLines={1}>
              DailyStreak
            </Text>
            <Text style={[styles.brandSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('sidebar.tagline')}
            </Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.collapseBtn, pressed && styles.pressed]}
          onPress={toggle}
          accessibilityLabel={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}>
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-back'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>

      {/* 顶部菜单 */}
      <View style={[styles.nav, collapsed && styles.navCollapsed]}>
        {NAV.map((item) => {
          const active = pathname === item.path;
          return (
            <Pressable
              key={item.path}
              style={({ pressed }) => [
                styles.navItem,
                { backgroundColor: active ? colors.backgroundSelected : 'transparent' },
                collapsed && styles.navItemCollapsed,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(item.path)}
              accessibilityLabel={t(item.labelKey)}
              accessibilityState={{ selected: active }}>
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? colors.primary : colors.textSecondary}
              />
              {!collapsed && (
                <Text
                  numberOfLines={1}
                  style={[styles.navLabel, { color: active ? colors.primary : colors.textSecondary }]}>
                  {t(item.labelKey)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* 弹性空白，把底部用户卡片推到最下 */}
      <View style={styles.spacer} />

      {/* 底部用户卡片 */}
      <View style={[styles.footer, collapsed && styles.footerCollapsed]}>
        <View style={[styles.userRow, collapsed && styles.userRowCollapsed]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.primaryText }]}>
              {nickname.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          {!collapsed && (
            <View style={styles.userMeta}>
              <Text style={[styles.nickname, { color: colors.text }]} numberOfLines={1}>
                {nickname}
              </Text>
              <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.action,
            collapsed && styles.actionCollapsed,
            pressed && styles.pressed,
          ]}
          onPress={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
          accessibilityLabel={t('sidebar.toggleTheme')}>
          <Ionicons
            name={resolved === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={16}
            color={colors.textSecondary}
          />
          {!collapsed && (
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              {resolved === 'dark' ? t('profile.themeLight') : t('profile.themeDark')}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.action,
            collapsed && styles.actionCollapsed,
            pressed && styles.pressed,
          ]}
          onPress={onSignOut}
          accessibilityLabel={t('profile.signOut')}>
          <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} />
          {!collapsed && (
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('profile.signOut')}</Text>
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
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  containerCollapsed: { paddingHorizontal: Spacing.one },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two },
  headerCollapsed: { flexDirection: 'column', gap: Spacing.one, paddingHorizontal: 0, alignItems: 'center' },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { flex: 1 },
  brandName: { fontSize: 16, fontWeight: '800' },
  brandSub: { fontSize: 11, marginTop: 1 },
  collapseBtn: { padding: 4, borderRadius: Radius.sm },
  nav: { marginTop: Spacing.three, gap: Spacing.one },
  navCollapsed: { alignItems: 'center' },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
  },
  navItemCollapsed: { justifyContent: 'center', paddingHorizontal: 0 },
  navLabel: { fontSize: 14, fontWeight: '600' },
  spacer: { flex: 1 },
  footer: {
    marginTop: Spacing.three,
    borderTopWidth: 1,
    paddingTop: Spacing.three,
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  footerCollapsed: { paddingHorizontal: 0, alignItems: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  userRowCollapsed: { justifyContent: 'center', paddingBottom: Spacing.one },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  userMeta: { flex: 1 },
  nickname: { fontSize: 14, fontWeight: '700' },
  userEmail: { fontSize: 11, marginTop: 1 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  actionCollapsed: { justifyContent: 'center' },
  actionText: { fontSize: 13 },
  pressed: { opacity: 0.7 },
});
