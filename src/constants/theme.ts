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
    /**
     * 主色当**文字/图标**用时取的颜色（链接、选中态导航项、难度徽章上的字）。
     * 浅色下刻意与 primary 同值：#1677ff 放在 #ffffff 上只有 4.10:1（不达标），
     * 但那要动浅色主题的品牌蓝与 tertiary 灰，属于另一件事，本次不动，见提交说明。
     */
    primaryForeground: '#1677ff',
    primaryText: '#ffffff',
    success: '#52c41a',
    error: '#ff4d4f',
    warning: '#faad14',
    successBg: '#f6ffed',
    errorBg: '#fff2f0',
    warningBg: '#fffbe6',
    // antd 语义文本色（在彩色浅底上保证对比度）
    successText: '#237804', // colorSuccessText (green-7)
    errorText: '#a8071a', // colorErrorText (red-7)
    successLight: '#B7EB8F', // 打卡日历「已打卡」的浅绿填充 (green-3)
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
    /**
     * 暗色下 primary 只当**填充**色用（选中的 chip、头像底、进度条、徽章描边）：
     * 原来的 #1677ff 配白字实测只有 4.10:1（低于正文 4.5:1），压深一档到 #1668dc 后
     * 白字 5.19:1；当非文本用途（进度条/描边）对卡片底色仍有 3.55:1（要求 3:1）。
     */
    primary: '#1668dc',
    primaryHover: '#4096ff',
    /**
     * 主色当**文字/图标**用时取的颜色。暗色下 #1677ff 作文字只有 4.24:1（#111a2c 上）
     * 与 4.49:1（#141414 上），两处都差一点，所以文字侧换成提亮过的 blue-5：
     * 5.82:1（选中态底色）/ 6.16:1（卡片）/ 7.02:1（页面底色）。
     * 只动文字一侧，填充仍是 primary，界面上看到的还是同一个蓝。
     */
    primaryForeground: '#4096ff',
    primaryText: '#ffffff',
    success: '#52c41a',
    error: '#ff4d4f',
    warning: '#faad14',
    successBg: '#162312',
    errorBg: '#2c1616',
    warningBg: '#2b2111',
    successText: '#b7eb8f', // colorSuccessText (green-2，暗色下提亮)
    errorText: '#ffa39e', // colorErrorText (red-2，暗色下提亮)
    successLight: '#274a17', // 暗色下「已打卡」浅绿填充
    border: '#424242',
    borderSecondary: '#303030',
    fillSecondary: 'rgba(255,255,255,0.12)',
    fillTertiary: 'rgba(255,255,255,0.08)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * antd 组件库自己的主题 token（Card / Tag / Button / Progress 用的就是这一套命名，
 * 和上面的 Colors 不是一套）。@ant-design/react-native 的 Provider 会把这份对象
 * **浅合并**到它的默认主题上，而默认主题是浅色的（fill_base: '#ffffff'）：
 * 暗色下不给覆盖，今日页三张 <Card> 会保持白底，而卡片里的正文用的是 Colors.dark，
 * 实测 #e0e0e0 on #ffffff = 1.32:1、#a6a6a6 on #ffffff = 2.43:1（等于看不见），
 * <Tag> 也还是"白底 #888888 字"的 3.54:1。浅色下不传这份对象，antd 用默认主题。
 *
 * 只覆盖会露出浅色像素的键：底色/描边/文字/主色填充/幽灵按钮。
 * 注意 antd 会拿这些值做十六进制字符串拼接（如 fill_tap + '4D'、color_text_base + '99'），
 * 所以值必须是六位 hex，不能写成 rgba()。
 */
export const AntdDarkTheme = {
  // 底色与描边
  fill_base: Colors.dark.backgroundElement,
  fill_body: Colors.dark.background,
  fill_grey: '#1f1f1f',
  fill_tap: '#262626',
  fill_disabled: '#262626',
  border_color_base: Colors.dark.border,
  border_color_thin: Colors.dark.borderSecondary,
  // 文字
  color_text_base: Colors.dark.text,
  color_text_base_inverse: Colors.dark.primaryText,
  color_text_paragraph: Colors.dark.text,
  color_text_caption: Colors.dark.textSecondary,
  color_text_placeholder: Colors.dark.textTertiary,
  color_text_disabled: '#595959',
  color_icon_base: Colors.dark.textSecondary,
  color_link: Colors.dark.primaryForeground,
  // 主色：填充仍用 primary（白字 5.19:1），文字用 primaryForeground
  brand_primary: Colors.dark.primary,
  brand_primary_tap: '#0958d9',
  primary_button_fill: Colors.dark.primary,
  primary_button_fill_tap: '#0958d9',
  ghost_button_color: Colors.dark.primaryForeground,
  ghost_button_fill_tap: '#4096ff99',
  brand_success: Colors.dark.success,
  brand_warning: Colors.dark.warning,
  brand_error: Colors.dark.error,
} as const;

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

/** 第三方品牌色（非 antd 语义 token）：Google / Apple 社交登录按钮的固定品牌色。 */
export const Brand = {
  google: '#EA4335',
  googleBg: '#ffffff',
  googleBorder: '#dadce0',
  googleText: '#3c4043',
  appleBlack: '#000000',
  appleWhite: '#ffffff',
} as const;
