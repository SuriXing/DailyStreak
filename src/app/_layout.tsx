import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { I18nProvider } from '@/i18n';
import { ThemePreferenceProvider, useThemePreference } from '@/contexts/theme-preference';
import { AntdDarkTheme, AntdLightTheme, Colors } from '@/constants/theme';
import { Provider as AntdProvider } from '@ant-design/react-native';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => !isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSupabase().auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <ThemePreferenceProvider>
      <I18nProvider>
        <AntdThemeProvider>
          <ThemedStack session={session} />
        </AntdThemeProvider>
      </I18nProvider>
    </ThemePreferenceProvider>
  );
}

/**
 * antd 组件（Card / Tag / Button / Progress）的配色也跟着主题走。
 * 两件事值得写下来：
 * 1. Provider 的 theme 是浅合并到 antd 默认主题上的，两份覆盖各管一半：暗色那份要逐项覆盖
 *    （antd 默认主题是浅色的，白底配暗色文字等于看不见），浅色那份只改 antd 自己那几个
 *    不达标的浅色值（Tag 文字的 caption 灰、主按钮与幽灵按钮的主色），其余键沿用 antd 默认。
 * 2. key={resolved} 不是装饰：antd 的 WithTheme 把 themeStyles(theme) 的结果缓存在组件实例里
 *    （useCallback 依赖只有 themeStyles/styles，主题换了不会重算），换主题时只有让这棵子树
 *    重挂载，已经渲染过的 Card/Tag 才会拿到新主题。代价是切主题会重挂一次当前路由，
 *    换来的是"切过去就立刻是暗的"，不会出现黑页面里留着白卡片这种半截状态。
 */
function AntdThemeProvider({ children }: { children: ReactNode }) {
  const { resolved } = useThemePreference();
  return (
    <AntdProvider key={resolved} theme={resolved === 'dark' ? AntdDarkTheme : AntdLightTheme}>
      {children}
    </AntdProvider>
  );
}

/** 根据主题偏好（跟随系统/亮/暗）决定导航主题 */
function ThemedStack({ session }: { session: Session | null }) {
  const { resolved } = useThemePreference();
  return (
    <ThemeProvider value={resolved === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Protected 才是真正的路由守卫：guard 为 false 时屏幕会被移除并重定向，
            条件渲染 Stack.Screen 在 Web 上不拦截 URL 路由（此前导致未登录也能进 Tabs） */}
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="auth" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
