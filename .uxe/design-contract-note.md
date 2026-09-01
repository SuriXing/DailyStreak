# Design Contract Note — DailyStreak UI Polish (2026-08-30)

## Surface
- **Product mode**: mixed-product (app-shell tabs + reader-surface study + dashboard-lite stats)
- **Target style**: antd-design-language (Ant Design v5/v6 token port: primary blue, neutral scale, radius, shadows, control heights)
- **Platforms**: iOS (Expo Go) + Web (static export)

## Typography
- antd system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`), never Inter/Poppins as the sole font (TELL-T01)
- Body 14-16px / lineHeight 23-24; headings 20-32px / weight 800

## Tokens (affected)
- `Colors.light/dark` — text(#141414) / textSecondary(#595959) / background(colorBgLayout #f5f5f5) / backgroundElement(colorBgContainer #fff) / backgroundSelected(colorPrimaryBg #e6f4ff)
- antd semantic colors: primary `#1677ff` (buttons/tab/focus ring), success `#52c41a` (check-in/calendar/correct), warning `#faad14` (today ring), error `#ff4d4f` (errors/wrong answers)
- Borders: `#d9d9d9` (default) / `#f0f0f0` (secondary); fills: `rgba(0,0,0,0.06/0.04)`
- Radius: sm 4 / md 6 / lg 8; ControlHeight: 32/40; shadows: antd boxShadow level 1 (cards) / level 2 (overlays)
- Spacing scale: 2/4/8/16/24/32/64

## Accessibility (from ask-ux-expert 20-accessibility + ai-detector)
- Inputs need label semantics: RN `accessibilityLabel` (TELL-K08)
- All interactive elements provide a `:focus-visible` focus ring (TELL-K02)
- Animations respect `prefers-reduced-motion` (TELL-P04)
- Error/success feedback uses live regions (aria-live) for dual-channel delivery (17-feedback-error)
- Body contrast >= 4.5:1 (textSecondary #595959 on #fff ~ 6.9:1 OK; cards on #f5f5f5 ~ 6.6:1 OK)

## Copy rules (from ai-detector TELL-X / TELL-T03)
- No em-dashes (`—`) or double em-dashes (`——`): use colons, commas, or sentence breaks
- No version footers or hero version labels (TELL-X10/X15)
- Sparse emoji in body copy (TELL-X01), keep only functional glyphs (flame for streak, check for check-in state)

## Forbidden drift
- No purple gradients, glassmorphism, or three-card marketing layouts
- No regression to the old green #58CC02 or old red #EA2B2B (superseded by the antd semantic colors)
- No `transition: all`, infinite animations, or motion without reduced-motion handling

## Verification
- `npx tsc --noEmit` && `npx expo lint`
- `npx expo export -p web` + `python3.14 ~/.claude/skills/ai-detector/scripts/ai-detect.py --format json dist/<page>.html` (target >= 96, no MAJOR findings)
