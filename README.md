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
- `src/data/flashcard-i18n.ts`, `src/data/flashcard-i18n-scenario.ts` — per-card translations keyed by card id: the AMC 10 concept cards in the first file, the 125 scenario items in the second, kept apart so the two card families never move each other's text. `localizeFlashcard()` returns the Chinese card whenever the entry is missing, so a half-translated deck degrades card by card instead of breaking.
- `npm run i18n:check` — CI-friendly completeness audit: dictionary key parity across locales and full course-content coverage.
- `npm run check:flashcards` — the deck gate; it also holds the overlay to a structural standard: an entry for every scenario card, the same four option letters, the same keyed answer letter as the Chinese, an English `Correct option` matching the option it names, no Chinese characters left, and no entry pointing at a card that does not exist.

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

## Flashcard Question Bank

The 1289 practice cards are generated data, not copy typed into the app:

| Decks | Cards | Source material | Generator |
|---|---|---|---|
| AMC 10（算术与数论 / 代数·函数·数列 / 几何 / 组合·概率 / 综合·策略） | 564 | the `2*-Flashcards-*.md` files of the AMC 10 material pack | `scripts/build-amc10-flashcards.js` |
| AP CSA, CSP, Precalculus, Calculus BC, Statistics | 600 | the `*原创选择题*.md` banks plus their answer keys | `scripts/build-subject-decks.js` |
| 五科情境题（`*-scenario`） | 125 | authored for this repo: stimulus plus two to four reasoning steps per item | `scripts/build-subject-decks.js` |

Both builders read the sources committed under `content/` — the AMC 10 flashcard decks and the five
subject question banks with their answer keys, and nothing else from the material pack (the PDFs and the
study guides stay outside the repo). They write committed TS modules — `src/data/amc10-flashcards.ts` and
`src/data/subject-decks/*.ts` — each headed with `// AUTO-GENERATED … Do not hand-edit.`. To change a card,
edit the markdown under `content/` and regenerate:

```bash
node scripts/build-amc10-flashcards.js [srcDir]   # default: content/amc10-flashcards
node scripts/build-subject-decks.js [baseDir]     # default: content/subject-banks
```

Regenerating leaves the committed data untouched unless the markdown changed, and because the verification
ledger keys on a hash of each card's text, a real edit drops those cards back to `verified: false` until
somebody reworks them.

### Difficulty, and what tagging it revealed

The 600 drill items carry a `difficulty` from 1 to 4, assigned against the rubric written into
`content/subject-banks/difficulty.json` and enforced by the gate (a drill deck with any untagged item
fails). The levels are a rubric judgement, not an empirical calibration: nobody has answered these items and
had their score recorded, so treat them as "how much work this asks for", not as "how often students get it
wrong". The scenario decks are deliberately untagged and the field is optional for them - inventing levels
for items nobody graded would be worse than admitting the gap.

The useful part is the distribution, because it measures something the earlier qualitative complaints could
only assert. Five reviewers graded all 600 items independently and reported the same shape:

| Deck | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|
| CSA | 55 | 50 | 13 | 2 |
| CSP | 90 | 19 | 9 | 2 |
| Precalculus | 61 | 42 | 16 | 1 |
| Calculus BC | 68 | 43 | 8 | 1 |
| Statistics | 91 | 22 | 5 | 2 |

Level 1 is between 46% and 76% everywhere, and levels 3 and 4 together are 4% to 12%. A "hard practice"
filter over the statistics bank would have seven items to draw on. The cause is the item format rather than
harsh grading: roughly half of each bank is a one-line question answerable from a single fact, and the items
that are genuinely hard are hard by trap - an overload that resolves differently than it looks, an index that
shifts under a deletion - which is exactly what level 3 covers. Building a real three- or four-step tier means
writing new items, not relabelling these.

### Which cards exist in English

The Chinese text is the base and the English overlay is built in three layers, one per card family, because the
three families move for different reasons and a translation round on one should not be able to disturb the
other two:

| Layer | File | Cards | Status |
|---|---|---|---|
| AMC 10 concept cards | `src/data/flashcard-i18n.ts` | 520 of 564 | the geometry tail is still Chinese |
| Drill banks | `src/data/flashcard-i18n-drill.ts` | 480 of 600 | Calculus BC still to come |
| Scenario decks | `src/data/flashcard-i18n-scenario.ts` | 225 of 225 | required by the gate |

`localizeFlashcard()` falls through the layers and returns the Chinese card whenever an entry is missing, so a
half-translated deck degrades card by card rather than breaking. The gate enforces full coverage only for the
scenario decks, reports the fraction everywhere else, and holds every entry that does exist to a structural
standard: four option lines with the same letters, the same keyed answer letter as the Chinese, an English
`Correct option` matching the option it names character for character, no Chinese characters left, and no entry
pointing at a card id that does not exist.

### How the overlay stays in step with the Chinese

Every entry also records `src`, a hash of the Chinese card's front at the moment it was translated, and the gate
fails when that hash stops matching. Without it there are two silent failures: a reordering of options whose
answer letter happens not to move leaves the English options in the old order, and a rewording of a distractor
leaves the English describing something the Chinese no longer says. Both look fine to every other check.

The rotation that balances answer letters is frozen in `content/subject-banks/rotation-plan.json` for the same
reason. It used to be derived from the deck's item count, so appending a batch of items reshuffled the answer
letters of the items already in the deck - which invalidated their translations, and did it to sixteen cards
before anyone noticed. The plan is now a committed per-deck letter list that only ever grows at the end.

### Provenance, and what this bank is not

Every card carries `source` and `verified`:

- `source: 'amc10-concept'` — the AMC 10 cards are a rewrite of the pack's knowledge map（知识点拆解），
  not exam questions. Expect prompts like "运算顺序是什么？" rather than competition problems.
- `source: 'ai-mcq'` — the AP items are AI-written multiple choice. The material pack says so itself
  （“文件名标注「原创」的题由AI生成”）, and its own QA report records that the original questions were
  never independently recomputed.
- `verified` — whether the answer went through an independent recomputation pass.
  `scripts/flashcard-verification.json` records a hash of the text that was checked, and the builders stamp
  the flag only while the hash still matches, so editing a card drops it back to unverified until somebody
  reworks it. The practice screen shows the state on every card and repeats the provenance note under the
  filters.

### What "verified" does and does not mean

On 2026-09-19 every card was recomputed by independent reviewers — sixteen sharded passes, with hand
recomputation of every flagged item and of the eighteen questions the answer parser had been dropping.
That pass found and fixed two wrong answer keys, two questions with a second defensible option, one
question with no context at all, three unusable stems, and twenty-six concept cards missing a condition or
an equality case. So `verified` means an AI recomputation pass with spot checks from a human-driven
session — **not** a human expert review — and the bank is still review material: prefer official College
Board questions when the stakes are real.

### Guarding the generated data

```bash
npm run check:flashcards   # 声明张数 / id 连续且等于源题号 / 四个选项 / 无重复标签 / 答案字母自洽 / 来源字段 / 承接行齐全
```

### The bundle carries a packed copy

The app does not import the generated deck modules directly. `scripts/pack-decks.mjs` packs them into
`src/data/deck-pack.ts` — a gzip+base64 blob that `src/data/deck-pack-loader.ts` unpacks at startup — and
`src/data/flashcards.ts` imports only that loader. The packed form is 132 KB instead of 321 KB of plain
object literals, which takes about 190 KB off the web bundle and keeps the card text out of a
straightforward grep of the shipped JS. That is obfuscation, not protection: the app has to unpack it, so
anybody can. The plain modules stay in the repo because the deck check reads them.

Two gates keep it honest: `check:flashcards` re-packs and compares, so a stale blob fails the commit, and
it also fails if any app file imports a plain deck module again. Both builders refresh the blob on their
own, so `npm run pack:decks` is only needed when you pack without regenerating.

The check exists because all 240 CSA and CSP cards once shipped with their first option reading
`A. A. 3`: the builder split the option line and left the label inside the first option's text, which
the UI then prefixed a second time. It also pinned the runtime parser down — a stem may span several
lines, so the option block is located by the first `A. ` line instead of assuming line two.

The deck check also keeps the two gaming holes closed: every deck has to keep each answer letter near
25% so guessing "always B" scores like random, and the correct option may not be the longest more than
40% of the time per deck (30% overall) so option length does not signal the answer. That metric counts a
tie as the longest option and charges it to the first of the tied ones, which reads higher than "uniquely
longest"; the decks currently sit at 28–36% and the bank at 26%, or 13–28% and 20% on the stricter
reading. Scenario decks have their own gate: at least 20 items, and at least 75% of stems at least 30
characters, so a single-step drill cannot be relabelled as a scenario item; none of them ever has the
correct option as the longest under either reading.

`content/` is the source and `src/data/*.ts` is the product, and the two are now compared on every check:
the gate rebuilds both deck builders into a temporary directory and diffs the result against the committed
modules. Without it, editing a question in `content/` and forgetting to regenerate left the repo holding
two contradictory versions of the same card — the app serves the generated one — while every shape check
passed, because each copy was individually well formed. That is not hypothetical: five rounds of option
rewrites committed on 2026-09-25 sat in `content/` without reaching the app until the builders were rerun
by hand, which is why the gate exists.

Two more failure modes are guarded now. The answer key parser used to join the whole key file into one
line and anchor its regex at the start, so every `## 1–20` heading swallowed the first answer of its
block — eighteen questions never reached the app. The builder now refuses to write anything if a source
question would be dropped, and the check requires ids to run `deck-001…deck-120`, so a missing number
cannot hide. Cards whose stem says "上题/上式" also carry the referenced question as an inlined
`【承接上题】` line, because cards are shown one at a time and free practice shuffles by default.

## Quality Gates

```bash
npm run precheck           # 本地一键门禁: i18n completeness + 闪卡数据校验 + ruff + type check + lint + UXE 设计契约
npm run check:flashcards   # 闪卡生成数据完整性校验（张数 / id 连续 / 选项 / 答案字母 / 来源字段 / 承接行）
npm run typecheck          # tsc --noEmit
npm run lint               # Expo ESLint
npm run lint:py            # ruff 检查 .uxe/scripts（配置在 pyproject.toml）
npm run i18n:check         # i18n completeness audit
npm run uxe:check          # UXE 设计契约检查（antd token 一致性 / 对比度 / 明暗对称）
```

`npm install` 自动把 git 钩子装到 `.git/hooks`（`scripts/install-hooks.js`，幂等）：

- **pre-commit** — 运行 `npm run precheck`（快门禁：i18n / ruff / 类型 / lint / UXE 设计契约）。
- **pre-push** — 运行完整 `precheck` + `expo export -p web` 构建门禁，与 CI check job 对齐。

单次跳过用 `--no-verify`（`git commit --no-verify` / `git push --no-verify`）。ruff 只需装一次：`python3 -m pip install --user ruff`。

Two lint layers guard the i18n setup:

- **Type level** — `en`/`es` dictionaries are typed against `zh`, so a missing or extra key fails `tsc`.
- **ESLint `local/no-hardcoded-copy`** — hardcoded Chinese copy in `src/{app,components,hooks,lib}` fails lint; UI strings must go through `t()` (`src/i18n/` and the course base in `src/data/courses.ts` are exempt).

Browser smoke test (Playwright): verifies the auth gate, sign-up, check-in, and all three tabs against a running dev server.

```bash
npx playwright install chromium   # once, after npm install
npm run web &                     # dev server
npm run smoke                     # 30 assertions, exits non-zero on failure
```

CI (`.github/workflows/ci.yml`) runs i18n check, ruff, type check, lint, web export, and the smoke test on every push (smoke needs the `EXPO_PUBLIC_SUPABASE_*` repo secrets).

The repo also carries a UXE design contract (`.uxe/`) that audits surfaces, tokens, and AI-tell patterns on rendered output.

## License

[MIT](LICENSE)
