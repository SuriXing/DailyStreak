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
    /**
     * colorTextTertiary 原本照抄 antd 的 rgba(0,0,0,0.45)（落在白底上就是 #8c8c8c），
     * 实测在页面底 #f5f5f5 上只有 3.08:1、在白卡片上 3.36:1，两处都低于正文 4.5:1；
     * 而它出现的地方全是 9–12px 的小字（来源与核验标注、翻面提示、日历星期标签），
     * 字越小越需要对比度，不能拿"它是弱化的辅助文字"当豁免。压到 0.58（#6b6b6b）后
     * 4.89:1 / 5.33:1，观感仍是"比次级灰再浅一档"的灰。
     */
    textTertiary: '#6b6b6b',
    background: '#f5f5f5', // colorBgLayout
    backgroundElement: '#ffffff', // colorBgContainer（卡片/输入框）
    backgroundSelected: '#e6f4ff', // colorPrimaryBg
    // antd 语义色
    /**
     * 主色当**填充**用时取的颜色（选中的 chip、头像底、进度条、品牌标）。
     * #1677ff 配白字实测 4.10:1，低于正文 4.5:1，所以和暗色那次一样压深一档到 #1668dc
     * （与暗色同值不是巧合：两边的约束是同一个——填充色上的白字要够），白字 5.19:1；
     * 它当非文本色用（进度条、选中描边）对白底仍有 4.76:1（要求 3:1）。
     */
    primary: '#1668dc',
    primaryHover: '#4096ff',
    /**
     * 主色当**文字/图标**用时取的颜色（链接、选中态导航项、难度徽章上的字）。
     * 上一版浅色刻意与 primary 同值，代价是 #1677ff 当文字三处都不达标：
     * 白卡片上 4.10:1、页面底 #f5f5f5 上 3.76:1、选中态底色 #e6f4ff 上 3.66:1。
     * 文字侧要的方向和填充侧一样（更深），但不能共用沉下去的那一档：#1668dc 是为了白字，
     * 当文字只剩 4.63:1（在 #e6f4ff 上，余量太薄），文字用 blue-7 #0958d9 才有余量
     * ——5.50:1 / 5.65:1 / 6.16:1。界面上看到的仍是同一个蓝。
     */
    primaryForeground: '#0958d9',
    primaryText: '#ffffff',
    success: '#52c41a',
    error: '#ff4d4f',
    warning: '#faad14',
    /**
     * warning 当**文字**用的颜色。#faad14（亮金）在浅底上只有 1.74:1，是全表最差的一处，
     * 而换底色救不回来：warningBg #fffbe6 上 2.63:1、白卡片上 1.90:1，因为问题是金色本身太亮。
     * 想保住正文 4.5:1 只能是深琥珀，所以庆祝那一行改用 #9c5c00（#f5f5f5 上 4.88:1、
     * 白卡片上 5.32:1）；warning 本身不动，它只用于描边与圆点（图例的"今天"、日历今日格）。
     */
    warningText: '#9c5c00',
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
    /** 暗色下亮金当文字本来就有 11.05:1，与 warning 同值，只为让组件两边写同一个 token */
    warningText: '#faad14',
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

/**
 * 浅色这一份是暗色那份覆盖的对应物，但只写**必须改**的键：
 * antd 默认主题虽然是浅色的，它自己的几个浅色值却是不达标的，而这些颜色由 antd 决定，
 * 组件里改不到（<Tag> 的文字、<Button type="primary"> 的底、type="ghost" 的字与描边都来自主题）：
 *  - color_text_caption #888888：<Tag> 的文字，白底 3.54:1、successBg 底 3.45:1（要 4.5:1），
 *    换成浅色的 caption 灰 #6b6b6b → 5.33:1 / 5.19:1；
 *  - brand_primary / primary_button_fill / ghost_button_color 都是 antd 自带的 #108ee9：
 *    主按钮白字 3.46:1、幽灵按钮把 #108ee9 当文字也是 3.46:1（要 4.5:1），
 *    换成上面算过的 primary（白字 5.19:1）与 primaryForeground（6.16:1）；
 *  - color_link 同理（Tag 选中态文字、Picker 的操作文字用它）。
 * 其余键一律不写：antd 的浅色默认值（fill_base #ffffff、color_text_base #000000、
 * 描边 #dddddd…）本来就是浅色主题要的值，逐项覆盖是暗色那份才需要做的事。
 * 与 AntdDarkTheme 同样的约束：值必须是六位 hex，antd 会拿它做字符串拼接（+ '4D' / + '99'）。
 */
export const AntdLightTheme = {
  color_text_caption: Colors.light.textTertiary,
  brand_primary: Colors.light.primary,
  brand_primary_tap: '#0958d9',
  primary_button_fill: Colors.light.primary,
  primary_button_fill_tap: '#0958d9',
  ghost_button_color: Colors.light.primaryForeground,
  ghost_button_fill_tap: '#0958d999',
  color_link: Colors.light.primaryForeground,
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
