# Design Contract Note — DailyStreak UI Polish (2026-08-30)

## Surface
- **Product mode**: mixed-product (app-shell tabs + reader-surface study + dashboard-lite stats)
- **Target style**: playful-learning-mobile（贴近 Duolingo 的能量色 + 圆角卡片，但配色为自研 token）
- **Platforms**: iOS (Expo Go) + Web (static export)

## Typography
- System font stack（`Fonts.sans`），不使用 Inter/Poppins 作为唯一字体（TELL-T01）
- 正文 15–16px / lineHeight 23–24；标题 22–32px / weight 800

## Tokens (affected)
- `Colors.light/dark` — text / background / backgroundElement / backgroundSelected / textSecondary
- Brand accent: `#58CC02`（按钮、连胜数字、tab active）；状态红 `#EA2B2B`；日历绿 `#58CC02`；今天描边 `#FF9600`
- Spacing scale: 2/4/8/16/24/32/64

## Accessibility (from ask-ux-expert 20-accessibility + ai-detector)
- Inputs 必须有 label 语义：RN `accessibilityLabel`（TELL-K08）
- 所有交互元素提供 `:focus-visible` 焦点环（TELL-K02）
- 动画遵守 `prefers-reduced-motion`（TELL-P04）
- 错误/成功反馈使用 live region（aria-live）双通道传达（17-feedback-error）
- 正文对比度 ≥ 4.5:1（textSecondary #60646C on #fff ≈ 5.9:1 ✓）

## Copy rules (from ai-detector TELL-X / TELL-T03)
- 禁 em-dash（`—`）与 `——`：用冒号/逗号/句号
- 禁版本号 footer / hero 版本标签（TELL-X10/X15）
- 正文少用 emoji（TELL-X01），仅保留功能型符号（🔥 连胜、✅ 打卡态）

## Forbidden drift
- 不引入紫色渐变、glassmorphism、三卡片营销布局
- 不引入 `transition: all`、无限动画、无 reduced-motion 的动效

## Verification
- `npx tsc --noEmit` && `npx expo lint`
- `npx expo export -p web` + `python3.14 ~/.claude/skills/ai-detector/scripts/ai-detect.py --format json dist/<page>.html`（目标 ≥96，无 MAJOR）
