# DailyStreak

A daily study check-in app that turns AP Computer Science review into a habit: one tap to check in, one lesson per day, and streaks that keep you coming back.

Built with Expo, it runs on **iOS** and the **web** from a single TypeScript codebase, with Supabase handling accounts and cloud-synced check-in history.

## Features

- **Daily check-in** — a one-tap button with instant feedback
- **Streak tracking** — Duolingo-style: if today is still unchecked, yesterday keeps your streak alive
- **Contribution calendar** — a GitHub-style heat map of the last 12 weeks, with today highlighted
- **Daily lesson** — knowledge cards with a short quiz and instant explanations, rotating daily per course
- **Multi-course framework** — any AP course or subject plugs in via the course registry (AP CSA / CSP / Calculus AB included)
- **i18n** — full UI + lesson content in **中文 / English / Español**: device language detected on first launch, switchable in Profile, persisted locally
- **Cloud sync** — email sign-up; history follows you across devices
- **Stats** — total check-ins and current streak at a glance
- **Accessibility-minded** — visible focus rings, `prefers-reduced-motion` support, screen-reader labels, polite live regions for feedback

## Tech Stack

| Layer | Choice |
|---|---|
| Cross-platform | [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) (React Native 0.86 + TypeScript) |
| Navigation | expo-router (file-based routing, classic tabs) |
| i18n | Custom typed dictionaries (`src/i18n/`) + `expo-localization` for device detection |
| Backend | [Supabase](https://supabase.com) — Auth, Postgres, Row Level Security |
| Session storage | AsyncStorage (persisted auth session) |

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- (iOS) the [Expo Go](https://expo.dev/go) app on your iPhone, on the same Wi-Fi as your machine

### 1. Install

```bash
npm install
```

### 2. Configure Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run everything in [`supabase/schema.sql`](supabase/schema.sql). It creates the `profiles` and `checkins` tables, enables row-level security, and adds a trigger that seeds a profile on sign-up.
3. Optional but recommended: under **Authentication → Sign In / Up → Email**, turn off **Confirm email** so sign-ups are immediate.
4. Copy the **Project URL** and **anon public key** from **Project Settings → API** into `.env`:

```bash
cp .env.example .env
```

### 3. Run

```bash
# Web — open http://localhost:8081
npm run web

# iOS — scan the QR code with Expo Go
npm start
```

## Project Structure

```
src/
├── app/
│   ├── _layout.tsx          # Root layout: I18nProvider + session gate (auth vs. tabs)
│   ├── auth.tsx             # Sign in / sign up
│   └── (tabs)/
│       ├── _layout.tsx      # Bottom tabs: check-in / study / profile
│       ├── index.tsx        # Check-in home (streak, calendar, stats)
│       ├── study.tsx        # Daily lesson + quiz
│       └── profile.tsx      # Profile, stats, language switcher, sign out
├── components/              # Sidebar, streak calendar
├── i18n/                    # Typed dictionaries (zh/en/es), course-content overlays, provider
├── data/courses.ts          # Course registry + lesson libraries (the framework core)
├── hooks/                   # useSessionUser, useTheme, …
└── lib/                     # Supabase client, check-in & streak logic, i18n error helpers
supabase/schema.sql          # Database schema (run in the SQL Editor)
```

## Internationalization

DailyStreak ships three locales: **中文 (zh, base)**, **English (en)**, and **Español (es)**.

- `src/i18n/locales/{zh,en,es}.ts` — UI strings. zh defines the key set; en/es are typed against it, so a missing or extra key fails `tsc`.
- `src/i18n/content/{en,es}.ts` — translations of course content (lesson bodies, questions, options, explanations, skills, course descriptions). The Chinese text in `courses.ts` is the fallback whenever an overlay entry is missing.
- `src/i18n/context.tsx` — `I18nProvider` + `useI18n()` (`t`, `locale`, `setLocale`, `formatDate`). Device language is detected via `expo-localization` on first launch; the manual choice from **Profile → Language** is persisted to AsyncStorage.
- `src/i18n/core.ts` — `t()` with `{param}` interpolation, `Intl.PluralRules` plural forms (e.g. `study.remaining`), `Intl.DateTimeFormat` dates, and the course-content localizer.
- `npm run i18n:check` — CI-friendly completeness audit: dictionary key parity across locales and full course-content coverage.

## Adding a Course

DailyStreak is a framework: check-ins, streaks, the calendar, and cloud sync are course-agnostic. To plug in any AP course or subject:

1. Open [`src/data/courses.ts`](src/data/courses.ts).
2. Write an item array for the course (lessons rotate daily and loop once exhausted):

```ts
const MY_ITEMS: StudyItem[] = [
  {
    day: 1,
    subject: 'MYSUB',
    title: 'Knowledge point title',
    body: 'Knowledge card text',
    question: 'Quiz question',
    options: ['A', 'B', 'C', 'D'],
    answerIndex: 0,            // index of the correct option
    explanation: 'Answer explanation',
  },
];
```

3. Register it:

```ts
{
  id: 'mycourse',
  name: 'My Course',
  shortName: 'MY',
  color: '#1677ff',            // badge / switcher accent
  description: 'One-line intro',
  items: MY_ITEMS,
},
```

That's it: the course appears in the study tab switcher, and the selected course is persisted locally. Lessons start from `CONTENT_START` in the same file.

### Translating the course (optional)

Chinese is the base language and works out of the box. To make a new course fully available in English and Spanish, add entries to both `src/i18n/content/en.ts` and `src/i18n/content/es.ts`:

```ts
// src/i18n/content/en.ts
descriptions: {
  // …
  mycourse: 'One-line intro in English',
},
skills: {
  // …
  '技能名': 'Skill label in English',
},
items: {
  // …
  'mycourse-1': { title, body, question, options: [/* same order */], explanation },
},
```

Any entry you skip silently falls back to the Chinese base at runtime. Run `npm run i18n:check` to see exactly what is still missing.

## Deployment (Web)

```bash
npx expo export -p web   # outputs to dist/
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages).

## Quality Gates

```bash
npm run precheck           # 本地一键门禁: i18n completeness + type check + lint
npm run i18n:check         # i18n completeness audit
npx expo lint              # lint only
```

`npm install` 自动把 pre-commit 钩子装到 `.git/hooks`（`scripts/install-hooks.js`，幂等），每次提交前运行 `npm run precheck`；单次跳过用 `git commit --no-verify`。

Two lint layers guard the i18n setup:

- **Type level** — `en`/`es` dictionaries are typed against `zh`, so a missing or extra key fails `tsc`.
- **ESLint `local/no-hardcoded-copy`** — hardcoded Chinese copy in `src/{app,components,hooks,lib}` fails lint; UI strings must go through `t()` (`src/i18n/` and the course base in `src/data/courses.ts` are exempt).

Browser smoke test (Playwright): verifies the auth gate, sign-up, check-in, and all three tabs against a running dev server.

```bash
npx playwright install chromium   # once, after npm install
npm run web &                     # dev server
npm run smoke                     # 14 assertions, exits non-zero on failure
```

CI (`.github/workflows/ci.yml`) runs type check, lint, web export, and the smoke test on every push (smoke needs the `EXPO_PUBLIC_SUPABASE_*` repo secrets).

The repo also carries a UXE design contract (`.uxe/`) that audits surfaces, tokens, and AI-tell patterns on rendered output.

## License

[MIT](LICENSE)
