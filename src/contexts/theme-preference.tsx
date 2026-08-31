import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'dailystreak.theme';

interface ThemePreferenceValue {
  /** 用户选择：跟随系统 / 亮 / 暗 */
  preference: ThemePreference;
  /** 实际生效的主题 */
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (active && (v === 'light' || v === 'dark' || v === 'system')) {
        setPreferenceState(v);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(THEME_KEY, p).catch(() => {});
  }, []);

  const resolved =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference(): ThemePreferenceValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference 必须在 ThemePreferenceProvider 内使用');
  return ctx;
}
