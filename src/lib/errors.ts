import type { TKey, TFn } from '@/i18n';

/** 携带 i18n key 的业务错误：由 UI 层按当前语言翻译后展示 */
export class AppError extends Error {
  readonly key: TKey;

  constructor(key: TKey) {
    super(key);
    this.name = 'AppError';
    this.key = key;
  }
}

/** 常见 Supabase/Auth 服务端报文 → 本地化 key；未命中的消息原样透传 */
const SUPABASE_ERROR_KEYS: [RegExp, TKey][] = [
  [/invalid login credentials/i, 'auth.invalidCredentials'],
  [/email not confirmed/i, 'auth.emailNotConfirmed'],
  [/already registered/i, 'auth.userExists'],
  [/password should be at least 6/i, 'auth.passwordTooShort'],
  [/too many requests|rate limit/i, 'auth.rateLimited'],
];

/** 异常 → 当前语言的展示文案 */
export function errorMessage(e: unknown, t: TFn): string {
  if (e instanceof AppError) return t(e.key);
  const raw = e instanceof Error && e.message ? e.message : null;
  if (!raw) return t('common.errorGeneric');
  const hit = SUPABASE_ERROR_KEYS.find(([re]) => re.test(raw));
  return hit ? t(hit[1]) : raw;
}
