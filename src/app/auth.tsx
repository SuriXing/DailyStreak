import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { useI18n } from '@/i18n';
import { ControlHeight, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'login' | 'signup';

export default function AuthScreen() {
  const colors = useTheme();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.card}>
          <Text style={[styles.emoji, { textAlign: 'center' }]}>⚙️</Text>
          <Text style={[styles.title, { color: colors.text }]}>{t('auth.configTitle')}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {t('auth.configBody')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  async function submit() {
    if (!isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signup') {
        const { error } = await getSupabase().auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: username.trim() || undefined } },
        });
        if (error) throw new Error(error.message);
        setNotice(t('auth.signupSuccess'));
        setMode('login');
      } else {
        const { error } = await getSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message);
        // 登录成功后根布局自动切换到主界面
      }
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.border },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={[styles.title, { color: colors.text }]}>DailyStreak</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('auth.tagline')}
            </Text>
          </View>

          <View style={styles.form}>
            {mode === 'signup' && (
              <TextInput
                style={inputStyle}
                placeholder={t('auth.usernamePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel={t('auth.usernameLabel')}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            )}
            <TextInput
              style={inputStyle}
              placeholder={t('auth.email')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={inputStyle}
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('auth.passwordPlaceholder')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {error && (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            )}
            {notice && (
              <Text accessibilityLiveRegion="polite" style={styles.notice}>
                {notice}
              </Text>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary },
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
              onPress={submit}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{mode === 'login' ? t('auth.login') : t('auth.signup')}</Text>
              )}
            </Pressable>

            <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                {mode === 'login' ? t('auth.toSignup') : t('auth.toLogin')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.five,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  hero: { alignItems: 'center', gap: Spacing.two },
  emoji: { fontSize: 56 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14 },
  form: { gap: Spacing.three },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    paddingHorizontal: Spacing.three,
    minHeight: ControlHeight.lg,
    fontSize: 16,
  },
  button: {
    borderRadius: Radius.md,
    minHeight: ControlHeight.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  switchText: { textAlign: 'center', fontSize: 14 },
  error: { color: '#ff4d4f', fontSize: 13 },
  notice: { color: '#52c41a', fontSize: 13 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  card: { padding: Spacing.four, gap: Spacing.three },
  body: { fontSize: 15, lineHeight: 22 },
});
