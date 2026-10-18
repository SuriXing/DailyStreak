#!/usr/bin/env node
/**
 * DailyStreak 浏览器冒烟测试（Playwright，无头 Chromium）
 *
 * 覆盖：登录门控 → 注册 → 打卡 → 三个 Tab 渲染 → 开始练习。
 * i18n：断言同时兼容中文与英文（默认语言跟随系统，CI 常为英文）。
 * 用法：
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/smoke-test.js
 *
 * 退出码 0 = 全部通过；非 0 = 失败（会打印关键断言点）。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:8081';
const EMAIL = `smoke${Date.now()}@gmail.com`;
const PASSWORD = 'Test123456!';

function assert(cond, msg) {
  if (!cond) throw new Error(`❌ 断言失败: ${msg}`);
  console.log(`✅ ${msg}`);
}

/** 断言页面文本命中中/英任意一种 */
function assertI18n(text, zh, en, msg) {
  assert(text.includes(zh) || text.includes(en), `${msg}（${zh} / ${en}）`);
}

/** 行标签在 UI 里带 text-transform: uppercase，innerText 拿到的是大写，断言时忽略大小写 */
function assertLabel(text, zh, en, msg) {
  assert(text.includes(zh) || text.toLowerCase().includes(en.toLowerCase()), `${msg}（${zh} / ${en}）`);
}

/**
 * 排序断言用的卡组：UI 标签 ↔ 生成文件同名（src/data/subject-decks/calcbc-scenario.ts）。
 * 为什么挑这个卡组：它只有**一张** 1 档卡，所以"由易到难"的第 2 张就跨到 2 档——
 * 一眼能看出排过序，而不是"前 60 张全是 1 档"的卡组（那种要点 60 次下一张才看得到档位变化）。
 * 它同时有 4 张 4 档卡，"由难到易"的第 5 张跨到 3 档，两个方向各跨一次边界。
 */
const SORT_DECK_LABEL = 'AP Calc BC · 情境题';
const SORT_DECK_FILE = 'calcbc-scenario';

/**
 * 逐个遍历生成的选择题（练习册 + 情境题），把它的 difficulty 交给 fn（没写字段就给 null）。
 * 练习池的大小与"某一档有多少题"都从生成数据里数出来，这样每加一批题都不用回来改数字——
 * 它曾经硬编码成 725，加了 125 道情境题后就过期了。
 * 传 file（不带扩展名的卡组名，如 'precalc'）时只看那一个卡组，排序断言就是这么取的。
 */
function forEachPracticeCard(fn, file = null) {
  const dir = path.join(__dirname, '..', 'src', 'data', 'subject-decks');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts') || f === 'index.ts') continue;
    if (file && f !== `${file}.ts`) continue;
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (/\{ id: "/.test(line) && /\\nA\. /.test(line)) {
        const m = line.match(/difficulty: (\d+)/);
        fn(m ? Number(m[1]) : null);
      }
    }
  }
}

/**
 * 本机 public/local-deck.json 里的卡（没有这个文件、或读不动就是空数组）。
 * 练习页的池子包含它们，「我的」页的题库概览不包含（那个卡描述的是随 bundle 发出去的题库）。
 */
function localDeckCards() {
  const file = path.join(__dirname, '..', 'public', 'local-deck.json');
  if (!fs.existsSync(file)) return [];
  try {
    const cards = JSON.parse(fs.readFileSync(file, 'utf8')).cards;
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
}

function expectedPracticePool() {
  let n = 0;
  forEachPracticeCard(() => {
    n += 1;
  });
  // 本机若生成了本地题库（content/local/ + npm run bank:local），它也会出现在练习池里
  return n + localDeckCards().length;
}

/**
 * 练习页难度筛选行里会出现哪些档：内置数据的档 + 本机本地题库里标过的档。
 *
 * 本地题的难度只认 1-4（src/data/local-bank.ts 的 normalizeDifficulty，与内置 rubric 同口径），
 * 而内置数据四档齐全，所以本地题不可能让这一行多出第五档——"我的"页概览与练习页共用这个档位列表。
 */
function expectedDifficulties() {
  const seen = new Set();
  forEachPracticeCard((d) => {
    if (d) seen.add(d);
  });
  for (const card of localDeckCards()) {
    if (typeof card.difficulty === 'number' && card.difficulty > 0) seen.add(card.difficulty);
  }
  return [...seen].sort((a, b) => a - b);
}

/** 内置题库（生成的数据文件）里落在选中难度集合里的题数。 */
function builtinDifficultyPool(selected) {
  let n = 0;
  forEachPracticeCard((d) => {
    if (d !== null && selected.includes(d)) n += 1;
  });
  return n;
}

/**
 * 练习页选中若干档后的池子大小 = 内置题里落在集合里的张数 + 本机本地题库里标了难度的那些。
 * 与 expectedPracticePool 一样从数据算，不写死数字。
 * 本地卡只在 markdown 行尾写了 `[难度 N]` 时才有 difficulty 字段（见 docs/local-bank.md）：
 * 标了的与内置题一样会被这一档选中，没标的连字段都没有、所以整批被滤掉——与 filterCards 的语义一致。
 */
function expectedDifficultyPool(selected) {
  const local = localDeckCards().filter(
    (card) => typeof card.difficulty === 'number' && selected.includes(card.difficulty),
  );
  return builtinDifficultyPool(selected) + local.length;
}

/**
 * 「我的」页题库概览里某一档的题数：概览只数随 bundle 发出去的这套题库，
 * 本机 public/local-deck.json 不算在内（与 expectedLibraryTotal 同一个理由）。
 */
const expectedLibraryDifficultyPool = builtinDifficultyPool;

/** 某个生成卡组里的题数（界面选中那个卡组后进度条的分母）。 */
function expectedDeckPool(file) {
  let n = 0;
  forEachPracticeCard(() => {
    n += 1;
  }, file);
  return n;
}

/**
 * AMC10 概念卡的张数：src/data/amc10-flashcards.ts 里一行一张卡（生成文件，不写死数字）。
 * 这一批卡没有 difficulty 字段（打包格式给"没有分级"写 0），「我的」页题库概览把它们单列在
 * "没有分级"那一行，所以这个数同时是那一行的期望值。
 */
function expectedConceptCards() {
  const file = path.join(__dirname, '..', 'src', 'data', 'amc10-flashcards.ts');
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => /\{ id: "/.test(line)).length;
}

/**
 * 整套题库的题数 = AMC10 概念卡 + 练习池里的选择题，两个数都从生成数据里数出来。
 *
 * 这里刻意不走 expectedPracticePool：那个助手会把本机 public/local-deck.json 的题加进去
 * （练习页确实会练到它们），而「我的」页的题库概览描述的是随 bundle 发出去的这套题库——
 * 本地题库默认关闭（src/data/local-bank.ts 的 LOCAL_DECK_ENABLED），概览里不含它。
 */
function expectedLibraryTotal() {
  let practice = 0;
  forEachPracticeCard(() => {
    practice += 1;
  });
  return expectedConceptCards() + practice;
}

/** 全部卡组键：AMC10 的五个概念卡组（amc10-flashcards.ts 的 AMC10_DECKS）+ subject-decks 下的卡组文件。 */
function expectedDeckKeys() {
  const amc10 = path.join(__dirname, '..', 'src', 'data', 'amc10-flashcards.ts');
  const concepts = [...fs.readFileSync(amc10, 'utf8').matchAll(/\{ key: "([a-z0-9-]+)", label:/g)].map((m) => m[1]);
  const dir = path.join(__dirname, '..', 'src', 'data', 'subject-decks');
  const subject = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''));
  return [...concepts, ...subject];
}

/** 某个卡组的题数：AMC10 卡组在 amc10-flashcards.ts 里按 deck 数，其余走 expectedDeckPool。 */
function expectedDeckCards(key) {
  const file = path.join(__dirname, '..', 'src', 'data', 'amc10-flashcards.ts');
  const concept = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => /\{ id: "/.test(line) && line.includes(`deck: "${key}"`)).length;
  return concept > 0 ? concept : expectedDeckPool(key);
}

/**
 * 按难度排序后的**整条**档位序列，由 orderCards 的语义从生成数据推出（不从界面读回来）：
 * 稳定排序 → 同一档内部沿用文件顺序；没有 difficulty 的卡（含打包格式的 0）排在末尾。
 */
function expectedSortedDifficulties(file, direction) {
  const items = [];
  forEachPracticeCard((raw) => {
    // 0 与缺字段都算"没有难度"，与 lib 里 gradedDifficulty 的口径一致
    items.push({ d: raw === null || raw <= 0 ? null : raw, i: items.length });
  }, file);
  const dir = direction === 'difficulty-asc' ? 1 : -1;
  return items
    .sort((a, b) => {
      if (a.d === null && b.d === null) return a.i - b.i;
      if (a.d === null) return 1;
      if (b.d === null) return -1;
      if (a.d !== b.d) return (a.d - b.d) * dir;
      return a.i - b.i;
    })
    .map((item) => item.d);
}

/**
 * 冒烟要逐张比对的那一段：第 1 张 + 跨到下一档的那张（最多 max 张）。
 * 张数跟着数据走，所以加题、改档位都不用回来动这个数字；带上一张下一档的卡，
 * 断言才不是"前 8 张都恰好是同一个档"这种排没排都成立的空话。
 */
function expectedSortedSample(file, direction, max = 8) {
  const full = expectedSortedDifficulties(file, direction);
  const first = full[0];
  const changeAt = full.findIndex((d) => d !== first);
  return full.slice(0, changeAt === -1 ? max : Math.min(max, changeAt + 1));
}

/** 读练习页的进度计数（{current} / {total}）：取正文里单独成行的那个，返回 [current, total]。 */
async function readProgress(page) {
  const text = await page.locator('body').innerText();
  const m = text.match(/^(\d+) \/ (\d+)$/m);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * 通用轮询助手：反复问 predicate(page)，第一次返回真值就把它返回；超时返回 null。
 *
 * 为什么全脚本只该有这一处等待：固定 sleep 是**拿运行时速度当承诺**——慢机器、冷缓存、
 * 一次 GC 停顿都会输给它，而输掉的样子和"这个功能坏了"一模一样；反过来在快机器上它又
 * 白等满，把整次冒烟拖长。等条件则是：到位就立刻过，没到位就多转几圈。
 *
 * 超时不是静默的：打印**等了多久、当时的 URL、页面开头几行**，才能一眼分辨
 * "根本没导航过去"（点空了/被拦住了）和"导航过去了但内容不对"（真的坏了）——
 * 这两件事要修的地方完全不同。predicate 自己抛错（轮询过程中页面刚好在导航，执行上下文被换掉）
 * 不算失败，记下最后一次错误继续等，真超时了连同它一起打出来。
 *
 * tries × delay 是时间预算（默认 40 × 250ms ≈ 10s）；慢步骤（注册、整页重载）传大一点的 tries，
 * 快门限（应当立刻成立的切换）传小一点的 tries —— 预算的大小不改变"到位就过"这件事实。
 */
async function waitFor(page, predicate, { tries = 40, delay = 250, label = '条件成立' } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  for (let i = 0; i < tries; i += 1) {
    try {
      const value = await predicate(page);
      if (value) return value;
    } catch (e) {
      lastError = e;
    }
    // 最后一次不再空转一圈：等到了就返回，等不到立刻去打印诊断
    if (i < tries - 1) await page.waitForTimeout(delay);
  }
  const waited = ((Date.now() - startedAt) / 1000).toFixed(1);
  let head = '（读不到页面文本）';
  try {
    head = (await page.locator('body').innerText())
      .split('\n')
      .filter(Boolean)
      .slice(0, 4)
      .join(' / ')
      .slice(0, 160);
  } catch {
    /* 页面已经关掉/崩掉时诊断信息能少一行就少一行，不能因为它再抛一次 */
  }
  console.log(
    `⚠️ 轮询 ${tries} 次 × ${delay}ms（实际等了 ${waited}s）仍未满足「${label}」；` +
      `URL ${page.url()}；页面开头：${head}` +
      (lastError ? `；最后一次取状态报错：${String(lastError).slice(0, 140)}` : ''),
  );
  return null;
}

/** waitFor 的布尔版：只想知道"到没到位"的调用方用它，判据与诊断都还是 waitFor 那一套。 */
const waitUntil = async (page, predicate, opts) => (await waitFor(page, predicate, opts)) !== null;

/** 轮询等进度分母变成期望值（不用固定 sleep，等到了就返回 true）。 */
async function waitForTotal(page, expected, tries = 24) {
  return waitUntil(
    page,
    async (p) => {
      const progress = await readProgress(p);
      return progress !== null && progress[1] === expected;
    },
    { tries, label: `进度分母变成 ${expected}` },
  );
}

/** 轮询等进度分子/分母都变成期望值（切换筛选或顺序后会话重开，等它自己到位）。 */
async function waitForProgress(page, current, total, tries = 24) {
  return waitUntil(
    page,
    async (p) => {
      const progress = await readProgress(p);
      return progress !== null && progress[0] === current && progress[1] === total;
    },
    { tries, label: `进度变成 ${current} / ${total}` },
  );
}

/** 卡片上的难度标签（testID=card-difficulty）：只有真的带分级的卡才该有，个数按期望等。 */
const cardDifficulty = (page) => page.locator('[data-testid="card-difficulty"]');

async function waitForCardDifficulty(page, expected, tries = 24) {
  return waitUntil(
    page,
    async (p) => (await cardDifficulty(p).count()) === expected,
    { tries, label: `卡片上的难度标签个数变成 ${expected}` },
  );
}

/** 当前这张卡上的难度档（没有标签就返回 null），文案兼容「难度 3 / Level 3 / Nivel 3」。 */
async function currentCardDifficulty(page) {
  if ((await cardDifficulty(page).count()) === 0) return null;
  const m = (await cardDifficulty(page).first().innerText()).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 轮询等"当前这张卡的难度"变成期望档：排序切换后卡片是重渲染出来的，不睡固定时长。 */
async function waitForCurrentCardDifficulty(page, expected, tries = 24) {
  return waitUntil(
    page,
    async (p) => (await currentCardDifficulty(p)) === expected,
    { tries, label: `当前这张卡的难度档变成 ${expected}` },
  );
}

/** 读某个 testID 元素里的第一个数字（题库概览的每一行都是"N 题"这种文案；没有元素返回 null）。 */
async function readTestIdNumber(page, testID) {
  const el = page.locator(`[data-testid="${testID}"]`);
  if ((await el.count()) === 0) return null;
  const m = (await el.first().innerText()).match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** 轮询等某个 testID 上的数字变成期望值（题库概览的行随渲染出现，不睡固定时长）。 */
async function waitForTestIdNumber(page, testID, expected, tries = 24) {
  return waitUntil(
    page,
    async (p) => (await readTestIdNumber(p, testID)) === expected,
    { tries, label: `${testID} 上的数字变成 ${expected}` },
  );
}

/** 数一数某个前缀的 testID 有几个（卡组明细展开/收起时用）。 */
const countTestIds = (page, prefix) => page.locator(`[data-testid^="${prefix}"]`).count();

/** 轮询等某个前缀的 testID 个数变成期望值，返回是否等到。 */
async function waitForTestIdCount(page, prefix, expected, tries = 24) {
  return waitUntil(
    page,
    async (p) => (await countTestIds(p, prefix)) === expected,
    { tries, label: `以 ${prefix} 开头的元素个数变成 ${expected}` },
  );
}

/** 读某个 testID 元素上的一个属性：元素不在返回 null，属性不在也返回 null。 */
async function testIdAttr(page, testID, attr) {
  const el = page.locator(`[data-testid="${testID}"]`);
  if ((await el.count()) === 0) return null;
  return el.first().getAttribute(attr);
}

/**
 * 轮询等某个 testID 的属性变成期望值；expected 传 null 表示"这个属性不该存在"（读不到）。
 * 属性是跟着一次重渲染才更新的（点一下 → setState → 提交），所以和文件里其他断言一样等状态，不睡固定时长。
 */
async function waitForTestIdAttr(page, testID, attr, expected, tries = 24) {
  return waitUntil(
    page,
    async (p) => (await testIdAttr(p, testID, attr)) === expected,
    { tries, label: `${testID} 的 ${attr} 变成 ${expected === null ? '（不存在）' : expected}` },
  );
}

/** 某个元素的可读 label（RN Web 把 accessibilityLabel 渲染成 aria-label）。 */
async function ariaLabelOf(page, testID) {
  const el = page.locator(`[data-testid="${testID}"]`);
  if ((await el.count()) === 0) return null;
  return (await el.first().getAttribute('aria-label')) ?? '';
}

/** 页面横向溢出的像素数：>0 说明有元素把页面撑出视口（"这个视口下不破版"的机器可判据）。 */
const horizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * 一个筛选 chip 的无障碍属性：role / aria-checked / aria-selected / tabindex / aria-label / 可见文案。
 * RN Web 把 accessibilityLabel 渲染成 aria-label、把 role 渲染成 role；页面上没有这个 testID 时返回 null。
 * selected 这里永远是 null 才对：选中态只走 aria-checked，因为 react-native-web 不认 accessibilityState
 * （createDOMProps 只映射 aria-* 别名和 accessibilityChecked/Selected 这类单项别名，整个对象会被丢掉），
 * 而 aria-selected 又不能用在 role=radio/checkbox 上——断言它为空就是在盯住这两个坑。
 */
async function chipA11y(page, testID) {
  const el = page.locator(`[data-testid="${testID}"]`);
  if ((await el.count()) === 0) return null;
  const first = el.first();
  return {
    role: await first.getAttribute('role'),
    checked: await first.getAttribute('aria-checked'),
    selected: await first.getAttribute('aria-selected'),
    tabIndex: await first.getAttribute('tabindex'),
    label: (await first.getAttribute('aria-label')) ?? '',
    text: (await first.innerText()).trim(),
  };
}

/**
 * chip 所在的组：往回找最近的 role=radiogroup / role=group，读出它的 role、aria-label 与组里 chip 的个数。
 * "一行被读成一组"看的就是这个容器——只给每个 chip 加 role 的话，读屏软件仍然只会念孤立的选项。
 */
async function chipGroupA11y(page, testID) {
  const el = page.locator(`[data-testid="${testID}"]`);
  if ((await el.count()) === 0) return null;
  return el.first().evaluate((node) => {
    const group = node.closest('[role="radiogroup"],[role="group"]');
    if (!group) return null;
    return {
      role: group.getAttribute('role'),
      label: group.getAttribute('aria-label') ?? '',
      chips: group.querySelectorAll('[role="radio"],[role="checkbox"]').length,
    };
  });
}

/**
 * label 里说的选中态：true = 说"已选中"，false = 说"未选中"，null = 两样都没说。
 * 判断顺序不能反：中文的「未选中」里含「选中」，英文的 "not selected" 里含 "selected"，
 * 先判肯定式的话，每个没选中的 chip 都会被读成选中的，断言就全成了空话。
 */
function labelState(label) {
  if (/未选中|not selected|sin seleccionar/.test(label)) return false;
  if (/已选中|selected|seleccionado/.test(label)) return true;
  return null;
}

/**
 * 一个"由状态决定长相"的控件（侧边栏导航项、折叠开关、动作按钮）在 DOM 上的可达性属性。
 * current 是 aria-current（导航里的当前项）、expanded 是 aria-expanded（开合开关）、
 * selected 是 aria-selected（只有 tab/option 这类角色才该有；链接和按钮上一旦出现就是假状态）。
 * 页面上没有这个 testID 时返回 null。
 */
async function controlA11y(page, testID) {
  const el = page.locator(`[data-testid="${testID}"]`);
  if ((await el.count()) === 0) return null;
  const first = el.first();
  return {
    role: await first.getAttribute('role'),
    tabIndex: await first.getAttribute('tabindex'),
    label: (await first.getAttribute('aria-label')) ?? '',
    current: await first.getAttribute('aria-current'),
    expanded: await first.getAttribute('aria-expanded'),
    selected: await first.getAttribute('aria-selected'),
    text: (await first.innerText()).trim(),
  };
}

/** 文本里有没有中文或英文的某个说法（与 assertI18n 同口径，只是返回布尔、不抛错）。 */
const hasI18n = (text, zh, en) => text.includes(zh) || text.toLowerCase().includes(en.toLowerCase());

/**
 * 轮询等页面文本里出现某个中/英文说法，返回等到的文本（超时返回最后读到的文本）。
 *
 * 为什么要有它：切 Tab 之后目标屏是**第一次挂载**（懒挂载 + 该屏自己的数据），
 * "点完睡 2500ms 再读一次文本"是拿运行时速度当承诺——慢机器、冷缓存、GC 停顿都会输给它，
 * 而输掉的样子和"这个功能坏了"一模一样。判据与超时诊断（耗时 / URL / 页面开头）在 waitFor 里统一定义，
 * 这里只负责"命中就返回那段文本"，好让调用方原本那条 assertI18n 继续当失败点。
 */
async function waitForI18n(page, zh, en, tries = 40) {
  const hit = await waitFor(
    page,
    async (p) => {
      const text = await p.locator('body').innerText();
      return hasI18n(text, zh, en) ? text : null;
    },
    { tries, label: `页面出现「${zh} / ${en}」` },
  );
  // 超时也要把最后读到的文本交回去，失败才落在调用方那条断言上（waitFor 已经把诊断打出来了）
  return hit ?? (await page.locator('body').innerText());
}

/** 轮询等某个 chip 的 aria-checked 变成期望值（切换后重渲染是异步的，不睡固定时长）。 */
async function waitForChipChecked(page, testID, expected, tries = 24) {
  return waitUntil(
    page,
    async (p) => {
      const chip = await chipA11y(p, testID);
      return chip !== null && chip.checked === expected;
    },
    { tries, label: `${testID} 的 aria-checked 变成 ${expected}` },
  );
}

/** 轮询等某个 testID 的元素出现（换卡组会让整行 chip 换掉，等它渲染出来再断言）。 */
async function waitForChip(page, testID, tries = 24) {
  return waitUntil(
    page,
    async (p) => (await p.locator(`[data-testid="${testID}"]`).count()) > 0,
    { tries, label: `页面上出现 ${testID}` },
  );
}

/** 当前焦点元素的 testID（焦点不在带 testID 的元素上就返回 null）。 */
const focusedTestId = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

/**
 * 从当前焦点一路按 Tab，直到 activeElement 命中某个 testID：返回按了几次，走不到返回 -1。
 * 键盘可达就是这么证的——不是"元素有 tabindex"，而是真的用 Tab 走到了它身上。
 */
async function tabUntilTestId(page, testID, max = 80) {
  for (let i = 1; i <= max; i += 1) {
    await page.keyboard.press('Tab');
    if ((await focusedTestId(page)) === testID) return i;
  }
  return -1;
}

/** 从当前焦点一路按 Tab，直到 activeElement 的文案命中正则（键盘走到某个按钮上）；返回按了几次，走不到返回 -1。 */
async function tabUntilText(page, re, max = 30) {
  for (let i = 1; i <= max; i += 1) {
    await page.keyboard.press('Tab');
    const text = await page.evaluate(() => (document.activeElement?.innerText ?? '').trim());
    if (re.test(text)) return i;
  }
  return -1;
}

function clickI18n(page, zh, en) {
  return page.getByText(new RegExp(`${zh}|${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)).first().click();
}

/**
 * 点导航项（底部 Tab 或桌面侧边栏）：**整串**匹配，不能用 clickI18n 那种子串正则。
 *
 * 子串正则会命中页面正文：/我的|Me/ 对 "Me" 是子串匹配，而 1462 张卡里真有 16 张的正文
 * 带 "Me"（2 张概念卡 + 14 张选择题：amc10-0367 的 "Menelaus"、amc10-0483，以及
 * stats-scenario-033 选项 A 的 "Men's overall admission rate…"、precalc-127 的 "Method" 等）。
 * 这些卡片在 DOM 里排在底部 Tab 之前，.first() 就点到了卡片自己（选项被选中 / 卡片翻面），
 * 导航根本不发生；而每次运行抽到的是哪张卡由乱序决定，所以它表现为"偶发失败、重跑就好"。
 * 这一屏恰好在概念卡池里（564 张，其中 2 张命中 → 每次约 0.35%）。
 *
 * 桌面端侧边栏和（被隐藏的）底部 Tab 都叫「我的」，侧边栏在 DOM 里在前，.first() 仍是可见的那个。
 */
async function clickTab(page, zh, en) {
  const tab = page.getByText(new RegExp(`^(?:${zh}|${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`));
  const found = await tab.count();
  assert(found >= 1, `导航项「${zh} / ${en}」在页面上找得到（整串匹配到 ${found} 个）`);
  await tab.first().click();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Supabase 令牌刷新偶发 401：客户端会内部重试，浏览器仅记录一次网络失败，不算应用错误
      if (/Failed to load resource/.test(t) && /401/.test(t)) return;
      errors.push(t.slice(0, 200));
    }
  });
  page.on('response', (r) => {
    if (r.status() === 401) {
      const url = r.url();
      if (!url.includes('supabase.co')) {
        errors.push(`non-supabase 401 on ${url.slice(0, 120)}`);
      } else {
        console.log(`ℹ️ Supabase 401（重试场景）: ${url.slice(0, 100)}`);
      }
    }
  });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

  // 1. 未登录应看到登录页（路由守卫）
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 首屏要先下载/执行 bundle、再解析会话，才知道该显示登录页还是主界面：等登录文案出现，不睡 4s
  let text = await waitForI18n(page, '登 录', 'Log in', 80);
  assertI18n(text, '登 录', 'Log in', '未登录时显示登录页（路由守卫生效）');
  assertI18n(text, '没有账号？去注册', 'No account? Sign up', '登录页有注册入口');
  assertI18n(text, '继续使用 Google', 'Continue with Google', '登录页有 Google 登录按钮');

  // 2. 注册并进入主界面
  await clickI18n(page, '没有账号？去注册', 'No account? Sign up');
  const inputs = page.locator('input');
  assert((await inputs.count()) >= 3, '注册表单有三个输入框');
  await inputs.nth(0).fill('smoke');
  await inputs.nth(1).fill(EMAIL);
  await inputs.nth(2).fill(PASSWORD);
  await clickI18n(page, '注 册', 'Sign up');
  // 注册要走一次真实的 Supabase 写入 + 首屏数据拉取，慢的时候确实久：但"久"应该多转几圈，
  // 而不是把 7s 当成承诺——等今日页的标题出现（40s 预算，到位就立刻往下走）
  text = await waitForI18n(page, '今日知识点', "Today's lesson", 160);
  assertI18n(text, '今日知识点', "Today's lesson", '注册后进入今日页');
  assert(
    !(text.includes('没有账号？去注册') || text.includes('No account? Sign up')),
    '注册后不再显示登录页',
  );

  // 3. 打卡（学+做：选择题卡先点一个选项 / 概念卡先翻面，然后打卡）
  // 先等作答区真的渲染出来，再点：CI 上注册后页面可能还在加载，固定 sleep 会点空
  const flipCard = page.getByText(/点击卡片|Tap the card/).first();
  const optionA = page.getByText(/^A\./).first();
  await Promise.race([
    flipCard.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    optionA.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
  ]);
  if ((await flipCard.count()) > 0) await flipCard.click();
  else if ((await optionA.count()) > 0) await optionA.click();
  // 作答之后「今日打卡」按钮才会出现（index.tsx 的 doneStep = 答过题 / 翻过面；没满足时那一格是
  // 灰的「先翻面」）：等的是**这个按钮本身**，不是"点完睡 600ms 希望 setState 已经提交"。
  assert(
    await waitUntil(
      page,
      async (p) => hasI18n(await p.locator('body').innerText(), '今日打卡', 'Check in today'),
      { label: '作答后出现可点的「今日打卡 / Check in today」按钮（doneStep 成立才有它）' },
    ),
    '作答（点选项 / 翻面）后出现可点的「今日打卡」按钮',
  );

  // 打卡是一次网络写入 + 状态回填：轮询等按钮变成「今日已打卡」，而不是每 1s 硬睡、睡满 20 次
  await clickI18n(page, '今日打卡', 'Check in today');
  const checkedIn = await waitUntil(
    page,
    async (p) => hasI18n(await p.locator('body').innerText(), '今日已打卡', 'Checked in today'),
    { tries: 80, label: '打卡后按钮变成「今日已打卡 / Checked in today」' },
  );
  assert(checkedIn, '打卡成功（先作答今日一课），按钮变为已打卡（今日已打卡 / Checked in today）');
  text = await page.locator('body').innerText();
  assertI18n(text, '今日练习', "Today's practice", '今日练习进度卡渲染');

  // 4. 自由练（Practice）：默认应为选择题卡（默认只练选择题，不再一进来就是概念词条）
  // 这一屏也是第一次挂载：等的是"整池已经灌进会话"——进度分母到位，说明卡片数据与筛选都渲染完了，
  // 比"点完睡 2500ms 再读一次文本"可靠，也快（通常 1-2 次轮询就过）。
  await clickI18n(page, '自由练', 'Practice');
  const pool = expectedPracticePool();
  assert(await waitForTotal(page, pool), `自由练渲染完成：进度分母是整池 ${pool}（会话已灌入卡片数据）`);
  text = await page.locator('body').innerText();
  assertLabel(text, '全部卡组', 'all decks', '自由练渲染卡组筛选');
  assertLabel(text, '题型', 'card type', '自由练渲染题型筛选');
  assertLabel(text, '乱序', 'shuffle', '自由练渲染乱序开关');
  assertLabel(text, '难度分级', 'Level', '自由练渲染难度筛选');
  assertLabel(text, '可多选', 'multi-select', '难度行标注了可多选');
  assertI18n(text, '答案已独立核验', 'answer independently checked', '卡片标注来源与核验状态');
  assertI18n(text, '题库由 AI 生成', 'AI-generated study material', '筛选区下方有题库来源提示');
  assert(/\nA\.\s/.test(text) && /\nB\.\s/.test(text), '默认渲染选择题选项（A/B）');

  // 4b. 难度分级可多选：点一个档是"加入选择"，再点一个档是"或"（不是替换它），「全部」清空选择。
  // 每一步的分母都从生成数据算（expectedDifficultyPool），不写死数字，也等轮询而不是睡固定时长。
  const levels = expectedDifficulties();
  assert(levels.length > 1, `生成数据里有多个难度档可供多选（${levels.join('/')}）`);
  const [first, second] = levels.slice(-2); // 取最高的两档，正是"只要 3 和 4"这种诉求
  const onlyFirst = expectedDifficultyPool([first]);
  const onlySecond = expectedDifficultyPool([second]);
  const both = expectedDifficultyPool([first, second]);
  assert(
    both === onlyFirst + onlySecond,
    `两档的题数相加 = 多选两档的题数（${onlyFirst} + ${onlySecond} = ${both}）`,
  );
  const chipSel = (d) => `[data-testid="difficulty-${d}"]`;
  // 选中态读 aria-checked：难度这一行是多选，chip 的 role 是 checkbox（aria-selected 不能用在 checkbox 上）
  const chipSelected = (d) => page.locator(chipSel(d)).getAttribute('aria-checked');
  assert((await readProgress(page))?.[1] === pool, `默认「全部」时分母是整池 ${pool}`);
  assert((await chipSelected(first)) === 'false', `难度 ${first} 初始未选中`);

  await page.locator(chipSel(first)).click();
  assert(await waitForTotal(page, onlyFirst), `选中难度 ${first} 后分母变成 ${onlyFirst}（该档的题数）`);
  assert((await chipSelected(first)) === 'true', `难度 ${first} 的 chip 显示为选中（aria-checked）`);
  assert((await chipSelected('all')) === 'false', '选中一个档后「全部」不再是选中态');

  await page.locator(chipSel(second)).click();
  assert(await waitForTotal(page, both), `再选中难度 ${second} 后分母变成 ${both}（两档题数之和 ${onlyFirst} + ${onlySecond}）`);
  assert((await chipSelected(first)) === 'true', `多选后难度 ${first} 仍然是选中态（不是被替换掉）`);
  assert((await chipSelected(second)) === 'true', `多选后难度 ${second} 也是选中态`);

  await page.locator(chipSel('all')).click();
  assert(await waitForTotal(page, pool), `点「全部」后分母回到整池 ${pool}（清空多选）`);
  assert((await chipSelected(first)) === 'false', '清空后各档都回到未选中');
  assert((await chipSelected('all')) === 'true', '清空后「全部」重新成为选中态');

  // 4c. 卡片自己的难度标签：选了"3 和 4"之后，学生必须能看出当前这张是 3 还是 4，
  // 否则没法判断自己卡在哪一档。切到带分级的卡组（练习册/情境题）时标签要出现，
  // 切到没有分级的 AMC10 概念卡组时必须没有——那组卡连 difficulty 字段都没有。
  await page.getByText('AP Precalc · 选择题').first().click();
  assert(await waitForCardDifficulty(page, 1), '切到带分级的卡组后，卡片上出现难度标签（1 个）');
  const badge = (await cardDifficulty(page).first().innerText()).trim();
  const badgeMatch = badge.match(/^(?:难度|Level|Nivel) (\d+)$/);
  assert(badgeMatch !== null, `标签文案是「难度 N / Level N / Nivel N」（实际：${badge}）`);
  assert(
    levels.includes(Number(badgeMatch[1])),
    `标签上的档位 ${badgeMatch[1]} 是生成数据里真实存在的一档（${levels.join('/')}），不是编出来的数字`,
  );

  await page.getByText('算术与数论').first().click();
  assert(await waitForCardDifficulty(page, 0), '切到没有分级的 AMC10 概念卡组后，卡片上不再有难度标签');
  text = await page.locator('body').innerText();
  assertI18n(text, '点击卡片查看答案', 'Tap the card to reveal the answer', 'AMC10 概念卡正常渲染（没标签是因为这组卡本身没有分级，不是页面没渲染出来）');
  assert(
    !/(?:难度|Level|Nivel)\s*(?:0|undefined)/.test(text),
    'AMC10 概念卡上没有「难度 0 / 难度 undefined」这种卡片自己编出来的档位',
  );
  // 排序开关读的就是 difficulty：这组卡一张都没有，所以两个排序 chip 不该出现
  // （「乱序」与难度无关，照旧显示——否则学生连卡都没法打乱）
  assert(
    (await page.locator('[data-testid="order-asc"]').count()) === 0 &&
      (await page.locator('[data-testid="order-desc"]').count()) === 0,
    '没有 difficulty 的 AMC10 卡组不显示「由易到难 / 由难到易」开关',
  );
  assert(
    (await page.locator('[data-testid="order-shuffle"]').count()) === 1,
    'AMC10 卡组上「乱序」开关照旧显示（它不依赖 difficulty）',
  );

  // 切回「全部卡组」，把分母还原成整池，后面的「下一张 = 2 / 整池」才成立
  await page.getByText(/^(?:全部|All)$/).first().click();
  assert(await waitForTotal(page, pool), `切回「全部卡组」后分母回到整池 ${pool}`);

  // 4d. 按难度排序：与「乱序」互斥（选了排序，乱序自动关掉；点回乱序，排序自动关掉），
  //     切换后重开会话（进度回到 1 / 卡组题数），首张卡与同档边界那张的档位逐张与生成数据比对。
  //     期望的档位序列由 expectedSortedSample 从卡组文件算出（稳定排序 = 文件顺序按档分组），
  //     不写死数字；每一步都用轮询等进度与标签到位，不睡固定时长。
  const sortChip = (id) => page.locator(`[data-testid="${id}"]`);
  // 顺序这一行是单选（role=radiogroup + radio），选中态同样读 aria-checked
  const sortSelected = (id) => sortChip(id).getAttribute('aria-checked');

  const deckChip = page.getByText(SORT_DECK_LABEL).first();
  await deckChip.scrollIntoViewIfNeeded(); // 卡组那一行是横向滚动区，排在后面的卡组要先滚进来
  await deckChip.click();
  const deckPool = expectedDeckPool(SORT_DECK_FILE);
  assert(await waitForTotal(page, deckPool), `切到「${SORT_DECK_LABEL}」后分母是该卡组的题数 ${deckPool}`);
  const ascSeq = expectedSortedSample(SORT_DECK_FILE, 'difficulty-asc');
  const descSeq = expectedSortedSample(SORT_DECK_FILE, 'difficulty-desc');
  assert(
    ascSeq.every((d) => d !== null) && descSeq.every((d) => d !== null),
    `「${SORT_DECK_LABEL}」每张卡都带 difficulty，按难度排序才有意义（升序前 ${ascSeq.length} 张 ${ascSeq.join('/')}，降序前 ${descSeq.length} 张 ${descSeq.join('/')}）`,
  );
  assert(
    ascSeq[0] !== ascSeq[ascSeq.length - 1] && descSeq[0] !== descSeq[descSeq.length - 1],
    `采样里要跨过一个档位边界，排序才看得出效果（升序 ${ascSeq.join('/')}，降序 ${descSeq.join('/')}）`,
  );

  text = await page.locator('body').innerText();
  assertLabel(text, '由易到难', 'Easy first', '带分级的卡组上有「由易到难」开关');
  assertLabel(text, '由难到易', 'Hard first', '带分级的卡组上有「由难到易」开关');
  assert(
    (await sortChip('order-asc').count()) === 1 && (await sortChip('order-desc').count()) === 1,
    '两个排序开关都在界面上（有各自的 testID，可点）',
  );
  assert((await sortSelected('order-shuffle')) === 'true', '默认仍是乱序：两个排序 chip 都没选中');

  await sortChip('order-asc').click();
  assert(await waitForProgress(page, 1, deckPool), `切到「由易到难」后重开会话，进度回到 1 / ${deckPool}`);
  assert((await sortSelected('order-asc')) === 'true', '「由易到难」显示为选中');
  assert((await sortSelected('order-shuffle')) === 'false', '选了排序后「乱序」自动关掉（两种顺序语义互斥）');
  for (let i = 0; i < ascSeq.length; i += 1) {
    if (i > 0) await clickI18n(page, '下一张', 'Next');
    assert(await waitForProgress(page, i + 1, deckPool), `由易到难第 ${i + 1} 张：进度 ${i + 1} / ${deckPool}`);
    assert(
      await waitForCurrentCardDifficulty(page, ascSeq[i]),
      `由易到难第 ${i + 1} 张卡是难度 ${ascSeq[i]}（档位由卡组文件按稳定排序算出，不是写死的）`,
    );
  }

  await sortChip('order-desc').click();
  assert(await waitForProgress(page, 1, deckPool), `切到「由难到易」同样重开会话，进度回到 1 / ${deckPool}`);
  assert(
    (await sortSelected('order-desc')) === 'true' && (await sortSelected('order-asc')) === 'false',
    '两个方向互斥：选中降序时升序不再选中',
  );
  assert((await sortSelected('order-shuffle')) === 'false', '降序时乱序同样是关掉的');
  for (let i = 0; i < descSeq.length; i += 1) {
    if (i > 0) await clickI18n(page, '下一张', 'Next');
    assert(await waitForProgress(page, i + 1, deckPool), `由难到易第 ${i + 1} 张：进度 ${i + 1} / ${deckPool}`);
    assert(
      await waitForCurrentCardDifficulty(page, descSeq[i]),
      `由难到易第 ${i + 1} 张卡是难度 ${descSeq[i]}（降序从最高档开始，与升序不同）`,
    );
  }

  await sortChip('order-shuffle').click();
  assert((await sortSelected('order-shuffle')) === 'true', '点回「乱序」：乱序重新选中');
  assert(
    (await sortSelected('order-asc')) === 'false' && (await sortSelected('order-desc')) === 'false',
    '开乱序时两个排序 chip 都关掉（互斥是双向的）',
  );
  assert(await waitForProgress(page, 1, deckPool), `换顺序后重开会话，进度回到 1 / ${deckPool}`);

  // 切回「全部卡组」，让后面的「下一张 = 2 / 整池」重新成立（换卡组也会重开会话）
  await page.getByText(/^(?:全部|All)$/).first().click();
  assert(await waitForTotal(page, pool), `排序检查完切回「全部卡组」，分母回到整池 ${pool}`);

  // 4e. 筛选 chip 的无障碍与键盘：每一行读成一个组（radiogroup/group + aria-label），
  //     每个 chip 有 role / aria-checked / tabindex 和"哪一行 + 哪个选项 + 选中没有"的可读名，
  //     而且整条筛选只用键盘也能走通：Tab 聚焦 → Enter 切换（分母跟着变）→ 再 Tab 到「下一张」→ Enter（分子变）。
  //     期望值一律从生成数据算（expectedDeckKeys / expectedDifficultyPool），一个数字都不写死。
  const deckChipIds = ['deck-all', ...expectedDeckKeys().map((k) => `deck-${k}`)];
  const groupOf = {
    deck: { zh: '卡组筛选', en: 'Deck filter' },
    kind: { zh: '题型筛选', en: 'Card type filter' },
    difficulty: { zh: '难度分级筛选', en: 'Level filter' },
    order: { zh: '顺序筛选', en: 'Order filter' },
  };
  const filterChips = [
    ...deckChipIds.map((id) => ({ id, role: 'radio', group: groupOf.deck })),
    { id: 'kind-all', role: 'radio', group: groupOf.kind },
    { id: 'kind-quiz', role: 'radio', group: groupOf.kind },
    { id: 'kind-concept', role: 'radio', group: groupOf.kind },
    { id: 'difficulty-all', role: 'checkbox', group: groupOf.difficulty },
    ...levels.map((d) => ({ id: `difficulty-${d}`, role: 'checkbox', group: groupOf.difficulty })),
    { id: 'order-shuffle', role: 'radio', group: groupOf.order },
    { id: 'order-asc', role: 'radio', group: groupOf.order },
    { id: 'order-desc', role: 'radio', group: groupOf.order },
  ];

  // 一行一行地读：容器是 role=radiogroup（单选行）或 role=group（多选行），aria-label 说明这一行在筛什么，
  // 组里的 chip 个数要与数据对得上（卡组 15 + 「全部」、题型 2 + 「全部」、难度 4 档 + 「全部」、顺序 3）。
  const rowSpecs = [
    { chip: 'deck-all', role: 'radiogroup', group: groupOf.deck, chips: deckChipIds.length },
    { chip: 'kind-all', role: 'radiogroup', group: groupOf.kind, chips: 3 },
    { chip: 'difficulty-all', role: 'group', group: groupOf.difficulty, chips: levels.length + 1 },
    { chip: 'order-shuffle', role: 'radiogroup', group: groupOf.order, chips: 3 },
  ];
  for (const spec of rowSpecs) {
    const row = await chipGroupA11y(page, spec.chip);
    assert(row !== null, `${spec.group.zh} 那一行是一个读得出来的组（有 role 与 aria-label）`);
    assert(
      row.role === spec.role,
      `${spec.group.zh} 的容器 role=${row.role}（${spec.role}：${spec.role === 'group' ? '可多选' : '单选'}，与这一行的行为一致）`,
    );
    assert(
      hasI18n(row.label, spec.group.zh, spec.group.en),
      `${spec.group.zh} 的 aria-label 说明了这一行在筛什么：${row.label}`,
    );
    assert(row.chips === spec.chips, `${spec.group.zh} 组里有 ${row.chips} 个 chip（期望 ${spec.chips}）`);
  }

  // 逐个 chip 读回来：role、tabindex=0（Tab 停得下来）、aria-checked，以及 label 里必须同时有
  // 分组名、选项文案和"选中/未选中"，而且 label 说的选中态必须与 aria-checked 一致。
  // 顺手断言 aria-selected 已经彻底不在（它不能用在 radio/checkbox 上，留着就是给读屏软件的假状态）。
  const chipProblems = [];
  for (const spec of filterChips) {
    const chip = await chipA11y(page, spec.id);
    if (!chip) {
      chipProblems.push(`${spec.id}: 页面上没有这个 chip`);
      continue;
    }
    if (chip.role !== spec.role) chipProblems.push(`${spec.id}: role=${chip.role} ≠ ${spec.role}`);
    if (chip.tabIndex !== '0') chipProblems.push(`${spec.id}: tabindex=${chip.tabIndex} ≠ 0（键盘停不下来）`);
    if (chip.selected !== null) chipProblems.push(`${spec.id}: 还留着 aria-selected=${chip.selected}`);
    if (!hasI18n(chip.label, spec.group.zh, spec.group.en)) {
      chipProblems.push(`${spec.id}: label 里没有分组名：${chip.label}`);
    }
    if (!chip.label.includes(chip.text)) {
      chipProblems.push(`${spec.id}: label 里没有选项文案「${chip.text}」：${chip.label}`);
    }
    if (labelState(chip.label) !== (chip.checked === 'true')) {
      chipProblems.push(`${spec.id}: aria-checked=${chip.checked} 与 label 说的不一致：${chip.label}`);
    }
  }
  assert(
    chipProblems.length === 0,
    `每个筛选 chip 都有 role / aria-checked / tabindex=0，可读名里带分组名、选项与选中态，且没有 aria-selected（共 ${filterChips.length} 个）${chipProblems.length ? '：' + chipProblems[0] : ''}`,
  );

  // 键盘：从页面开头一路 Tab 走过去，看焦点能不能真的落到难度 chip 上（不是"它有 tabindex"这种间接证据）
  await page.evaluate(() => document.body.focus());
  const tabsToChip = await tabUntilTestId(page, `difficulty-${second}`);
  assert(
    tabsToChip > 0,
    `只用 Tab 就能把焦点走到难度 ${second} 的 chip 上（从页面开头按了 ${tabsToChip} 次 Tab）`,
  );
  assert(
    (await focusedTestId(page)) === `difficulty-${second}`,
    `焦点确实落在它身上（document.activeElement = ${await focusedTestId(page)}）`,
  );

  // Enter：切换选中态，并且分母真的跟着筛（898 → 该档题数）
  await page.keyboard.press('Enter');
  assert(await waitForChipChecked(page, `difficulty-${second}`, 'true'), '在 chip 上按 Enter：aria-checked 变成 true');
  assert(await waitForTotal(page, onlySecond), `按 Enter 真的筛了：分母从 ${pool} 变成难度 ${second} 的 ${onlySecond} 题`);
  assert(
    labelState((await chipA11y(page, `difficulty-${second}`)).label) === true,
    '选中之后 label 说的是"已选中"（可读名与 aria-checked 同步）',
  );

  // 空格：role=radio/checkbox 在 RN Web 里渲染成 <div role="...">，RNW 只把空格当成"按下"处理原生 button / role=button，
  // 所以这个键是页面自己接住的（src/app/(tabs)/study.tsx 的 spaceKeyProps，靠 onKeyDown + preventDefault）
  await page.keyboard.press(' ');
  assert(
    await waitForChipChecked(page, `difficulty-${second}`, 'false'),
    '在这个 chip 上按空格同样能切换（div 上的空格不会自己变成点击，页面接住了它）',
  );
  assert(await waitForTotal(page, pool), `空格取消选中后分母回到整池 ${pool}`);

  await page.keyboard.press('Enter');
  assert(await waitForTotal(page, onlySecond), `再按 Enter 又能选中（分母回到 ${onlySecond}），切换是可逆的`);

  // 分子也是键盘改的：从 chip 继续 Tab 到「下一张」，按 Enter
  const tabsToNext = await tabUntilText(page, /^(?:下一张|Next)$/);
  assert(tabsToNext > 0, `从 chip 继续按 Tab 能走到「下一张」（按了 ${tabsToNext} 次）`);
  await page.keyboard.press('Enter');
  assert(await waitForProgress(page, 2, onlySecond), `在「下一张」上按 Enter：进度 2 / ${onlySecond}（分子也是键盘改的）`);

  // 键盘走完一遍把筛选还原：点卡组的「全部」会连难度选择一起清掉（pickDeck 的既有行为），
  // 顺便验证 chip 的 aria-checked 跟着复位——否则后面「下一张 = 2 / 整池」就不成立了。
  await page.locator('[data-testid="deck-all"]').click();
  assert(await waitForTotal(page, pool), `键盘检查完点回「全部卡组」，分母回到整池 ${pool}`);
  assert(
    await waitForChipChecked(page, `difficulty-${second}`, 'false'),
    '切回全部卡组会把难度选择清掉，难度 chip 的 aria-checked 也跟着回到 false',
  );

  // 「分层」那一行只在 AMC10 概念卡组上出现（hasLevels = true），同样要能读成一组单选：
  // 它的容器也是 radiogroup、也带 aria-label，chip 也是 role=radio + 可选中的可读名。
  await page.locator('[data-testid="deck-arithmetic"]').click();
  assert(await waitForChip(page, 'level-all'), '切到 AMC10 概念卡组后出现「分层」那一行');
  const levelRow = await chipGroupA11y(page, 'level-all');
  assert(
    levelRow !== null && levelRow.role === 'radiogroup',
    `分层行也是一个读得出来的组（role=${levelRow?.role}）`,
  );
  assert(
    hasI18n(levelRow.label, '分层筛选', 'Tier filter'),
    `分层组的 aria-label 说明了这一行在筛什么：${levelRow.label}`,
  );
  assert(levelRow.chips === 4, `分层行有 ${levelRow.chips} 个 chip（期望 4：全部 + 核心/提高/边界）`);
  const levelCore = await chipA11y(page, 'level-core');
  assert(
    levelCore.role === 'radio' && labelState(levelCore.label) === false && hasI18n(levelCore.label, '分层筛选', 'Tier filter'),
    `分层的 chip 带 role、选中态与可读名：${levelCore.label}`,
  );
  await page.locator('[data-testid="deck-all"]').click();
  assert(await waitForTotal(page, pool), `分层行检查完切回「全部卡组」，分母回到整池 ${pool}`);

  // 5. 下一张 + 切到概念卡翻面
  // 三处都不睡固定时长：分子/分母与翻面提示都是 DOM 状态，等它们到位即可
  await clickI18n(page, '下一张', 'Next');
  assert(
    await waitForProgress(page, 2, pool),
    `下一张后进度为 2 / ${pool}（练习册 + 情境题的题量，从生成数据算出）`,
  );
  await clickI18n(page, '概念卡', 'Concept cards');
  text = await waitForI18n(page, '点击卡片查看答案', 'Tap the card to reveal the answer');
  assertI18n(text, '点击卡片查看答案', 'Tap the card to reveal the answer', '切到概念卡后走翻面模式');
  await clickI18n(page, '翻面', 'Flip');
  // 这一条是**反向**条件（提示消失），同样是等得到的状态，只是判据写成"不再出现"
  assert(
    await waitUntil(
      page,
      async (p) =>
        !hasI18n(await p.locator('body').innerText(), '点击卡片查看答案', 'Tap the card to reveal the answer'),
      { label: '翻面后「点击卡片查看答案 / Tap the card」提示消失' },
    ),
    '翻面后露出答案（隐藏翻卡提示）',
  );

  // 6. 我的页
  // 这一步曾经偶发失败（CI 红过一次、同提交重跑就过；本地也有人遇到过一次同样现象），两个原因叠在同一条断言上：
  // (a) 点 Tab 用的是 /我的|Me/ 这种子串正则 + .first()，它会命中卡片正文里的 "Menelaus" / "Men's"
  //     （见 clickTab 的注释），于是什么都没导航，后面必然读不到「课程掌握度」；
  // (b) 即使导航对了，"睡 2500ms 再读一次文本"也是把渲染时机当承诺——这一屏是第一次挂载。
  // 两处都改成"等目标状态"：整串匹配导航项 + 轮询等目标文案，超时把当时的 URL/页面打出来。
  await clickTab(page, '我的', 'Me');
  text = await waitForI18n(page, '课程掌握度', 'Course mastery');
  assertI18n(text, '课程掌握度', 'Course mastery', `我的页渲染课程掌握度（URL ${page.url()}）`);
  assertI18n(text, '每日目标', 'Daily goal', '我的页渲染每日目标');
  assertI18n(text, '语言', 'Language', '我的页渲染语言切换');
  assertI18n(text, '主题', 'Theme', '我的页渲染主题切换');
  assertI18n(text, '里程碑徽章', 'Milestones', '我的页渲染里程碑徽章');

  // 6a. 「我的」页·题库概览：总题数、每档题数、没有分级的张数、每个卡组的题数全部与生成数据比对。
  //     期望值从生成文件算（AMC10 概念卡 + 练习池），不写死任何数字；渲染靠轮询等，不睡固定时长。
  const libraryTotal = expectedLibraryTotal();
  const conceptCards = expectedConceptCards();
  const deckKeys = expectedDeckKeys();
  const gradeLevels = expectedDifficulties();
  const gradePool = (d) => expectedLibraryDifficultyPool([d]);
  const gradedSum = gradeLevels.reduce((n, d) => n + gradePool(d), 0);
  assertI18n(text, '题库概览', 'Question bank', '我的页渲染题库概览卡');
  assert((await countTestIds(page, 'pool-card')) === 1, '题库概览是一张独立的卡片（页面上只有一张）');
  assert(await waitForTestIdNumber(page, 'pool-total', libraryTotal), `题库概览的总题数是 ${libraryTotal}（AMC10 概念卡 + 练习池，两个数都从生成数据数出来）`);
  assert(
    await waitForTestIdNumber(page, 'pool-ungraded-count', conceptCards),
    `"没有分级"那一行是 AMC10 概念卡的张数 ${conceptCards}（不是 0，也不是某一档）`,
  );
  for (const d of gradeLevels) {
    assert(
      await waitForTestIdNumber(page, `pool-grade-count-${d}`, gradePool(d)),
      `难度 ${d} 的题数是 ${gradePool(d)}（该档在生成数据里的题数）`,
    );
  }
  assert(
    gradedSum + conceptCards === libraryTotal,
    `四档之和 ${gradedSum} + 没有分级 ${conceptCards} = 总题数 ${libraryTotal}（无分级的卡没被算进任何一档，也没被算成 0 档）`,
  );
  assert(
    !/(?:难度|Level|Nivel)\s*0/.test(text),
    '概览里没有"难度 0"这种把"没有分级"当成一档的行（上面那行是单列的）',
  );
  assert(
    (await countTestIds(page, 'pool-grade-count-')) === gradeLevels.length,
    `难度行数与数据里的档位数一致（${gradeLevels.length} 档：${gradeLevels.join('/')}）`,
  );

  // 无障碍：标题与每一项都有可读的 label（沿用仓库做法：accessibilityLabel → aria-label）。
  // 断言 label 里同时有档位与该档题数，学生/读屏软件听到的才是"难度 3，192 题"这种完整信息。
  const totalLabel = (await ariaLabelOf(page, 'pool-total-row')) ?? '';
  assert(totalLabel.includes(String(libraryTotal)), `总题数一行有可读的 label（含 ${libraryTotal}）：${totalLabel}`);
  for (const d of gradeLevels) {
    const label = (await ariaLabelOf(page, `pool-grade-${d}`)) ?? '';
    assert(
      label.includes(String(d)) && label.includes(String(gradePool(d))),
      `难度 ${d} 一行有可读的 label（含档位与该档题数）：${label}`,
    );
  }
  const ungradedLabel = (await ariaLabelOf(page, 'pool-ungraded-row')) ?? '';
  assert(
    ungradedLabel.includes(String(conceptCards)),
    `"没有分级"一行有可读的 label（含张数 ${conceptCards}）：${ungradedLabel}`,
  );

  // 卡组明细：默认收起（不把这一页撑长），展开后逐个卡组与生成数据比对，再收起。
  // 「收起/展开」这个状态必须真的在 DOM 上：改之前这里写的是 accessibilityState={{ expanded }},
  // 而 react-native-web 会把整个 accessibilityState 丢掉——实测展开前后都是
  // <button aria-label="Show 15 decks">，除了可读名换了句话，aria-expanded 一次都没出现过。
  const decksToggle = await controlA11y(page, 'pool-decks-toggle');
  assert(decksToggle !== null, '题库概览里有卡组明细的折叠开关');
  assert(decksToggle.role === 'button', `折叠开关的 role 是 button（不是裸 div）：${decksToggle.role}`);
  assert(
    await waitForTestIdAttr(page, 'pool-decks-toggle', 'aria-expanded', 'false'),
    '卡组明细默认收起：aria-expanded="false"（不是只靠按钮文案说"展开"）',
  );
  assert((await countTestIds(page, 'pool-deck-count-')) === 0, '卡组明细默认收起（页面上没有 15 行卡组）');
  await page.locator('[data-testid="pool-decks-toggle"]').click();
  assert(
    await waitForTestIdAttr(page, 'pool-decks-toggle', 'aria-expanded', 'true'),
    '点开后 aria-expanded 变成 "true"（状态跟着 DOM 走，不是只改可读名）',
  );
  assert(
    await waitForTestIdCount(page, 'pool-deck-count-', deckKeys.length),
    `展开后列出全部 ${deckKeys.length} 个卡组`,
  );
  let deckSum = 0;
  const deckMismatch = [];
  for (const key of deckKeys) {
    const shown = await readTestIdNumber(page, `pool-deck-count-${key}`);
    const expected = expectedDeckCards(key);
    deckSum += shown ?? 0;
    if (shown !== expected) deckMismatch.push(`${key}: 界面 ${shown} ≠ 期望 ${expected}`);
  }
  assert(
    deckMismatch.length === 0,
    `每个卡组的题数都与生成数据一致（${deckKeys.length} 个卡组）${deckMismatch.length ? '：' + deckMismatch[0] : ''}`,
  );
  assert(deckSum === libraryTotal, `各卡组题数之和 ${deckSum} = 总题数 ${libraryTotal}`);
  const deckLabel = (await ariaLabelOf(page, `pool-deck-${deckKeys[0]}`)) ?? '';
  assert(
    deckLabel.includes(String(expectedDeckCards(deckKeys[0]))),
    `卡组明细每行有可读的 label（含该卡组题数）：${deckLabel}`,
  );
  await page.locator('[data-testid="pool-decks-toggle"]').click();
  assert(await waitForTestIdCount(page, 'pool-deck-count-', 0), '再点一次收起卡组明细（折叠是可逆的）');
  assert(
    await waitForTestIdAttr(page, 'pool-decks-toggle', 'aria-expanded', 'false'),
    '收起后 aria-expanded 回到 "false"（两个方向都进 DOM）',
  );

  // 6a-2. 我的页三行"同一时刻只能成立一个"的选项（每日目标 / 语言 / 主题）。
  //       改之前这三行用的是 accessibilityState={{ selected }}，RNW 丢掉整个对象，于是九个选项在 DOM 上
  //       都是裸的 <div tabindex="0">：没有 role、没有选中态，读屏软件听到的是一个不知道能不能点的方块。
  //       现在每行是 role=radiogroup + aria-label，每个选项是 role=radio + aria-checked，
  //       可读名里带"哪一行 + 哪个选项 + 选中没有"，并且不出现 aria-selected（它在 radio 上是假状态）。
  //       选项 testID 与 DAILY_GOALS / LOCALES / THEME_OPTIONS 一一对应（3 / 3 / 3 个）。
  const radioRows = [
    { name: '每日目标', en: 'Daily goal', chips: ['goal-3', 'goal-5', 'goal-10'] },
    { name: '语言', en: 'Language', chips: ['lang-zh', 'lang-en', 'lang-es'] },
    { name: '主题', en: 'Theme', chips: ['theme-system', 'theme-light', 'theme-dark'] },
  ];
  for (const row of radioRows) {
    const group = await chipGroupA11y(page, row.chips[0]);
    assert(group !== null, `${row.name} 那一行是一个读得出来的组（有 role 与 aria-label）`);
    assert(
      group.role === 'radiogroup',
      `${row.name} 的容器 role=${group.role}（这一行同一时刻只有一个能成立，所以是单选组）`,
    );
    assert(
      hasI18n(group.label, row.name, row.en),
      `${row.name} 的 aria-label 说明了这一行是什么：${group.label}`,
    );
    assert(group.chips === row.chips.length, `${row.name} 组里有 ${group.chips} 个选项（期望 ${row.chips.length}）`);
    const problems = [];
    let checked = 0;
    for (const id of row.chips) {
      const chip = await chipA11y(page, id);
      if (!chip) {
        problems.push(`${id}: 页面上没有这个选项`);
        continue;
      }
      if (chip.role !== 'radio') problems.push(`${id}: role=${chip.role} ≠ radio`);
      if (chip.tabIndex !== '0') problems.push(`${id}: tabindex=${chip.tabIndex} ≠ 0（键盘停不下来）`);
      if (chip.selected !== null) problems.push(`${id}: 还留着 aria-selected=${chip.selected}`);
      if (chip.checked !== 'true' && chip.checked !== 'false') {
        problems.push(`${id}: aria-checked=${chip.checked}（选中态没进 DOM）`);
      }
      if (chip.checked === 'true') checked += 1;
      if (!hasI18n(chip.label, row.name, row.en)) {
        problems.push(`${id}: 可读名里没有这一行的名字：${chip.label}`);
      }
      if (!chip.label.includes(chip.text)) {
        problems.push(`${id}: 可读名里没有选项文案「${chip.text}」：${chip.label}`);
      }
      if (labelState(chip.label) !== (chip.checked === 'true')) {
        problems.push(`${id}: aria-checked=${chip.checked} 与可读名说的不一致：${chip.label}`);
      }
    }
    assert(
      problems.length === 0,
      `${row.name} 的每个选项都是 role=radio + aria-checked + tabindex=0，可读名带组名/选项/选中态，且没有 aria-selected（共 ${row.chips.length} 个）${problems.length ? '：' + problems[0] : ''}`,
    );
    assert(checked === 1, `${row.name} 恰好一个选项是 aria-checked="true"（实际 ${checked} 个）`);
  }

  // 点击与键盘都要能改选中态。这里只动「每日目标」：切语言会把整个界面换掉、主题在第 6b 段单独验，
  // 而目标只是个本地偏好。先读出当前选中的那个，切到另一个，再按空格切回来（结束时不留下副作用）。
  const goalIds = radioRows[0].chips;
  const checkedGoal = (
    await Promise.all(goalIds.map(async (id) => ((await chipA11y(page, id))?.checked === 'true' ? id : null)))
  ).find(Boolean);
  assert(goalIds.includes(checkedGoal), `每日目标有一项是选中的（${checkedGoal}）`);
  const otherGoal = goalIds.find((id) => id !== checkedGoal);
  await page.locator(`[data-testid="${otherGoal}"]`).click();
  assert(await waitForChipChecked(page, otherGoal, 'true'), `点「${otherGoal}」：它的 aria-checked 变成 true`);
  assert(
    await waitForChipChecked(page, checkedGoal, 'false'),
    `同时原来的「${checkedGoal}」回到 false（一行只有一个选中，不是各自独立勾选）`,
  );
  // 空格：role=radio 在 RNW 里渲染成 <div role="radio">，RNW 只把空格当成原生 button / role=button 的"按下"，
  // 所以这个键由页面自己接住（src/app/(tabs)/profile.tsx 的 spaceKeyProps，靠 onKeyDown + preventDefault）。
  // 按空格要落在**没选中**的那个上：radio 不像 checkbox 能被空格取消，落在已选中的那个上是空操作。
  await page.locator(`[data-testid="${checkedGoal}"]`).focus();
  await page.keyboard.press(' ');
  assert(
    await waitForChipChecked(page, checkedGoal, 'true'),
    '在另一个选项上按空格同样能选中它（div 上的空格不会自己变成点击，页面接住了它）',
  );
  assert(
    await waitForChipChecked(page, otherGoal, 'false'),
    `空格选中「${checkedGoal}」之后「${otherGoal}」让位（键盘与点击走的是同一条单选规则）`,
  );

  // 移动端视口（390px）下不横向溢出：展开过的卡组行收起后也不该剩下一根被撑出去的横条
  const mobileOverflow = await horizontalOverflow(page);
  assert(mobileOverflow <= 1, `移动端（390px）没有任何元素把页面撑出视口（超出 ${mobileOverflow}px）`);

  // 6b. 主题切换：点「暗色」后页面背景应变黑，切回后恢复
  const bgBefore = await page.evaluate(() =>
    [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).backgroundColor === 'rgb(245, 245, 245)'),
  );
  await clickI18n(page, '暗色', 'Dark');
  // 暗色是靠 Provider 换 theme + 重挂载生效的（antd 把样式缓存在组件实例里），所以"变黑"本身
  // 就是可观察终点：等出现 rgb(0,0,0) 的背景色，而不是点完硬睡 1200ms 再赌它已经重挂载完
  const darkApplied = await waitUntil(
    page,
    (p) =>
      p.evaluate(() =>
        [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).backgroundColor === 'rgb(0, 0, 0)'),
      ),
    { label: '点「暗色」后有元素背景变成 rgb(0, 0, 0)' },
  );
  assert(bgBefore && darkApplied, '暗色主题生效（背景变黑）');

  // 6b-2. 暗色下关键元素仍然可见。
  // 这里刻意**不去浏览器里算对比度**：对比度由主题 token 决定，用 WCAG 公式实算的那份审计
  // （临时脚本，不进仓库）才有意义；写成 DOM 断言只会得到一条脆断言——antd 的 WithTheme 把
  // 样式缓存在组件实例里、主题是通过重挂载生效的，任何一次实现调整都会让"算出来的颜色"
  // 与写死的期望值对不上，而这条断言本来想守的是"别把字藏起来换成变黑"。
  for (const id of ['pool-card', 'pool-total']) {
    assert(
      await page.locator(`[data-testid="${id}"]`).first().isVisible(),
      `暗色下 ${id} 仍然可见（不是靠隐藏文字换来的"变黑"）`,
    );
  }

  // 6c. 今日页新增：今日一课 + 本周概览（dark 下点击会被全屏层拦截，用 URL 导航）
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 整页重载：bundle 执行 + 会话恢复都比一次客户端跳转慢，等今日页标题出现（20s 预算）
  text = await waitForI18n(page, '今日知识点', "Today's lesson", 80);
  assertI18n(text, '今日知识点', "Today's lesson", '今日页渲染今日一课');
  assertI18n(text, '本周概览', 'This week', '今日页渲染本周概览');

  const consoleErrors = errors.filter((e) => !e.includes('favicon'));
  assert(consoleErrors.length === 0, `无浏览器控制台错误${consoleErrors.length ? '：' + consoleErrors[0] : ''}`);

  // 7. 桌面端（≥900px）：侧边栏布局 + 导航
  await page.setViewportSize({ width: 1280, height: 900 });
  // 视口一变，布局由 useMedia 的监听重挂载成侧边栏：等侧边栏的导航项真的出现在 DOM 上，
  // 不睡 2000ms 赌它在（这条判据比"品牌文案"稳：折叠成图标栏时文案不渲染，导航项照旧在）
  assert(
    await waitUntil(
      page,
      async (p) => (await p.locator('[data-testid="sidebar-nav-checkin"]').count()) > 0,
      { label: '视口切到 1280px 后出现侧边栏（sidebar-nav-checkin）' },
    ),
    '桌面视口（1280px）下切出侧边栏布局',
  );
  text = await page.locator('body').innerText();
  assertI18n(text, '每日学习打卡', 'Daily study habit', '桌面端显示侧边栏品牌');
  assertI18n(text, '退出登录', 'Sign out', '桌面端侧边栏有退出入口');
  const tabBarVisible = await page.getByText(/打卡|Check in/).first().isVisible();
  // 桌面端应隐藏底部 Tab 栏（侧边栏的"打卡"在左边，底部栏的"打卡"不应可见）
  const flameIcons = await page.locator('[class*="tabBar"]').count();
  assert(flameIcons === 0 || !tabBarVisible, '桌面端隐藏底部 Tab 栏');
  // 侧边栏导航项应包含 今日 / 自由练 / 我的（无需点击，避免 dark 全屏层与深链抖动）
  assert(/(Today|今日)[\s\S]*(Practice|自由练)[\s\S]*(Me|我的)/.test(text), '桌面端侧边栏含 今日 / 自由练 / 我的');

  // 7a. 侧边栏的可达性：导航项是跳转（role=link + 当前那条 aria-current="page"），底部三个动作是
  //     role=button。改之前这一栏每一项都是裸的 <div tabindex="0" aria-label="Me">——既没有角色也没有
  //     "现在在哪一页"（写的是 accessibilityState={{ selected }}，RNW 把整个对象丢掉，DOM 上一个属性都没留下）。
  //     aria-selected 这里必须为空：它是 tab/option 这类角色的状态，链接的"当前项"是 aria-current
  //     （底部 Tab 由 expo-router 自己渲染成 role="tab" + aria-selected，那是另一套，各自成立）。
  const sidebarNav = ['sidebar-nav-checkin', 'sidebar-nav-study', 'sidebar-nav-profile'];
  const navProblems = [];
  const currentNav = [];
  for (const id of sidebarNav) {
    const item = await controlA11y(page, id);
    if (!item) {
      navProblems.push(`${id}: 桌面视口下没有这个导航项`);
      continue;
    }
    if (item.role !== 'link') navProblems.push(`${id}: role=${item.role} ≠ link（裸 div 没有角色）`);
    if (item.tabIndex !== '0') navProblems.push(`${id}: tabindex=${item.tabIndex}（键盘停不下来）`);
    if (!item.label) navProblems.push(`${id}: 没有可读名（折叠成图标栏时文字不渲染，名字只能来自 aria-label）`);
    if (item.selected !== null) navProblems.push(`${id}: 还留着 aria-selected=${item.selected}`);
    if (item.current === 'page') currentNav.push(id);
  }
  assert(
    navProblems.length === 0,
    `三个导航项都是 role=link + tabindex=0 + 有可读名，且没有 aria-selected（链接的当前态是 aria-current）${navProblems.length ? '：' + navProblems[0] : ''}`,
  );
  assert(
    currentNav.length === 1 && currentNav[0] === 'sidebar-nav-checkin',
    `只有当前路由那一项带 aria-current="page"，即「今日」（实际：${currentNav.join(' / ') || '一个都没有'}）`,
  );

  const actionProblems = [];
  for (const id of ['sidebar-collapse', 'sidebar-theme-toggle', 'sidebar-signout']) {
    const action = await controlA11y(page, id);
    if (!action) {
      actionProblems.push(`${id}: 页面上没有这个入口`);
      continue;
    }
    if (action.role !== 'button') actionProblems.push(`${id}: role=${action.role} ≠ button`);
    if (!action.label) actionProblems.push(`${id}: 没有可读名`);
    if (action.current !== null || action.selected !== null) {
      actionProblems.push(`${id}: 带了 aria-current=${action.current} / aria-selected=${action.selected}（动作没有"选中"这回事）`);
    }
  }
  assert(
    actionProblems.length === 0,
    `侧边栏三个动作（折叠 / 切主题 / 退出登录）都是带可读名的 role=button，不带当前项或选中态${actionProblems.length ? '：' + actionProblems[0] : ''}`,
  );
  // 键盘：只用 Tab 焦点要能走到「退出登录」上（只走到它，不按 Enter/空格——那会真的登出）
  await page.evaluate(() => document.body.focus());
  const tabsToSignOut = await tabUntilTestId(page, 'sidebar-signout');
  assert(tabsToSignOut > 0, `只用 Tab 就能把焦点走到侧边栏的退出登录上（从页面开头按了 ${tabsToSignOut} 次 Tab）`);

  // 7b. 桌面视口下的题库概览：宽屏有左侧边栏、卡片 maxWidth 760，数字与移动端一致才算"两种视口没有差异"。
  //     这里不能像 6c 那样直接 goto '/profile'：整套布局挂在 Stack.Protected 里，
  //     带路径的整页加载会被路由守卫重置回首页（实测 goto '/profile' 后 URL 变成 '/'、
  //     且停在今日页），所以改成点侧边栏的「我的」做客户端跳转——探针验证过暗色下这一下点得动。
  //     这里同样用 clickTab 的整串匹配：这一屏的正文（今日贴卡）里也可能出现 "Me"。
  await clickTab(page, '我的', 'Me');
  // aria-current 得跟着路由走：点完「我的」，当前项从「今日」挪到「我的」，旧的那条必须把属性摘掉——
  // 只加不删的话读屏软件会念出两个"当前页"。
  assert(
    await waitForTestIdAttr(page, 'sidebar-nav-profile', 'aria-current', 'page'),
    '切到「我的」之后，侧边栏的「我的」成了 aria-current="page"',
  );
  assert(
    await waitForTestIdAttr(page, 'sidebar-nav-checkin', 'aria-current', null),
    '「今日」不再是当前路由，它的 aria-current 被摘掉（当前项只会有一个）',
  );
  assert(
    await waitForTestIdNumber(page, 'pool-total', libraryTotal),
    `桌面端（1280px）题库概览的总题数同样是 ${libraryTotal}`,
  );
  assert(
    await waitForTestIdNumber(page, 'pool-ungraded-count', conceptCards),
    `桌面端"没有分级"那一行同样是 ${conceptCards}`,
  );
  for (const d of gradeLevels) {
    assert(
      await waitForTestIdNumber(page, `pool-grade-count-${d}`, gradePool(d)),
      `桌面端难度 ${d} 的题数同样是 ${gradePool(d)}（与移动端一致，说明宽屏只是排版变宽）`,
    );
  }
  // 宽屏下把 15 行卡组展开，确认卡片在 760px 里排得下、横向不溢出，再收起
  await page.locator('[data-testid="pool-decks-toggle"]').click();
  assert(
    await waitForTestIdCount(page, 'pool-deck-count-', deckKeys.length),
    `桌面端展开卡组明细同样列出 ${deckKeys.length} 个卡组`,
  );
  const desktopOverflowOpen = await horizontalOverflow(page);
  assert(
    desktopOverflowOpen <= 1,
    `桌面端（1280px）卡组明细展开后仍没有元素把页面撑出视口（超出 ${desktopOverflowOpen}px）`,
  );
  await page.locator('[data-testid="pool-decks-toggle"]').click();
  assert(await waitForTestIdCount(page, 'pool-deck-count-', 0), '桌面端再点一次同样收起');
  const desktopOverflow = await horizontalOverflow(page);
  assert(desktopOverflow <= 1, `桌面端（1280px）没有任何元素把页面撑出视口（超出 ${desktopOverflow}px）`);
  text = await page.locator('body').innerText();
  assertI18n(text, '题库概览', 'Question bank', '桌面端题库概览卡正常渲染');

  console.log(`\n🎉 全部通过（测试账号 ${EMAIL}，密码 ${PASSWORD}）`);

  // 自清理：配置了 SMOKE_SUPABASE_ACCESS_TOKEN 时删除本次测试账号（CI 可配 SUPABASE_ACCESS_TOKEN secret）
  const mgmtToken = process.env.SMOKE_SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
  if (mgmtToken) {
    try {
      const ref = new URL(BASE).hostname.split('.')[0];
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `delete from auth.users where email like 'smoke%';` }),
      });
      console.log(res.ok ? '🧹 测试用户已自清理' : `⚠️ 自清理失败 HTTP ${res.status}`);
    } catch (e) {
      console.log('⚠️ 自清理跳过:', String(e).slice(0, 80));
    }
  } else {
    console.log('ℹ️ 未配置管理 token，测试用户需手动清理');
  }
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
