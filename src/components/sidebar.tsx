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
  { path: '/', labelKey: 'tabs.checkin' as TKey, icon: 'flame' as const, testID: 'sidebar-nav-checkin' },
  { path: '/study', labelKey: 'tabs.study' as TKey, icon: 'albums' as const, testID: 'sidebar-nav-study' },
  { path: '/profile', labelKey: 'tabs.profile' as TKey, icon: 'person' as const, testID: 'sidebar-nav-profile' },
] as const;

const COLLAPSE_KEY = 'dailystreak.sidebar.collapsed';
const SIDEBAR_WIDE = 224;
const SIDEBAR_NARROW = 64;

/** 桌面端左侧导航（宽度 ≥900px 时替代底部 Tab），可折叠为图标栏。
 *  采用 antd Layout.Sider 的结构：品牌头 + 顶部菜单 + 底部用户卡片。
 *
 *  可达性：react-native-web 的 createDOMProps 只认 aria-* 名字和 accessibilityChecked/Selected 这类
 *  单项别名，`accessibilityState={{ selected }}` 整个对象会被丢掉——改之前这一栏每一项在 DOM 上都是
 *  裸的 `<div tabindex="0" aria-label="Me">`，既没有角色也没有"当前在哪一页"，读屏软件完全看不出来。
 *  这里按每个元素**实际是干什么的**换成真正会落到 DOM 上的写法：
 *  - 导航项是跳转 → role="link"，当前那一条再加 aria-current="page"。不用 aria-selected：
 *    它是 tab/option/gridcell 这类角色的状态，放在链接上是假状态；底部 Tab（expo-router 自己渲染的
 *    role="tab" + aria-selected）是另一套语义，两边各自成立。role="link" 在 RNW 里不换标签
 *    （propsToAccessibilityComponent 的 roleComponents 里没有 link），仍旧是那个 div，只是带上了角色。
 *  - 折叠 / 切换主题 / 退出登录是动作 → role="button"：读屏软件才会念成按钮，空格键也由 RNW 的
 *    PressResponder 接管（isValidKeyPress 只对 <button> 或 role=button 认空格，Enter 任何角色都认）。
 *  - 折叠按钮不写 aria-expanded：它开合的是这一栏自己的宽度，不是一块能展开阅读的内容区，
 *    可读名里已经写了 expand/collapse 两个方向。 */
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
          testID="sidebar-collapse"
          role="button"
          style={({ pressed }) => [styles.collapseBtn, pressed && styles.pressed]}
          onPress={toggle}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}>
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
              testID={item.testID}
              role="link"
              aria-current={active ? 'page' : undefined}
              style={({ pressed }) => [
                styles.navItem,
                { backgroundColor: active ? colors.backgroundSelected : 'transparent' },
                collapsed && styles.navItemCollapsed,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(item.path)}
              aria-label={t(item.labelKey)}>
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? colors.primaryForeground : colors.textSecondary}
              />
              {!collapsed && (
                <Text
                  numberOfLines={1}
                  style={[styles.navLabel, { color: active ? colors.primaryForeground : colors.textSecondary }]}>
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
          testID="sidebar-theme-toggle"
          role="button"
          style={({ pressed }) => [
            styles.action,
            collapsed && styles.actionCollapsed,
            pressed && styles.pressed,
          ]}
          onPress={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
          aria-label={t('sidebar.toggleTheme')}>
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
          testID="sidebar-signout"
          role="button"
          style={({ pressed }) => [
            styles.action,
            collapsed && styles.actionCollapsed,
            pressed && styles.pressed,
          ]}
          onPress={onSignOut}
          aria-label={t('profile.signOut')}>
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
