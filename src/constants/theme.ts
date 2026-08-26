/**
 * DailyStreak theme — Ant Design design language bridge.
 * Ported from antd v5/v6 design tokens (https://ant.design/docs/react/customize-theme):
 * colorPrimary #1677ff, colorSuccess #52c41a, colorWarning #faad14, colorError #ff4d4f,
 * neutral text/border/fill scales, borderRadius 6/8, controlHeight 32/40, shadow layers.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // antd 中性色阶
    text: '#141414', // colorText ≈ rgba(0,0,0,0.88)
    textSecondary: '#595959', // colorTextSecondary ≈ rgba(0,0,0,0.65)
    textTertiary: '#8c8c8c', // colorTextTertiary ≈ rgba(0,0,0,0.45)
    background: '#f5f5f5', // colorBgLayout
    backgroundElement: '#ffffff', // colorBgContainer（卡片/输入框）
    backgroundSelected: '#e6f4ff', // colorPrimaryBg
    // antd 语义色
    primary: '#1677ff',
    primaryHover: '#4096ff',
    primaryText: '#ffffff',
    success: '#52c41a',
    error: '#ff4d4f',
    warning: '#faad14',
    successBg: '#f6ffed',
    errorBg: '#fff2f0',
    warningBg: '#fffbe6',
    // antd 边框/填充
    border: '#d9d9d9',
    borderSecondary: '#f0f0f0',
    fillSecondary: 'rgba(0,0,0,0.06)',
    fillTertiary: 'rgba(0,0,0,0.04)',
  },
  dark: {
    text: '#e0e0e0', // colorText ≈ rgba(255,255,255,0.88)
    textSecondary: '#a6a6a6', // colorTextSecondary ≈ rgba(255,255,255,0.65)
    textTertiary: '#8c8c8c',
    background: '#000000', // colorBgLayout
    backgroundElement: '#141414', // colorBgContainer
    backgroundSelected: '#111a2c', // colorPrimaryBg
    primary: '#1677ff',
    primaryHover: '#4096ff',
    primaryText: '#ffffff',
    success: '#52c41a',
    error: '#ff4d4f',
    warning: '#faad14',
    successBg: '#162312',
    errorBg: '#2c1616',
    warningBg: '#2b2111',
    border: '#424242',
    borderSecondary: '#303030',
    fillSecondary: 'rgba(255,255,255,0.12)',
    fillTertiary: 'rgba(255,255,255,0.08)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Radius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

export const ControlHeight = {
  sm: 24,
  md: 32,
  lg: 40,
} as const;

export const FontSize = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** antd 阴影层级（web 用 boxShadow，原生用 shadow 属性） */
export const Shadows = {
  card: Platform.select({
    web: {
      boxShadow:
        '0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.07), 0 2px 4px 0 rgba(0,0,0,0.02)',
    },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
  }),
  elevated: Platform.select({
    web: {
      boxShadow:
        '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)',
    },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
  }),
} as const;

export const Fonts = Platform.select({
  ios: {
    /** antd 系统字体栈 */
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
