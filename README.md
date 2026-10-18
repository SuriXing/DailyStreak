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
- `src/data/flashcard-i18n.ts`, `src/data/flashcard-i18n-scenario.ts` — per-card translations keyed by card id: the AMC 10 concept cards in the first file, the 258 scenario items in the second, kept apart so the two card families never move each other's text. `localizeFlashcard()` returns the Chinese card whenever the entry is missing, so a half-translated deck degrades card by card instead of breaking.
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

The 1462 practice cards are generated data, not copy typed into the app:

| Decks | Cards | Source material | Generator |
|---|---|---|---|
| AMC 10（算术与数论 / 代数·函数·数列 / 几何 / 组合·概率 / 综合·策略） | 564 | the `2*-Flashcards-*.md` files of the AMC 10 material pack | `scripts/build-amc10-flashcards.js` |
| AP CSA, CSP, Precalculus, Calculus BC, Statistics | 640 | the `*原创选择题*.md` banks plus their answer keys | `scripts/build-subject-decks.js` |
| 五科情境题（`*-scenario`） | 258 | authored for this repo: stimulus plus two to four reasoning steps per item | `scripts/build-subject-decks.js` |

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
script that aligns it (`scripts/sync-overlays.mjs`) matches English option lines to Chinese ones by the numbers
inside them, which is language-neutral but only works when the numbers are distinctive: in one audit - a one-off
measurement, not a running count - that fingerprint verified the order automatically for about 229 of the 890
option cards and could not judge the rest, so those were compared by eye, and three swapped answers fell out of
that reading (precalculus 031, 039 and 046 - in each case the English `Answer:` pointed at a distractor while the
Chinese was right). A fourth, `csp-125`, was found only after the fingerprint itself was repaired: it had been
reading both `10⁻⁶` and `10⁻²` as the number 10, concluded the two options were indistinguishable, and skipped the
card, so nothing ever compared its Chinese `A` (10⁻⁶, the correct option) with its English `A` (3×10⁻²). With
superscripts and signs normalised the fingerprint now proves the order for 559 of the 898 option cards; the other
339 have options with no distinctive numbers and remain a by-eye job. A further hazard is specific to
this repository's build: an item is not option-rotated when its explanation mentions A/B/C/D, so *writing* a
letter reference into an explanation changes how the item is built. Adding references in the wrong order is
therefore not a documentation slip but a content error, and it happened four times in one sitting before anyone
noticed. The gate now refuses it: a brief may not attach a mistake ("forgot", "mistook", "treated X as Y") to the
letter that holds the correct option. Items whose stems carry a leftover line from the previous question (the
"carrying on from the last item" cards) and one stem that merges two questions (calculus 112) are known and left
alone; they are wording problems rather than wrong keys.

### 哪些保证是机器强制的，哪些只是人的承诺

上面几段说"门禁会检查……"，但读的人没法从中判断某一句保证到底是脚本在挡，还是必须有人去读。
下表逐条拆开：**每行 = 一个保证**，"由什么强制"写的是真正让它成立的机制（脚本名，或"人读"），
"在什么情况下会失败"是按当前代码读出来的触发条件，"已知盲点"是这条机制**管不到**的部分。
表里的数字全部来自 `npm run bank:stats`、`node scripts/sync-overlays.mjs --check`、
`npm run test:session` 与 `npm run check:flashcards` 的现算输出，不是手抄的。

| 保证 | 由什么强制 | 在什么情况下会失败 | 已知盲点 |
|---|---|---|---|
| 卡片形状：文件头声明的张数 = 实际张数；id 连续且等于源题号；恰好四行 `A./B./C./D.`；选项非空、无残留标签；`答案：X` 与 `正确选项：…` 逐字一致 | `check-flashcards.mjs`（`parseCards` / `checkIdSequence` / `checkSubjectCard`） | 手改数据、解析规则回归、源题缺号 | 只管形状：选项顺序、题干文字、答案对不对它都不知道 |
| 概念卡（564 张）没有选项行，`level` 只在 `core/advance/boundary` 里 | 同上（`checkConceptCard`） | 概念卡混进选项块、`level` 拼错 | 只认三个字面值，级别判得对不对不管 |
| 题干出现"上题/上式/上述/前一题"时，`front` 必须以 `【承接上题】` 开头 | 同上（`checkBackReference`） | 承接行被删掉 | 只认这四个词，换了说法这条检查就失去对象 |
| `source` 正确、`verified` 与台账哈希一致、台账里没有孤儿 id | 同上（`checkProvenance`）+ `scripts/flashcard-verification.json`（登记 1462 张、当前实际核验 1462 张） | 改了 `front`/`back` 而没更新台账 → 直接失败并打印新旧哈希 | 只证明"这一版正文被复核过"；复核本身的质量（干扰项写的错法能不能真算出那个数）机器判断不了 |
| `FlashcardSource` 联合类型仍含 `'amc10-concept'` / `'ai-mcq'` | 同上（`checkSourceUnion`） | 字面量被人删掉 → 界面上的来源标注静默走错分支 | 只比对两个字符串，来源是否真的填对了不在它手里（见上一行） |
| 产物与 `content/` 源同步 | 同上（`checkDeckSourceSync`：把两个生成器重建到临时目录逐字比对） | 改了源忘了重跑生成链 | 只证明"产物 = 按当前源重建的结果"，源里的题对不对不管 |
| bundle 压缩块与卡组数据同步；应用代码不许 import 明文卡组 | 同上（重打包后比对解压内容 + `checkNoPlainDeckImport`） | 改了卡没重新打包、有人把明文模块 import 回 app | 压缩只省体积、只防 grep，不是保护（脚本打印的 194 KB 就是 `deck-pack.ts` 的文件长度） |
| 答案字母分布：≥40 张的卡组里每个字母 25%±10% | 同上（`checkAnswerPositions`） | 重新生成后答案挤在某个字母上 | 概念卡没有答案字母、不参与；只约束聚合比例，单张卡不保证 |
| "正确项 = 最长"比例：每卡组 ≤40%、全库 ≤30%（并列时算在最靠前那一项头上） | 同上（`checkOptionLengthBias`） | 选项长度又开始泄露答案 | 同样只看聚合比例，单张卡的正确答案可以是最长的；这个口径比"严格最长"读数更高 |
| 情境题卡组：≥20 题，且 ≥75% 的题干带刺激材料（多行或 ≥30 字） | 同上（`checkScenarioDecks`） | 用单步题充数 | 只挡住最粗的退化，不判断情境是否真的需要多步推理 |
| 题干重复 | 同上（`checkDuplicateItems`：去标点、去空白、取前 80 字） | 复制粘贴出两张同题干卡 | 只抓归一化后完全相同的题干；同一概念的近重复（CSP 那几处聚集）它看不出来 |
| 选项形状：空选项、两个选项文字完全相同、"以上都不对/无法判断"这类逃生口（且它是干扰项） | 同上（`checkOptionShape`） | 生成或手改出这类选项 | 逃生口只在选项本身很短（≤12 字）时才判；正确答案写成这类是允许的 |
| 简析不得把错法挂在正确答案的字母上 | 同上（`checkBriefLetterReferences`） | 简析里出现"字母 + 漏/忘/误/把/当成…"且那个字母就是答案字母 | 判据故意窄：只认那一组错法动词、字母后紧跟"正确/成立"就豁免；不检查英文简析里的字母引用；字母指向**另一个干扰项**（写错了是哪个干扰项）它看不出来 |
| 难度：练习册每张必须有 1–4；≥40 张的卡组不能有单一级别超过九成 | `check-flashcards.mjs`（`checkDifficulty`）+ 生成器（缺标注直接 `throw`） | 缺标注、标成 0/5、整组一个级别 | 情境题的难度不是逐卡断言的（`checkDifficulty` 只对非 `-scenario` 卡组要求存在，缺标注靠"生成器抛错 + 产物同步比对"兜住）；级别判得对不对机器不管 |
| README 的题库计数：按族题数表、英文覆盖表的 `N of M`、难度区间表 16 个百分比、正文里点名总数的四句 | `check-flashcards.mjs`（`checkReadmeBankCounts`，数字现取自 `bank-stats.mjs`） | 加题后手写数字漂移；表头或措辞改到解析不出来（这也算失败，免得检查失去对象） | 只覆盖它认得的那三张表与那四句话。README 里其它数字没有门禁：`Quality Gates` 段的 "30 assertions" 与 bundle 段的 "132 KB / 321 KB" 都已经对不上现在的脚本与实测（`smoke-test.js` 里 125 处断言调用点；`deck-pack.ts` 194 KB、gzip 块 145 KB、明文卡组模块 583 KB） |
| 英文覆盖层结构自洽：四个选项字母、答案字母与中文一致、`Correct option` 与它指向的选项逐字一致、无残留中文、无孤立 id、`src` 与当前中文 `front+back` 的哈希一致；情境题必须全覆盖 | `check-flashcards.mjs`（`checkFlashcardOverlay`） | 中文改了英文没跟上（`src` 对不上）；情境题缺条目 | 只校验结构与自洽，**不校验译文的意思**——`Answer: A` 与 `Correct option` 可以互相印证地一起写错成同一条错方法（`csp-126` 现在就是这样）；练习册与概念卡缺条目只报比例、不是失败。另外 `src` 是人跑 `sync-overlays.mjs --write` 时机械重算的，**对它没能对齐的那些卡也会刷新**，所以这个哈希证明的是"跑过脚本"，不是"这一版英文被人读过" |
| 英文选项顺序与中文逐字母对应 | `scripts/sync-overlays.mjs` 的数字指纹（**人跑的脚本：不在 CI、不在 `precheck`、不在 git 钩子里**） | `--check` 在需要重排顺序或重算 `src` 时退出码非 0 | 实测 898 张带选项的卡里指纹只能判定 **278** 张（另有 5 张靠 `scripts/overlay-order-overrides.json` 的显式置换）；**339** 张被列进"需人工核对"（其中 319 张中英指纹序列逐位相同，只是指纹重复或某个选项没有数字，脚本"绝不猜"）；**281** 张至少有一侧的四个选项里一个数字都没有，脚本连报都不报、静默跳过。**跳过多少张不影响退出码**，所以它绿着不代表英文顺序是对的 |
| UI 词典 zh/en/es 键集一致、课程内容覆盖齐全 | `scripts/check-i18n.mjs`（147 keys，17 条目 / 17 技能 / 3 课程） | 新增键只改 `zh`、课程条目漏译 | 只查键的存在与集合相等，不查译文语义；英文卡片覆盖层不在这里（在 `check-flashcards` 那两行） |
| 练习页筛选/排序语义，以及真实题库的恒等式"各档之和 + 没有分级 = 总题数" | `scripts/test-session-logic.mjs`（60 个 test，需要 Node ≥22.15） | `filterCards` / `availableDifficulties` / `orderCards` / `summarizePool` 的语义被改坏 | 只测 lib 层的返回值：不测渲染、不测点选、不测翻面 |
| 本地题库链路（`content/local/` → `public/local-deck.json` → 卡池 → 难度筛选） | 同一支脚本里的往返测试（在临时目录真跑一遍生成器）+ `build-local-bank.mjs` 自己跳过写错标注的题 | 生成器解析回归、难度标记写错 | **浏览器里没跑过**：本机 `public/` 下没有 `local-deck.json`，也没有 `.env.local` 去打开 `EXPO_PUBLIC_LOCAL_DECK=1`（默认关），所以 fetch → 卡池 → 渲染那一跳只有单测覆盖 |
| 端到端 UI 行为：登录门控、注册、打卡、三个 Tab、难度多选与键盘操作、排序、题库概览数字、390px/1280px 不横向溢出、零控制台错误 | `scripts/smoke-test.js`（Playwright，125 处断言调用点：`assert(...)` 98、`assertI18n` 20、`assertLabel` 7，其中一部分在循环里） | 需要 8081（或 `SMOKE_BASE`）上跑着 dev server、装好 chromium、并且能连到 Supabase 走完真实注册；CI 的 smoke job 在没配 secrets 时**整段跳过**（只打一条 warning），脚本自己没有跳过逻辑 | 题量与难度分母都从生成数据现算，但本地题库那一跳不在里面；不在浏览器里算对比度（那轮审计用的是不进仓库的临时脚本）；测试账号是真实注册的真实用户，只有配了管理 token 才自清理 |
| UXE 设计契约：antd token 一致性、明暗对称、组件里的 raw hex、三组对比度 | `.uxe/scripts/check.py`（= `npm run uxe:check`，CI 与 `precheck` 都跑） | 组件里写死颜色、token 缺失、明暗不对称、对比度低于门槛 | 静态检查：它读 `src/constants/theme.ts` 的 token 与组件文件里的字面颜色，渲染出来的实际像素不在它手里 |
| 内容正确性：答案本身、干扰项写的错法能不能真算出它显示的数字、简析里的数学、英文译文的意思 | **人读**（三轮对抗性复核 + 复核台账） | 只有人读能发现；机器一条都判断不了 | `check-flashcards` 甚至不知道"这道题的答案对不对"，台账只证明有人复核过这一版正文 |
| 难度级别判得对不对（1–4 每一级的判定） | **人读**（判据与改级流程写在 `docs/difficulty-rubric.md`，含每级的真实例子） | 复核者按 rubric 独立复算 | rubric 判的是"预期工作量"而不是实测难度；机器只看"有没有、是不是 1–4、分布有没有区分度" |
| 那 620 张指纹判定不了的卡的英文选项顺序 | **人读**（`sync-overlays.mjs --check` 打印的跳过清单只是入口） | —— | 339 张里真正"数字对不上"的只有 **20** 张，另外 **319** 张是中英指纹序列逐位相同却仍不可判定（**115** 张指纹重复、**204** 张某个选项没有数字）。这 20 张逐张读过：**19** 张是写法差异（中文 `.4` / 英文 `0.4`、字面 `H0` 被读成数字 0、`1,000,000` 被拆成 1/0/0、`万元` 对 `million`、英文把算式里的中间数字省掉），**1** 张（`csp-126`）是真的错位 |
| README 里没有被那四条正则覆盖的数字与说法 | **无人**（写的人自己负责） | —— | 门禁只保证它认得的那几处，其余读起来一样可信 |

关于上面英文覆盖层那两行，README 前面写的"the fingerprint now proves the order for 559 of the 898
option cards"是错的，别再引用：559 是把 `--check` **没有报告**的张数当成"已证明"（898 − 339），
但 339 只是"两侧都有数字却没能对齐"的那一堆，另外 281 张至少有一侧的四个选项里一个数字都没有、
脚本根本不报告，
所以真正被证明的是 **278** 张，剩下的 **620** 张全是人工判断。而这 620 张里就有 `csp-126` 这种
活的错误：英文选项的顺序与中文不一致，`Answer: A` 指在"排序后每隔十条取一条"这条干扰项上
（中文的 A 是"多次有放回抽样，记录每次的中位数"，英文简析自己也写着 systematic picking 不对），
而门禁只看英文自己是否自洽，所以它一路绿灯。这类错误的共同形状是"结构自洽、语义错位"——
只有人把两种语言对着读一遍才发现，`--check` 的跳过清单是它唯一的机器线索。

判据本身要写在文件里、能被第二个人独立复算，而不是只存在于标注者脑子里：难度那一半在
[docs/difficulty-rubric.md](docs/difficulty-rubric.md)，UI 那一半由 `.uxe/scripts/check.py`
（`npm run uxe:check`）强制。

### Difficulty, and what tagging it revealed

All 898 drill and scenario items carry a `difficulty` from 1 to 4, assigned against the rubric written into
`content/subject-banks/difficulty.json` and enforced by the gate. The levels are a rubric judgement, not an
empirical calibration: nobody has answered these items and had their score recorded, so read them as "how much
work this asks for", not as "how often students get it wrong". Two independent sets of reviewers graded the two
families without seeing each other's work, which is what makes the comparison below worth anything. The rubric
itself, with a worked example at every level and the judgement calls that go wrong most often, is written out in
[docs/difficulty-rubric.md](docs/difficulty-rubric.md).

| Deck family | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|
| Drill banks (640 items, five subjects) | 44–71% | 15–40% | 8–16% | 3–4% |
| Scenario decks (258 items, five subjects) | 0–12% | 30–52% | 28–56% | 7–8% |

The drill banks are still overwhelmingly level 1 and have little at the top; the scenario decks have almost
nothing at the bottom and half their items at level 3. So the format difference is measured rather than asserted:
the content written to require two to four steps really does require them, and the material generated in bulk as
one-line questions really is one-line. The statistics drill bank now has fourteen items at level 3 or 4, so a
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
| Scenario decks | `src/data/flashcard-i18n-scenario.ts` | 258 of 258 | required by the gate |

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
No card relies on that inlining any more: on 2026-10-15 the nineteen stems that used to say "上题/上式"
were rewritten to restate the setting they need in the stem itself, so each of those cards is a
self-contained single question and the inlining stays in the builder as a backstop rather than as
something the shipped deck depends on.

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

[MIT](LICENSE) — covering the source code and the content written for this project.

Content provenance is documented in [NOTICE](NOTICE): which parts of the question bank came from a
third-party study pack, which were written here, and why no MAA or College Board material is included.
The MIT licence covers this repository's own work and cannot cover anyone else's.

If you want to practise with your own copies of real exam questions, put them in `content/local/`. That
directory and the file generated from it are gitignored, and the app loads them at runtime on your
machine only, so they never reach a commit or a deployment — see [docs/local-bank.md](docs/local-bank.md).
