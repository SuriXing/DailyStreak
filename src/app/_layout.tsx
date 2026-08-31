import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { I18nProvider } from '@/i18n';
import { ThemePreferenceProvider, useThemePreference } from '@/contexts/theme-preference';

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
        <ActivityIndicator size="large" color="#1677ff" />
      </View>
    );
  }

  return (
    <ThemePreferenceProvider>
      <I18nProvider>
        <ThemedStack session={session} />
      </I18nProvider>
    </ThemePreferenceProvider>
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
