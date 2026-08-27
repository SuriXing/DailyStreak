# DailyStreak

A daily study check-in app that turns AP Computer Science review into a habit: one tap to check in, one lesson per day, and streaks that keep you coming back.

Built with Expo, it runs on **iOS** and the **web** from a single TypeScript codebase, with Supabase handling accounts and cloud-synced check-in history.

## Features

- **Daily check-in** — a one-tap button with instant feedback
- **Streak tracking** — Duolingo-style: if today is still unchecked, yesterday keeps your streak alive
- **Contribution calendar** — a GitHub-style heat map of the last 12 weeks, with today highlighted
- **Daily lesson** — knowledge cards with a short quiz and instant explanations, rotating daily per course
- **Multi-course framework** — any AP course or subject plugs in via the course registry (AP CSA / CSP / Calculus AB included)
- **Cloud sync** — email sign-up; history follows you across devices
- **Stats** — total check-ins and current streak at a glance
- **Accessibility-minded** — visible focus rings, `prefers-reduced-motion` support, screen-reader labels, polite live regions for feedback

## Tech Stack

| Layer | Choice |
|---|---|
| Cross-platform | [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) (React Native 0.86 + TypeScript) |
| Navigation | expo-router (file-based routing, classic tabs) |
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
│   ├── _layout.tsx          # Root layout: session gate (auth vs. tabs)
│   ├── auth.tsx             # Sign in / sign up
│   └── (tabs)/
│       ├── _layout.tsx      # Bottom tabs: check-in / study / profile
│       ├── index.tsx        # Check-in home (streak, calendar, stats)
│       ├── study.tsx        # Daily lesson + quiz
│       └── profile.tsx      # Profile, stats, sign out
├── components/streak-calendar.tsx   # 12-week heat map
├── data/courses.ts         # Course registry + lesson libraries (the framework core)
├── hooks/                   # useSessionUser, useTheme, …
└── lib/                     # Supabase client, check-in & streak logic
supabase/schema.sql          # Database schema (run in the SQL Editor)
```

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

## Deployment (Web)

```bash
npx expo export -p web   # outputs to dist/
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages).

## Quality Gates

```bash
npx tsc --noEmit          # type check
npx expo lint             # lint
```

The repo also carries a UXE design contract (`.uxe/`) that audits surfaces, tokens, and AI-tell patterns on rendered output.

## License

[MIT](LICENSE)
