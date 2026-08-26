# Design Contract Note — DailyStreak UI Polish (2026-08-30)

## Surface
- **Product mode**: mixed-product (app-shell tabs + reader-surface study + dashboard-lite stats)
- **Target style**: antd-design-language（Ant Design v5/v6 令牌移植：主色蓝 + 中性色阶 + 圆角/阴影/控件高度）
- **Platforms**: iOS (Expo Go) + Web (static export)

## Typography
- antd 系统字体栈（`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`），不使用 Inter/Poppins 作为唯一字体（TELL-T01）
- 正文 14–16px / lineHeight 23–24；标题 20–32px / weight 800

## Tokens (affected)
- `Colors.light/dark` — text(#141414) / textSecondary(#595959) / background(colorBgLayout #f5f5f5) / backgroundElement(colorBgContainer #fff) / backgroundSelected(colorPrimaryBg #e6f4ff)
- antd 语义色：primary `#1677ff`（按钮/tab/焦点环）、success `#52c41a`（打卡/日历/答对）、warning `#faad14`（今天描边）、error `#ff4d4f`（错误/答错）
- 边框：`#d9d9d9`（默认）/ `#f0f0f0`（次级）；填充：`rgba(0,0,0,0.06/0.04)`
- Radius: sm 4 / md 6 / lg 8；ControlHeight: 32/40；阴影：antd boxShadow 1 层（卡片）/ 2 层（浮层）
- Spacing scale: 2/4/8/16/24/32/64

## Accessibility (from ask-ux-expert 20-accessibility + ai-detector)
- Inputs 必须有 label 语义：RN `accessibilityLabel`（TELL-K08）
- 所有交互元素提供 `:focus-visible` 焦点环（TELL-K02）
- 动画遵守 `prefers-reduced-motion`（TELL-P04）
- 错误/成功反馈使用 live region（aria-live）双通道传达（17-feedback-error）
- 正文对比度 ≥ 4.5:1（textSecondary #595959 on #fff ≈ 6.9:1 ✓；卡片 on #f5f5f5 ≈ 6.6:1 ✓）

## Copy rules (from ai-detector TELL-X / TELL-T03)
- 禁 em-dash（`—`）与 `——`：用冒号/逗号/句号
- 禁版本号 footer / hero 版本标签（TELL-X10/X15）
- 正文少用 emoji（TELL-X01），仅保留功能型符号（🔥 连胜、✅ 打卡态）

## Forbidden drift
- 不引入紫色渐变、glassmorphism、三卡片营销布局
- 不退回旧绿主色 #58CC02 与旧红 #EA2B2B（已被 antd 语义色取代）
- 不引入 `transition: all`、无限动画、无 reduced-motion 的动效

## Verification
- `npx tsc --noEmit` && `npx expo lint`
- `npx expo export -p web` + `python3.14 ~/.claude/skills/ai-detector/scripts/ai-detect.py --format json dist/<page>.html`（目标 ≥96，无 MAJOR）
