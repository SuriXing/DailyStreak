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
- `src/i18n/core.ts` — `t()` with `{param}` interpolation, `Intl.PluralRules` plural forms (a dictionary entry may hold per-category templates; no key uses one today), `Intl.DateTimeFormat` dates, and the course-content localizer.
- `src/data/flashcard-i18n.ts`, `src/data/flashcard-i18n-scenario.ts` — per-card translations keyed by card id: the AMC 10 concept cards in the first file, the 262 scenario items in the second, kept apart so the two card families never move each other's text. `localizeFlashcard()` returns the Chinese card whenever the entry is missing, so a half-translated deck degrades card by card instead of breaking.
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

The 1466 practice cards are generated data, not copy typed into the app:

| Decks | Cards | Source material | Generator |
|---|---|---|---|
| AMC 10（算术与数论 / 代数·函数·数列 / 几何 / 组合·概率 / 综合·策略） | 564 | the `2*-Flashcards-*.md` files of the AMC 10 material pack | `scripts/build-amc10-flashcards.js` |
| AP CSA, CSP, Precalculus, Calculus BC, Statistics | 640 | the `*原创选择题*.md` banks plus their answer keys | `scripts/build-subject-decks.js` |
| 五科情境题（`*-scenario`） | 262 | authored for this repo: stimulus plus two to four reasoning steps per item | `scripts/build-subject-decks.js` |

Those numbers are not typed here by hand: `npm run bank:stats` computes every count in this
section from the generated data, and `npm run check:flashcards` fails when this table, the English
coverage table below, the difficulty ranges, or the totals quoted in the prose stop matching it.
The tables used to be maintained by hand and drifted twice before anyone noticed (a bank of 254
scenario items was described as 125, and 1454 cards as 1289), which is exactly the class of error
a reader cannot see.

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

### How this bank is checked, and what is still weak

Every commit runs the same gate, which has grown to cover: card shape (id sequence, four options with the right
letters, no empty or duplicated options, no escape-hatch distractors), provenance fields, the answer letter
distribution, the length of the correct option, duplicated stems across decks, source-versus-generated sync for
both builders, an English overlay that must match the Chinese card it was translated from, and a difficulty level
on every item. Two builders cannot write a deck that drops a source question or leaves an item untagged.

Beyond the gates, the content has been through three adversarial passes, in which a reviewer solved every item
from the stimulus before reading the key and then reported every defect it could find. They found and this
repository fixed: a wrong tangent-secant application, a false Java claim inside a keyed explanation, two items
whose stated misconception could not produce the number it showed, a chi-square explanation whose terms summed
to 10.33 while claiming 8.67, an option that asserted the true conclusion with an invalid reason, a distractor
that was a technically valid error bound, eleven distractors that were filler or absurd, two options copied
verbatim from an earlier item, and one stem that pre-emptively falsified its own option. The passes also disagreed
with each other once, about whether the second batch of scenario items was weak as a whole or only in clusters,
and the item-level grading settled it in favour of the narrower reading.

What is still weak, stated plainly: the drill banks' hard tier is thin rather than absent (22 level-4 items across
640, four to five per bank), and every one of them was written for this purpose rather than relabelled; the second
batch of CSP scenario items leans on a handful of clusters that resolve to one concept despite a multi-clause
stem - the clearest is two Create-task report items (48, 50), and three data-quality items (30, 31, 32)
sit next to each other without overlapping exactly; the difficulty levels are rubric judgements with no student
data behind them; and the browser smoke test cannot run in every environment, so its assertions are checked by
inspection rather than by execution when the network to Supabase is unavailable.

The English overlay deserves its own paragraph, because this is where the corrections keep coming from. The
script that aligns it (`scripts/sync-overlays.mjs`) matches English option lines to Chinese ones by a
language-neutral fingerprint taken from inside them (the numbers first, and since 2026-10-21 the identifiers as
well), which only works when that material is distinctive: in one audit - a one-off measurement, not a running
count - the number fingerprint verified the order automatically for about 229 of the 890
option cards and could not judge the rest, so those were compared by eye, and three swapped answers fell out of
that reading (precalculus 031, 039 and 046 - in each case the English `Answer:` pointed at a distractor while the
Chinese was right). A fourth, `csp-125`, was found only after the fingerprint itself was repaired: it had been
reading both `10⁻⁶` and `10⁻²` as the number 10, concluded the two options were indistinguishable, and skipped the
card, so nothing ever compared its Chinese `A` (10⁻⁶, the correct option) with its English `A` (3×10⁻²). With
superscripts and signs normalised the number fingerprint settled 601 of the 902 option cards, and since 2026-10-21
the fingerprint is no longer numbers alone: language-neutral **identifiers** are folded into the same signature -
`substring`, `ArrayList`, `toUpperCase`, `length()`, `int[]`, `Math.random`, `java.util.ArrayList` - but only in
shapes both languages write verbatim (dotted paths, camel-case and Pascal-case names carrying a second capital,
call-with-parens, all-caps constants and acronyms, array types, and a closed vocabulary of primitive types and JDK
class names). Bare English words are deliberately *not* tokens: `for`, `while`, `static` and `finally` are prose on the English
side and code on the Chinese side of the same cards, and taking them as words raises the decidable count by two
(660 to 662) while pushing three already-decidable cards into the human queue as false alarms - `csa-scenario-010`
(the Chinese writes 静态字段, the English `static field`), `csa-scenario-040` and `csa-scenario-050` (`finally`
sitting on a different option) - which dilutes the one list where the machine claims to have evidence; a keyword is
a token only when it is written as code (`for (`). One normalisation runs the other way and is kept: an acronym's
plural falls back to its stem (`SDs` → `SD`), because the Chinese writes `SD` where the English writes `SDs`, and
without it `stats-080` and `csp-033` fall out of the decidable group (660 → 658, 20 → 22). A second filter makes
the English side structurally unable to manufacture a mismatch: an identifier only counts if it also appears
somewhere among that card's Chinese options - measured, that removed 102 spurious regressions and cost nothing,
while instead constraining the keywords to code context dropped the decidable count to 652, below the 660 that no
keyword at all gives. The combined fingerprint now settles **660** of the 902: **304** outright,
where the four fingerprints are distinct and the two multisets match so the script can re-derive the order, and
another **356** because the two sides' fingerprint sequences already agree letter for letter, which is not a proof
but is the order already being right. **20** cards have fingerprints on both sides that do not line up at all - the
same twenty as before, not one card fell out of the decidable group into it - and those are the ones a person has to
read. The remaining **222** have neither a digit nor an identifier among one side's four options, where the
fingerprint carries no information: 202 of them have nothing in either language (plain prose options) and 20 have
English identifiers that the Chinese translated into words, which the same-side filter drops rather than guesses
about. The 559 that used to stand in this sentence was 898 minus the 339
`--check` listed for review, which counts "not reported" as "proved"; `--check` now prints those three groups
separately instead of one "skipped (N)" line, with the ids of the two a person has to act on, and it says in the
same breath that none of it affects its exit code. A fifth wrong key, `csp-126`, came out of reading the 20-card
list by hand rather than out of the tool: its English options were permuted against the Chinese, so `Answer: A`
pointed at the
systematic-picking distractor that the English explanation itself calls wrong, and the card is still on the list
after the fix in this commit, because the English writes `tenth` where the Chinese writes `10` - which is exactly
why the fingerprint could not see it in the first place. A further hazard is specific to
this repository's build: an item is not option-rotated when its explanation mentions A/B/C/D, so *writing* a
letter reference into an explanation changes how the item is built. Adding references in the wrong order is
therefore not a documentation slip but a content error, and it happened four times in one sitting before anyone
noticed. The gate now refuses it: a brief may not attach a mistake ("forgot", "mistook", "treated X as Y") to the
letter that holds the correct option. Items whose stems carry a leftover line from the previous question (the
"carrying on from the last item" cards) and one stem that merges two questions (calculus 112) are known and left
alone; they are wording problems rather than wrong keys.

### Which guarantees the machine enforces, and which are only a promise

The paragraphs above say things like "the gate checks ...", and a reader cannot tell from them whether a given
sentence is a script standing in the way or somebody who has to go and read for it. The table below takes that
apart row by row: **each row is one guarantee**, "enforced by" names the mechanism that actually keeps it true
(a script, or a human read), "fails when" is the trigger condition as the current code reads it, and "known blind
spot" is the part that mechanism cannot reach. Every number in the table comes out of `npm run bank:stats`,
`node scripts/sync-overlays.mjs --check`, `npm run test:session` and `npm run check:flashcards` rather than being
transcribed by hand.

| Guarantee | Enforced by | Fails when | Known blind spot |
|---|---|---|---|
| Card shape: the count the file header declares equals the number of cards; ids are consecutive and equal the source item numbers; exactly four `A./B./C./D.` lines; no empty option and no leftover label; `答案：X` and `正确选项：…` agree character for character | `check-flashcards.mjs` (`parseCards` / `checkIdSequence` / `checkSubjectCard`) | hand-edited data, a parser regression, a gap in the source numbering | shape only: the option order, the stem text and whether the answer is right are all outside what it knows |
| Concept cards (564 of them) carry no option lines, and `level` is one of `core`/`advance`/`boundary` only | the same (`checkConceptCard`) | an option block leaks into a concept card, a `level` is misspelled | it recognises three literal values; whether the level is the right one is not its question |
| When a stem says 上题/上式/上述/前一题 (*the previous item / the formula above / the above / the preceding question*), `front` must open with `【承接上题】` (*carrying on from the last item*) | the same (`checkBackReference`) | the carry-over line is deleted | it knows those four words; word it differently and this check has no object left to look at |
| `source` is valid, `verified` agrees with the ledger hash, and the ledger holds no orphan ids | the same (`checkProvenance`) plus `scripts/flashcard-verification.json` (1466 cards registered, 1466 actually verified right now) | `front`/`back` edited without updating the ledger → the gate fails outright and prints the old and the new hash | it proves that this version of the text was read through once, and nothing about the quality of that read - whether a distractor's stated mistake really produces the number it shows is not a judgement a machine makes |
| The `FlashcardSource` union still carries `'amc10-concept'` / `'ai-mcq'` | the same (`checkSourceUnion`) | a literal is deleted → the provenance label in the UI silently takes the wrong branch | it compares two strings; whether the source is actually filled in correctly is not in its hands (see the row above) |
| The generated data stays in step with the `content/` sources | the same (`checkDeckSourceSync`: both generators rebuilt into a temp directory and compared character for character) | a source is edited and the generator chain is not re-run | it proves the products equal what the current sources rebuild to, and nothing about whether the items inside those sources are right |
| The bundle's packed blob matches the deck data, and app code may not import a plain deck module | the same (re-pack, compare the unpacked content, plus `checkNoPlainDeckImport`) | cards are edited without a re-pack, or somebody imports a plain module back into the app | packing saves size and defeats `grep`, and that is all it does - the number it prints is nothing but the length of `deck-pack.ts` |
| Answer-letter distribution: in every deck of 40 cards or more, each letter sits at 25% ± 10 percentage points | the same (`checkAnswerPositions`) | a regeneration crowds the answers onto one letter | concept cards have no answer letter and take no part; it constrains the aggregate, so no individual card is guaranteed anything |
| The "correct option is the longest" rate: at most 40% per deck and 30% across the bank (a tie counts against the earliest of the longest options) | the same (`checkOptionLengthBias`) | option length starts leaking the answer again | again an aggregate only, so a single card's correct option may well be the longest; this measure reads higher than a strict "longest" count |
| Scenario decks: at least 20 items, and at least 75% of stems carrying stimulus material (several lines, or 30+ characters) | the same (`checkScenarioDecks`) | one-step questions are used to make up the numbers | it stops the crudest degeneration only; it does not judge whether the scenario genuinely needs several steps |
| Duplicate stems | the same (`checkDuplicateItems`: punctuation and whitespace stripped, first 80 characters compared) | copy-paste produces two cards with one stem | it catches stems that are identical after normalisation, and cannot see near-duplicates of one concept (the CSP clusters) |
| Option shape: empty options, two options with identical text, and escape hatches of the 以上都不对/无法判断 (*none of the above / cannot be determined*) kind when one of them is a distractor | the same (`checkOptionShape`) | a generator or a hand edit produces such an option | the escape-hatch rule fires only when the option itself is short (12 characters or fewer), and a *correct* answer written that way is allowed |
| An explanation may not attach a mistake to the letter that holds the correct option | the same (`checkBriefLetterReferences`) | an explanation pairs a letter with 漏/忘/误/把/当成 (*missed / forgot / mistook / treated as*) and that letter is the answer letter | the criterion is deliberately narrow: only that one set of mistake verbs counts, 正确/成立 (*correct / holds*) right after the letter exempts it, the English explanations' letter references are not checked at all, and a letter pointing at the **wrong distractor** (the explanation names the wrong one) it cannot see |
| Difficulty: every drill card must carry a 1-4; no deck of 40 cards or more may put more than nine tenths of its items on one level; and **no deck may hold zero level-4 *or* zero level-1 items** | `check-flashcards.mjs` (`checkDifficulty` plus `checkDifficultyShape`) and the generators, which `throw` on a missing annotation | a missing annotation, a `0` or a `5`, a whole deck collapsed onto one level; or a deck's hardest tier hollowed out (`precalc-scenario` once held none, so the difficulty filter in that deck could not produce the top level at all while the gate stayed green, until somebody happened to look); or the mirror defect at the warm-up end (`csa-scenario` at `0/23/25/4` and `precalc-scenario` at `0/28/22/4` within the same two days, so a student who wanted a warm-up in those decks had to start at level 2) | scenario difficulty is not asserted card by card (`checkDifficulty` demands a level only on the non-`-scenario` decks, and the scenario side is held by the builder throwing plus the product-versus-source diff); whether the level is right is not the machine's judgement; fewer than three items at either end is one line on stderr rather than a failure (`LEVEL1_EMPTY`/`LEVEL1_THIN` and `LEVEL4_EMPTY`/`LEVEL4_THIN` are the engineering judgement "smallest usable number of items in that tier", not a statistical result, and the summary line reports both ends' totals and thinnest deck on every run, so the decks sitting at one or two level-1 items print a warning today). Also: moving items out of either end usually pulls a min down in the Deck family table above, so a red here often drags a README drift along with it |
| The README's bank counts and its two self-descriptions: the decks-by-family table, the `N of M` column of the English coverage table, the sixteen percentages of the difficulty table, the four prose sentences that name a total, the three sizes in the bundle paragraph, and the assertion count in the smoke-test command block | `check-flashcards.mjs` (`checkReadmeBankCounts`, with the figures taken from `bank-stats.mjs`) | a hand-written number drifts after items are added; or a table header or a wording change stops parsing (that fails too, rather than letting the check lose its object) | it covers only what it recognises: the three tables, the four sentences, and - since 2026-10-18 - the bundle paragraph's three sizes and the smoke command's assertion count, both of which had been wrong for months without anybody noticing (the paragraph claimed 132 KB instead of 321 KB against a real 196 KB instead of 586 KB, and the command block claimed 30 assertions against 152 call sites). The remaining numbers in this README are still hand-kept and ungated |
| The English overlay is structurally self-consistent: four option letters, the same keyed answer letter as the Chinese, a `Correct option` matching the option it names character for character, no Chinese characters left, no orphan ids, and a `src` hashing the current Chinese `front+back`; scenario items must be covered in full | `check-flashcards.mjs` (`checkFlashcardOverlay`) | the Chinese is edited and the English does not follow (`src` stops matching); a scenario card with no entry | it validates structure and self-consistency, **not the meaning of the translation** - `Answer: A` and `Correct option` can be wrong together, each corroborating the other (`csp-126` did exactly that until 2026-10-17: its English options were permuted and both fields pointed at the same wrong method while the gate stayed green); a drill or concept card with no entry only reports a fraction rather than failing. `src` is also recomputed mechanically by `sync-overlays.mjs --write`, **including for the cards that script could not align**, so that hash witnesses that the script was run and not that a human read this version of the English |
| The English option order corresponds to the Chinese letter by letter | the number-plus-identifier fingerprint in `scripts/sync-overlays.mjs` (= `npm run check:overlays`) | `--check` exits non-zero when it needs to reorder options or recompute `src` | measured today over 902 option cards: **660** are decidable (**304** with a unique fingerprint and matching multisets on both sides, which proves the order - **282** of those were provable on numbers alone before 2026-10-21 and **22** more are provable only because identifiers joined the signature; **356** whose two fingerprint sequences already agree position by position, so the order was right to begin with - of those, **122** repeat a fingerprint, **56** have one option with no signal at all and **178** have both); **20** have fingerprints on both sides that do not line up at all, listed by id by `--check`, and **that is the real work queue** (the same twenty cards as before identifiers were added, so the wider fingerprint bought no false alarms); **222** have neither a digit nor an identifier among one side's four options, where the fingerprint carries no information and the machine cannot judge (before the repair this group was **silently dropped**, and it is now its own bucket, because it is "unmeasured" rather than "checked and fine"). Another five (`precalc-scenario-033/034/040/041/042`) cannot be ordered by the fingerprint itself and are ordered by the explicit permutation in `scripts/overlay-order-overrides.json`; they sit inside the three groups above and are not counted again. **Only those first two counters reach the exit code** - they are the "somebody edited the Chinese and did not run `--write`" states, one command away from fixed - and since 2026-10-19 that exit code is a gate: `check:overlays` runs inside `precheck`, in both git hooks and in the CI check job. Neither of the two record lists does, on purpose; a green `--check` therefore still does not mean the English order is right, only that nothing was left half-done |
| The zh/en/es UI dictionaries have identical key sets, and the course content is covered | `scripts/check-i18n.mjs` (120 keys, 17 entries / 17 skills / 3 courses) | a key is added only to `zh`, or a course item is left untranslated | it checks that keys exist and that the sets are equal, never what a translation says; the English card overlay is not here (it is in the two `check-flashcards` rows) |
| The practice page's filter and sort semantics, and the identity "the tiers summed plus the ungraded items equal the total" over the real bank | `scripts/test-session-logic.mjs` (60 tests, needs Node 22.15 or newer) | the semantics of `filterCards` / `availableDifficulties` / `orderCards` / `summarizePool` are broken | it tests the lib layer's return values only: no rendering, no clicking, no flipping |
| The local bank chain (`content/local/` → `public/local-deck.json` → the card pool → the difficulty filter) | the round trip in the same script (it really runs the generator in a temp directory) plus `build-local-bank.mjs` skipping an item whose annotation is misspelled | a generator parse regression, a difficulty marker written wrong | **it has never run in a browser**: there is no `public/local-deck.json` on this machine and no `.env.local` to switch `EXPO_PUBLIC_LOCAL_DECK=1` on (off by default), so the fetch → pool → render hop is covered by unit tests alone |
| End-to-end UI behaviour: the login gate, sign-up, check-in, the three tabs, difficulty multi-select and keyboard use, sorting, the bank overview's numbers, no horizontal overflow at 390px and 1280px, zero console errors | `scripts/smoke-test.js` (Playwright, 152 assertion call sites - `assert(...)` 125, `assertI18n` 20, `assertLabel` 7, counting neither the three declarations nor the two calls inside the helpers, and some of them sit in loops; printed by `npm run bank:stats` and checked against this file) | a dev server on 8081 (or `SMOKE_BASE`), an installed chromium, and a reachable Supabase for a real sign-up; the CI smoke job **skips the whole block** when the secrets are not configured (one warning line), and the script itself has no skip logic | the item counts and difficulty denominators are recomputed from the generated data, but the local deck hop is not in it; it does not compute contrast in the browser (that audit was a throwaway script that does not live in the repo); the test accounts are real registered users and clean themselves up only when an admin token is configured |
| The UXE design contract: antd token consistency, light/dark symmetry, raw hex in components, three contrast groups | `.uxe/scripts/check.py` (= `npm run uxe:check`, run by both CI and `precheck`) | a hard-coded colour in a component, a missing token, an asymmetric light/dark pair, contrast below the threshold | a static check: it reads the tokens in `src/constants/theme.ts` and the literal colours in the component files, and the pixels that actually render are not in its hands |
| Whether the content is correct: the answers themselves, whether a distractor's stated mistake really produces the number it displays, the mathematics in the explanations, the meaning of the English translation | **a human read** (three adversarial review passes plus the verification ledger) | only a person reading can find these; not one of them is a machine judgement | `check-flashcards` does not even know whether an item's answer is right, and the ledger proves only that somebody reviewed this version of the text |
| Whether a difficulty level is right (each of the four judgements) | **a human read** (the criterion and the re-grade procedure are in `docs/difficulty-rubric.md`, with a real example at every level) | a reviewer recomputes independently against the rubric | the rubric grades expected work rather than measured difficulty; the machine asks only whether a level exists, whether it is 1-4, and whether the distribution has any spread |
| The English option order for the **242** cards the fingerprint cannot decide | **a human read** (`sync-overlays.mjs --check` now prints the three groups separately and lists the ids in both the "needs a human" and the "no signal on one side" buckets) | - | the **20** cards with fingerprints on both sides that do not line up are the class the script can flag and therefore hand to a person, and they are the real work queue; for the **222** with no signal on one side the script has nothing to say and no lead to give, so somebody has to read the two languages side by side. All twenty were read card by card: **19** are notation differences (Chinese `.4` against English `0.4`, the literal `H0` read as the number 0, `1,000,000` split into 1/0/0, the superscript of `χ²` read as 2, `万元` against million, an English sentence that drops a number the Chinese states) and **1** (`csp-126`) was a real misalignment, since fixed (and still on the list after the fix, because the English writes `tenth` where the Chinese writes `10`, which the fingerprint cannot see) |
| The README numbers and claims that those four regexes do not cover | **nobody** (whoever writes them is responsible) | - | the gate guarantees only the places it recognises; everything else is exactly as trustworthy as it reads |

About the two overlay rows above: the README used to say "the fingerprint now proves the order for 559 of the 898
option cards", and that sentence is gone, replaced by the three groups `--check` computes today. 559 was 898 minus
the 339 cards `--check` listed for manual review, which counts "not reported" as "proved" - and that 339 was only
the pile where both sides had numbers that would not line up (that figure has since moved on), while the remaining
281 cards had no digits among one side's four options and were never reported at all. The current readings, after
identifiers joined the fingerprint on 2026-10-21, are **660 decidable / 20 needing a human / 222 with no signal on
one side** (the numbers were 601 / 20 / 281, the same twenty cards in the middle, and
the 59 that moved were moved by identifiers alone: 49 of them CSA or CSP, the two code-heaviest families; three of
those 59 - `csa-043`, `csa-047`, `csa-077` - went all the way from "no information" to "provable", which is the only
status under which a swapped pair goes red). Within the 660, 304 have a unique fingerprint that proves the order and
356 have fingerprint sequences that agree position by position, so the order was right already (not a proof, but
right, which is why they are no longer raised as a problem); the **20** are the real work queue, because they are
the one class where the machine has evidence of a mismatch, and `--check` lists them by id; the 222 are a different
matter - the script has not "checked them and found nothing wrong", it has "found not one digit and not one
identifier it can judge", so they are neither in the queue nor a green light.

One of those twenty was a live error of exactly this shape: `csp-126`'s English options were out of order against
the Chinese, so `Answer: A` landed on the "sort the data and take every tenth record" distractor (the Chinese A is
"resample with replacement many times and record each median", and the English explanation itself says systematic
picking is wrong), and the gate waved it through because all it asks is whether the English is internally
consistent. It has since been fixed: the English option lines were reordered letter by letter against the Chinese
(A resampling with replacement, B the every-tenth-record pick, C the Central Limit Theorem, D the group medians),
`Answer: A` and `Correct option` followed onto the correct A, and not one character of the Chinese changed, so `src`
did not either. The shared shape of this class is "structurally consistent, semantically displaced" - nothing but
reading the two languages side by side finds it, and the card stays on the twenty-card list after the fix, because
the English writes `tenth` where the Chinese writes `10`, a rewriting the fingerprint cannot see, so `--check`
still cannot judge it.

Which half of `--check` became a gate was a decision, not a default. The script had always exited non-zero on its
two actionable counters - `src` needing a recompute, and options needing a reorder - and never on the three lists
it prints for a human, but nothing ran it, so "English options permuted against the Chinese" was the one class of
defect that only surfaced when somebody happened to remember (`csp-126` was found by reading a list by hand, and
five cards shipped this way earlier). It is now `npm run check:overlays`, sitting right after `check:flashcards` in
`precheck`, in the pre-commit and pre-push hooks that call `precheck`, and as its own step in the CI check job; it
costs about 0.35 s because it only reads files. The 20 cards needing a human and the 222 with no signal on one side
stay out of the exit code deliberately: a gate that is red every day for 242 cards nobody has time to read is a
gate everybody learns to ignore, and `precheck` would never be green again. Both failure modes were negative-tested
before this landed: permuting one card's English option lines while moving `Answer:`/`Correct option` with them
leaves `check-flashcards` green (that is the `csp-126` shape) and `check:overlays` fails naming the card, and
editing a Chinese explanation without touching the English fails both. Swapping two English option lines on a
card **with no digits on either side** used to fail neither, and that was the blind spot this sentence was writing
down; after identifiers joined the fingerprint it fails `check:overlays` whenever the two swapped lines carry
different identifiers - negative-tested on `csa-077`, whose four options are `int` / `boolean` / `double` /
`String`: swapping the first two lines while leaving `Answer: C` and `Correct option: double` untouched (nothing
inside the English card contradicts itself, so `check-flashcards` stays green and the old fingerprint said nothing)
is now a red naming `csa-077`, and `--write` puts the file back to its HEAD bytes. What remains blind is the 222-card
group: two options that share a fingerprint, or two options with no fingerprint at all, are indistinguishable to any
content-based comparison, so a swap between them is still invisible - the residual is stated here rather than
discovered later.

The criterion itself has to be written into the repository where a second person can independently re-derive it,
rather than existing only inside the annotator's head: the difficulty half is in
[docs/difficulty-rubric.md](docs/difficulty-rubric.md), and the UI half is enforced by `.uxe/scripts/check.py`
(`npm run uxe:check`).

### Difficulty, and what tagging it revealed

All 902 drill and scenario items carry a `difficulty` from 1 to 4, assigned against the rubric written into
`content/subject-banks/difficulty.json` and enforced by the gate. The levels are a rubric judgement, not an
empirical calibration: nobody has answered these items and had their score recorded, so read them as "how much
work this asks for", not as "how often students get it wrong". Two independent sets of reviewers graded the two
families without seeing each other's work, which is what makes the comparison below worth anything. The rubric
itself, with a worked example at every level and the judgement calls that go wrong most often, is written out in
[docs/difficulty-rubric.md](docs/difficulty-rubric.md).

| Deck family | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|
| Drill banks (640 items, five subjects) | 44–71% | 15–40% | 8–16% | 3–4% |
| Scenario decks (262 items, five subjects) | 2–12% | 30–52% | 28–56% | 7–8% |

The drill banks are still overwhelmingly level 1 and have little at the top; the scenario decks have almost
nothing at the bottom and half their items at level 3. So the format difference is measured rather than asserted:
the content written to require two to four steps really does require them, and the material generated in bulk as
one-line questions really is one-line. The level-1 items added to the CSA and the precalculus scenario decks are the same
fix at the other end of the scale: those were the two scenario decks with nothing at level 1, so anyone warming up
in them had to start at level 2. The CSA pair asks one thing each - how `+` associates once a string appears, and
how many passes a loop whose variable doubles makes - while still carrying code as the stimulus; the precalculus
pair asks how far 135° is in radians (one conversion formula) and which kind of sequence 405, 270, 180, 120, 80 is
(one ratio to check), each behind a stem that supplies the situation rather than replacing it. The statistics drill bank now has fourteen items at level 3 or 4, so a
"hard practice" filter over it draws on fourteen rather than on one. Closing the gap further needs new items - a
condition that must be checked before the routine applies, a method the student must choose, several interacting
facts held at once - not a relabelling of what is there. The four items added to the precalculus scenario deck
are the first level-4 items in that deck: two exponential models that must be set equal and solved by combining
exponents, an energy ratio from a logarithmic magnitude scale, a temperature threshold that also requires
knowing when the model is still rising, and a geometric sum with a fixed yearly cost subtracted from it.
The two items added to the calculus BC scenario deck are its first level-4 items beyond the second batch, and
they are the two shapes the deck had nowhere else: one asks whether a series converges before asking for its
sum, so the telescoping partial sum has to settle both questions at once, and one asks how fast a camera's
elevation angle changes while a rocket climbs, which needs the triangle's secant squared before the derivative
of the tangent relation means anything. With them every scenario deck now carries four level-4 items.

### Which cards exist in English

The Chinese text is the base and the English overlay is built in three layers, one per card family, because the
three families move for different reasons and a translation round on one should not be able to disturb the
other two:

| Layer | File | Cards | Status |
|---|---|---|---|
| AMC 10 concept cards | `src/data/flashcard-i18n.ts` | 564 of 564 | complete |
| Drill banks | `src/data/flashcard-i18n-drill.ts` | 640 of 640 | complete |
| Scenario decks | `src/data/flashcard-i18n-scenario.ts` | 262 of 262 | required by the gate |

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
`src/data/flashcards.ts` imports only that loader. The packed form is 196 KB instead of 586 KB of plain
object literals, which takes about 390 KB off the web bundle and keeps the card text out of a
straightforward grep of the shipped JS. That is obfuscation, not protection: the app has to unpack it, so
anybody can. The plain modules stay in the repo because the deck check reads them.

Two gates keep it honest: `check:flashcards` re-packs and compares, so a stale blob fails the commit, and
it also fails if any app file imports a plain deck module again. Both builders refresh the blob on their
own, so `npm run pack:decks` is only needed when you pack without regenerating. The three sizes in the
paragraph above are printed by `npm run bank:stats` and compared against this file, so they cannot drift
on their own either.

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
No card relies on that inlining any more: on 2026-10-15 the nineteen stems that used to say "上题/上式"
were rewritten to restate the setting they need in the stem itself, so each of those cards is a
self-contained single question and the inlining stays in the builder as a backstop rather than as
something the shipped deck depends on.

## Quality Gates

```bash
npm run precheck           # 本地一键门禁: i18n completeness + 闪卡数据校验 + 英文覆盖层对齐 + ruff + type check + lint + UXE 设计契约
npm run check:flashcards   # 闪卡生成数据完整性校验（张数 / id 连续 / 选项 / 答案字母 / 来源字段 / 承接行）
npm run check:overlays     # 英文覆盖层对齐（src 重算 / 选项顺序重排；"需人读"和"某侧无信号"只报不红）
npm run typecheck          # tsc --noEmit
npm run lint               # Expo ESLint
npm run lint:py            # ruff 检查 .uxe/scripts（配置在 pyproject.toml）
npm run i18n:check         # i18n completeness audit
npm run uxe:check          # UXE 设计契约检查（antd token 一致性 / 对比度 / 明暗对称）
```

`npm install` 自动把 git 钩子装到 `.git/hooks`（`scripts/install-hooks.js`，幂等）：

- **pre-commit** — 运行 `npm run precheck`（快门禁：i18n / 闪卡数据 / 英文覆盖层对齐 / ruff / 类型 / lint / UXE 设计契约）。
- **pre-push** — 运行完整 `precheck` + `expo export -p web` 构建门禁，与 CI check job 对齐。

单次跳过用 `--no-verify`（`git commit --no-verify` / `git push --no-verify`）。ruff 只需装一次：`python3 -m pip install --user ruff`。

Two lint layers guard the i18n setup:

- **Type level** — `en`/`es` dictionaries are typed against `zh`, so a missing or extra key fails `tsc`.
- **ESLint `local/no-hardcoded-copy`** — hardcoded Chinese copy in `src/{app,components,hooks,lib}` fails lint; UI strings must go through `t()` (`src/i18n/` and the course base in `src/data/courses.ts` are exempt).

Browser smoke test (Playwright): verifies the auth gate, sign-up, check-in, and all three tabs against a running dev server.

```bash
npx playwright install chromium   # once, after npm install
npm run web &                     # dev server
npm run smoke                     # 152 assertion call sites, exits non-zero on failure
```

CI (`.github/workflows/ci.yml`) runs i18n check, flashcard data integrity, English overlay alignment, ruff, type check, lint, web export, and the smoke test on every push (smoke needs the `EXPO_PUBLIC_SUPABASE_*` repo secrets).

The repo also carries a UXE design contract (`.uxe/`) that audits surfaces, tokens, and AI-tell patterns on rendered output.

## License

[MIT](LICENSE) — covering the source code and the content written for this project.

Content provenance is documented in [NOTICE](NOTICE): which parts of the question bank came from a
third-party study pack, which were written here, and why no MAA or College Board material is included.
NOTICE also records the bank's current composition (quoted from `npm run bank:stats`, not hand-kept)
and how far the English overlay's alignment is machine-checked, together with the part that is not.
The MIT licence covers this repository's own work and cannot cover anyone else's.

If you want to practise with your own copies of real exam questions, put them in `content/local/`. That
directory and the file generated from it are gitignored, and the app loads them at runtime on your
machine only, so they never reach a commit or a deployment — see [docs/local-bank.md](docs/local-bank.md).
