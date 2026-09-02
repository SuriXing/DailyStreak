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
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { signInWithAppleIdentityToken, signInWithGoogle } from '@/lib/social-auth';
import { errorMessage } from '@/lib/errors';
import { useI18n } from '@/i18n';
import { Brand, ControlHeight, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/contexts/theme-preference';

type Mode = 'login' | 'signup';

export default function AuthScreen() {
  const colors = useTheme();
  const { resolved } = useThemePreference();
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

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // 成功后由会话状态驱动界面切换（web 整页跳转 / 原生 setSession）
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function onApple() {
    setBusy(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('no identity token');
      }
      await signInWithAppleIdentityToken(credential.identityToken);
    } catch (e) {
      // 用户主动取消时不提示错误
      if (e && (e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
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
            <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
              <Ionicons name="flash" size={26} color="#fff" />
            </View>
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
              <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.error }]}>
                {error}
              </Text>
            )}
            {notice && (
              <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: colors.success }]}>
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

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.googleButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
              onPress={onGoogle}
              disabled={busy}>
              <Ionicons name="logo-google" size={18} color={Brand.google} />
              <Text style={styles.googleButtonText}>{t('auth.google')}</Text>
            </Pressable>

            {Platform.OS === 'ios' && (
              <Pressable
                style={({ pressed }) => [
                  styles.socialButton,
                  resolved === 'dark' ? styles.appleButtonDark : styles.appleButtonLight,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
                onPress={onApple}
                disabled={busy}>
                <Ionicons
                  name="logo-apple"
                  size={18}
                  color={resolved === 'dark' ? Brand.appleBlack : Brand.appleWhite}
                />
                <Text
                  style={[
                    styles.socialButtonText,
                    { color: resolved === 'dark' ? Brand.appleBlack : Brand.appleWhite },
                  ]}>
                  {t('auth.apple')}
                </Text>
              </Pressable>
            )}
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
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  emoji: { fontSize: 56 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14 },
  form: { gap: Spacing.three },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  socialButton: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  googleButton: { backgroundColor: Brand.googleBg, borderColor: Brand.googleBorder },
  googleButtonText: { color: Brand.googleText, fontSize: 15, fontWeight: '600' },
  appleButtonLight: { backgroundColor: Brand.appleBlack, borderColor: Brand.appleBlack },
  appleButtonDark: { backgroundColor: Brand.appleWhite, borderColor: Brand.appleWhite },
  socialButtonText: { fontSize: 15, fontWeight: '600' },
  error: { fontSize: 13 },
  notice: { fontSize: 13 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  card: { padding: Spacing.four, gap: Spacing.three },
  body: { fontSize: 15, lineHeight: 22 },
});
