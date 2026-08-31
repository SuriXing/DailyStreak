import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { AppError } from '@/lib/errors';

/** 原生端 OAuth 回跳地址（app.json 的 scheme，需在 Supabase 的 URI allow list 里） */
const NATIVE_REDIRECT = 'dailystreak://auth/callback';

/** 解析 OAuth 回调 URL 里的会话参数（access_token / refresh_token 等在 fragment 或 query 里） */
function parseParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (url.split('#')[1] ?? url.split('?')[1] ?? '').split('&')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = decodeURIComponent(part.slice(0, idx));
      const value = decodeURIComponent(part.slice(idx + 1));
      if (key && value) out[key] = value;
    }
  }
  return out;
}

/** Google 登录：Web 用整页跳转；原生端用系统浏览器会话后回跳（用户取消时静默返回） */
export async function signInWithGoogle(): Promise<void> {
  if (!isSupabaseConfigured) throw new AppError('errors.supabaseNotConfigured');
  const sb = getSupabase();

  if (Platform.OS === 'web') {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return;
  }

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { skipBrowserRedirect: true, redirectTo: NATIVE_REDIRECT },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, NATIVE_REDIRECT);
  if (result.type !== 'success' || !result.url) return; // 用户取消

  const params = parseParams(result.url);
  if (!params.access_token || !params.refresh_token) return;
  const { error: sessionError } = await sb.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (sessionError) throw sessionError;
}

/** Apple 登录（iOS）：原生 Sign in with Apple 拿到 identityToken 后交给 Supabase 校验 */
export async function signInWithAppleIdentityToken(identityToken: string): Promise<void> {
  if (!isSupabaseConfigured) throw new AppError('errors.supabaseNotConfigured');
  const { error } = await getSupabase().auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });
  if (error) throw error;
}
