import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { formatDateLong, getDeviceLocale, translate } from './core';
import { LOCALES, type Locale, type TFn } from './types';

const LOCALE_KEY = 'dailystreak.locale';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFn;
  formatDate: (date: Date) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * 语言 Provider：默认取设备语言，用户手动切换后持久化到 AsyncStorage。
 * 切换即时生效（Context 驱动重渲染），无需重启应用。
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getDeviceLocale());

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LOCALE_KEY)
      .then((stored) => {
        if (active && stored && (LOCALES as readonly string[]).includes(stored)) {
          setLocaleState(stored as Locale);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: ((key, params) => translate(locale, key, params)) as TFn,
      formatDate: (date: Date) => formatDateLong(date, locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
