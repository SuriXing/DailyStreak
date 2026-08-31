/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type ThemeColor } from '@/constants/theme';
import { useThemePreference } from '@/contexts/theme-preference';

export function useTheme(): Record<ThemeColor, string> {
  const { resolved } = useThemePreference();
  return Colors[resolved];
}
