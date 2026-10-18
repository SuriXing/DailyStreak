# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Commit Message Style

Commit messages follow the owner's personal narrative style — the same one used across the ProblemSolver and MentorTable repos. Every message opens with **`Today I ...`** and is written in first person.

- **Subject line:** begins with `Today I ...`, says what was done in one flowing sentence, and reads as a complete sentence (a trailing period is fine).
- **Length varies naturally with the change.** A small fix can be a compact single sentence; a larger change deserves the detail it needs. Do not pad small commits to match big ones, and do not trim big commits down to one line — histories where every message is the same length read as machine-generated.
- **Body:** optional. For substantial changes, after a blank line, add paragraphs with the context, the reason, and the trade-offs; where something went wrong or is worth flagging, close with an `Honest note:`.
- **No conventional-commit prefixes** (`feat:` / `fix:` / `chore:`), no emoji in the subject.

Examples:

```
Today I fixed the check-in page spinning forever, because the session user hook was resolving through a network call that hung on slow connections, and switched it to the local session read with a timeout on the fetch.
```

```
Today I added the desktop sidebar shell above the 900px breakpoint.

The bottom tab bar now hides on wide screens and a 220px navigation rail takes over with the brand mark, active-route highlighting, the user card, and a sign-out action, all reading from the shared theme tokens.

Honest note: the first pass left the collapse button under the content column's hit area, and the browser test caught it before I did.
```

This file is tracked, so convention/documentation updates land as normal commits with the same `Today I ...` message.

---

# The question bank: rules that exist because breaking them shipped wrong answers

## The answer parser

- Entries are separated by `;` **only**. Splitting on `。` once deleted 42 explanations outright, because a full stop is punctuation, not a delimiter.
- Explanations are read with **balanced parenthesis matching**. The old `[^）]*` pattern cut every explanation at its first `）` (24 of them), and that in turn disabled the "don't rotate options when the explanation names A/B/C/D" guard — the letters were in the part being cut — so 26 cards shipped with rotated options and wrong letter references.
- The generator now refuses to build when the explanation does not appear verbatim in the card, or when anything other than `;`/`。` follows it.

## Writing an explanation changes how the card is built

An item whose explanation mentions a standalone A–D is **not** option-rotated, so its options stay in source order. Writing a letter reference therefore freezes the layout: the reference must be written against **source order**, and then checked on the generated card. Four such references were wrong in one sitting and the gate only caught them after a dedicated check was added ("an explanation may not attach a mistake — forgot / mistook / treated as / only counted — to the letter holding the correct option").

## Numbers

- Every value must be recomputed independently, **including each distractor**. A distractor whose stated mistake does not produce the number it displays teaches nothing. Real examples that had to be rewritten: a "116" nobody can derive, `sqrt(145)` and `sqrt(53)` unrelated to the stated slips, and a claimed `χ²≈10.0` that is actually 16.0.
- The correct option must not be the longest one (the gate checks).
- No hint-leaking parentheses in stems ("hint: use partial fractions" hands over the method). Specification parentheses ("inclusive", "including the sign") are fine.
- Scenario decks (`*-scenario`) need stimulus material — 30+ characters or multiple lines, and ≥75% of the deck must qualify — and their English overlay must be complete.

## Difficulty

Levels 1–4 are a rubric judgement about expected work, not measured difficulty. The rubric, worked examples, and the change procedure live in `docs/difficulty-rubric.md`. After changing a level, re-run the generator chain: the gate fails when a deck has **zero** level-4 items and warns when it has fewer than three.

---

# The gates: green means "nothing detected", not "correct"

- **The pre-push hook is not CI.** It runs `precheck` plus a web export; the real gate is the GitHub workflow. Always `gh run watch <id>` after pushing. Twice a red CI sat unnoticed because the push looked successful.
- **"Verified N cards" counts cards whose ledger hash still matches, not ledger entries.** Editing text silently returns a card to unverified; the gate now fails on stale entries and prints old→new hashes to paste back.
- **README counts are generated.** `npm run bank:stats` is the single source of truth and the gate compares README against it. Hand-written counts drifted three times (125→254, 1289→1454, 888→890) before this existed.
- **English option order is verified only by a language-neutral fingerprint**, with a hard ceiling: of 898 option cards, **597 are provable, 20 need a human, 281 have no numbers on one side and always need a human**. Five cards shipped with the English `Answer:` pointing at a distractor before this was understood; do not assume the script covers the rest.
- **The gate validates each language against itself.** It cannot see a mismatch *between* Chinese and English. After editing Chinese card text, always update the English overlay (options, order, `Answer:`, `Correct option:`) and run `node scripts/sync-overlays.mjs --write`.
- **Negative-test every new check**: reintroduce the defect, watch it fail on exactly that line, then restore.

---

# Working in this repo

1. **Read before editing.** Use `read` for files and `grep`/`glob` to find things. `dist/` is a build artifact — never grep it.
2. **One commit, one change.** Small and coherent beats a big tidy-up.
3. **Never pad.** No real change, no commit; an empty day is more honest than a manufactured one. A history with exactly N commits per day reads as machine-generated — the same reason the commit-style section above warns about uniform lengths.
4. **Commit before rewriting history.** `git reset --hard` has already eaten uncommitted fixes once. Date remaps should change dates only: `filter-branch --env-filter` keyed on SHA, backup branch first, then `--force-with-lease`.
5. **Keep dates monotonic.** Check with `git log --pretty='%ad' --date=format:'%m-%d %H:%M'` before and after.
6. **Report what you did not do.** Unverified parts, known weak spots, and test accounts left behind all belong in the final message.

Pre-commit checklist:

```bash
node scripts/check-flashcards.mjs    # card shape, difficulty, English coverage, ledger, README counts
node scripts/check-i18n.mjs          # zh/en/es dictionaries have identical key sets
npm run test:session                 # filter / order / shuffle unit tests
npx tsc --noEmit
npx expo lint
node scripts/smoke-test.js           # required for UI changes; needs the dev server on 8081 and a reachable Supabase
```

---

# Environment facts worth an hour

- `~/.env` holds `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `TAVILY_API_KEY` and others. There are **no registrar credentials**: nameserver changes at GoDaddy are the owner's job. The `sbp_` Supabase PAT is currently rejected by the management API (`JWT could not be decoded`), so smoke-test accounts cannot be cleaned up from here.
- **DNS inside the sandbox is synthetic** (`198.18.x.x`). For real resolution use DNS-over-HTTPS: `curl -s 'https://dns.google/resolve?name=suri.world&type=NS'`.
- The browser smoke test needs a reachable Supabase, and the dev server on 8081. Each run registers a real test account.
- **Vercel**: the project is `dailystreak` (`dailystreak-app.vercel.app` is just one of its domains). Project-level `ssoProtection` must be `null` or production serves Vercel's own login page. `suri.world` is registered in the account with `ns1/ns2.vercel-dns.com` expected, but the registrar still delegates to GoDaddy, so `dailystreak.suri.world` does not resolve yet.
- **Supabase pauses idle projects** (`INACTIVE`), which presents as "host does not resolve" plus "Failed to fetch" in the app. `.github/workflows/keep-alive.yml` restores the project and polls until it is healthy.

---

# Front end (React Native Web + antd-mobile) pitfalls

- `accessibilityState` is a **no-op** on react-native-web; the selected state never reaches the DOM. Use `aria-selected` / `aria-checked`.
- Changing a chip's role from `button` to `radio`/`checkbox` **loses Space-key activation** (RNW only handles Space for button-ish roles); catch it in `onKeyDown` and `preventDefault`.
- antd dark mode is not automatic: pass a theme object to `Provider` **and** force a remount with a `key` (antd caches styles per instance). Without it, cards render white-on-dark at 1.32:1 — invisible.
- Verify contrast with the **WCAG formula** (alpha composited against the real backdrop), never by eye: 4.5:1 for body text, 3:1 for large text and icons.
- Locate navigation items in the smoke test by **exact match**. `/我的|Me/` matched the substring "Me" inside 16 cards' text ("Men's …"), so `.first()` sometimes clicked a card instead of the tab and CI went intermittently red.

