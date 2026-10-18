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

function expectedPracticePool() {
  let n = 0;
  forEachPracticeCard(() => {
    n += 1;
  });
  // 本机若生成了本地题库（content/local/ + npm run bank:local），它也会出现在练习池里
  const local = path.join(__dirname, '..', 'public', 'local-deck.json');
  if (fs.existsSync(local)) {
    try {
      const cards = JSON.parse(fs.readFileSync(local, 'utf8')).cards;
      if (Array.isArray(cards)) n += cards.length;
    } catch {
      // 读不动就按没有处理
    }
  }
  return n;
}

/** UI 上会出现哪些难度档（0 是"没有分级"的占位，界面上不算一档）。 */
function expectedDifficulties() {
  const seen = new Set();
  forEachPracticeCard((d) => {
    if (d) seen.add(d);
  });
  return [...seen].sort((a, b) => a - b);
}

/**
 * 难度多选后的池子大小 = 练习池里 difficulty 落在选中集合里的题数。
 * 和 expectedPracticePool 一样从生成数据算，不写死数字；本地题库的卡没有 difficulty 字段，
 * 所以选中任何一档时它们都会被滤掉（这点与 filterCards 的语义一致）。
 */
function expectedDifficultyPool(selected) {
  let n = 0;
  forEachPracticeCard((d) => {
    if (d !== null && selected.includes(d)) n += 1;
  });
  return n;
}

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

/** 轮询等进度分母变成期望值（不用固定 sleep，等到了就返回 true）。 */
async function waitForTotal(page, expected, tries = 24) {
  for (let i = 0; i < tries; i += 1) {
    const progress = await readProgress(page);
    if (progress && progress[1] === expected) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** 轮询等进度分子/分母都变成期望值（切换筛选或顺序后会话重开，等它自己到位）。 */
async function waitForProgress(page, current, total, tries = 24) {
  for (let i = 0; i < tries; i += 1) {
    const progress = await readProgress(page);
    if (progress && progress[0] === current && progress[1] === total) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** 卡片上的难度标签（testID=card-difficulty）：只有真的带分级的卡才该有，个数按期望等。 */
const cardDifficulty = (page) => page.locator('[data-testid="card-difficulty"]');

async function waitForCardDifficulty(page, expected, tries = 24) {
  for (let i = 0; i < tries; i += 1) {
    if ((await cardDifficulty(page).count()) === expected) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** 当前这张卡上的难度档（没有标签就返回 null），文案兼容「难度 3 / Level 3 / Nivel 3」。 */
async function currentCardDifficulty(page) {
  if ((await cardDifficulty(page).count()) === 0) return null;
  const m = (await cardDifficulty(page).first().innerText()).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 轮询等"当前这张卡的难度"变成期望档：排序切换后卡片是重渲染出来的，不睡固定时长。 */
async function waitForCurrentCardDifficulty(page, expected, tries = 24) {
  for (let i = 0; i < tries; i += 1) {
    if ((await currentCardDifficulty(page)) === expected) return true;
    await page.waitForTimeout(250);
  }
  return false;
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
  for (let i = 0; i < tries; i += 1) {
    if ((await readTestIdNumber(page, testID)) === expected) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** 数一数某个前缀的 testID 有几个（卡组明细展开/收起时用）。 */
const countTestIds = (page, prefix) => page.locator(`[data-testid^="${prefix}"]`).count();

/** 轮询等某个前缀的 testID 个数变成期望值，返回是否等到。 */
async function waitForTestIdCount(page, prefix, expected, tries = 24) {
  for (let i = 0; i < tries; i += 1) {
    if ((await countTestIds(page, prefix)) === expected) return true;
    await page.waitForTimeout(250);
  }
  return false;
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

/** 文本里有没有中文或英文的某个说法（与 assertI18n 同口径，只是返回布尔、不抛错）。 */
const hasI18n = (text, zh, en) => text.includes(zh) || text.toLowerCase().includes(en.toLowerCase());

/** 轮询等某个 chip 的 aria-checked 变成期望值（切换后重渲染是异步的，不睡固定时长）。 */
async function waitForChipChecked(page, testID, expected, tries = 24) {
  for (let i = 0; i < tries; i += 1) {
    const chip = await chipA11y(page, testID);
    if (chip && chip.checked === expected) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** 轮询等某个 testID 的元素出现（换卡组会让整行 chip 换掉，等它渲染出来再断言）。 */
async function waitForChip(page, testID, tries = 24) {
  for (let i = 0; i < tries; i += 1) {
    if ((await page.locator(`[data-testid="${testID}"]`).count()) > 0) return true;
    await page.waitForTimeout(250);
  }
  return false;
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
  await page.waitForTimeout(4000);
  let text = await page.locator('body').innerText();
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
  await page.waitForTimeout(7000);
  text = await page.locator('body').innerText();
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
  await page.waitForTimeout(600);

  // 打卡：点完轮询等状态变化，而不是睡一个固定时长
  await clickI18n(page, '今日打卡', 'Check in today');
  let checkedIn = false;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(1000);
    const t = await page.locator('body').innerText();
    if (t.includes('今日已打卡') || t.includes('Checked in today')) {
      checkedIn = true;
      break;
    }
  }
  assert(checkedIn, '打卡成功（先作答今日一课），按钮变为已打卡（今日已打卡 / Checked in today）');
  text = await page.locator('body').innerText();
  assertI18n(text, '今日练习', "Today's practice", '今日练习进度卡渲染');

  // 4. 自由练（Practice）：默认应为选择题卡（默认只练选择题，不再一进来就是概念词条）
  await clickI18n(page, '自由练', 'Practice');
  await page.waitForTimeout(2500);
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
  const pool = expectedPracticePool();
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
  await clickI18n(page, '下一张', 'Next');
  await page.waitForTimeout(800);
  text = await page.locator('body').innerText();
  assert(new RegExp(`2 / ${pool}`).test(text), `下一张后进度为 2 / ${pool}（练习册 + 情境题的题量，从生成数据算出）`);
  await clickI18n(page, '概念卡', 'Concept cards');
  await page.waitForTimeout(800);
  text = await page.locator('body').innerText();
  assertI18n(text, '点击卡片查看答案', 'Tap the card to reveal the answer', '切到概念卡后走翻面模式');
  await clickI18n(page, '翻面', 'Flip');
  await page.waitForTimeout(800);
  text = await page.locator('body').innerText();
  assert(!(text.includes('点击卡片查看答案') || text.includes('Tap the card to reveal the answer')), '翻面后露出答案（隐藏翻卡提示）');

  // 6. 我的页
  await clickI18n(page, '我的', 'Me');
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assertI18n(text, '课程掌握度', 'Course mastery', '我的页渲染课程掌握度');
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
  const gradePool = (d) => expectedDifficultyPool([d]);
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

  // 卡组明细：默认收起（不把这一页撑长），展开后逐个卡组与生成数据比对，再收起
  assert((await countTestIds(page, 'pool-deck-count-')) === 0, '卡组明细默认收起（页面上没有 15 行卡组）');
  await page.locator('[data-testid="pool-decks-toggle"]').click();
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

  // 移动端视口（390px）下不横向溢出：展开过的卡组行收起后也不该剩下一根被撑出去的横条
  const mobileOverflow = await horizontalOverflow(page);
  assert(mobileOverflow <= 1, `移动端（390px）没有任何元素把页面撑出视口（超出 ${mobileOverflow}px）`);

  // 6b. 主题切换：点「暗色」后页面背景应变黑，切回后恢复
  const bgBefore = await page.evaluate(() =>
    [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).backgroundColor === 'rgb(245, 245, 245)'),
  );
  await clickI18n(page, '暗色', 'Dark');
  await page.waitForTimeout(1200);
  const darkApplied = await page.evaluate(() =>
    [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).backgroundColor === 'rgb(0, 0, 0)'),
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
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assertI18n(text, '今日知识点', "Today's lesson", '今日页渲染今日一课');
  assertI18n(text, '本周概览', 'This week', '今日页渲染本周概览');

  const consoleErrors = errors.filter((e) => !e.includes('favicon'));
  assert(consoleErrors.length === 0, `无浏览器控制台错误${consoleErrors.length ? '：' + consoleErrors[0] : ''}`);

  // 7. 桌面端（≥900px）：侧边栏布局 + 导航
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(2000);
  text = await page.locator('body').innerText();
  assertI18n(text, '每日学习打卡', 'Daily study habit', '桌面端显示侧边栏品牌');
  assertI18n(text, '退出登录', 'Sign out', '桌面端侧边栏有退出入口');
  const tabBarVisible = await page.getByText(/打卡|Check in/).first().isVisible();
  // 桌面端应隐藏底部 Tab 栏（侧边栏的"打卡"在左边，底部栏的"打卡"不应可见）
  const flameIcons = await page.locator('[class*="tabBar"]').count();
  assert(flameIcons === 0 || !tabBarVisible, '桌面端隐藏底部 Tab 栏');
  // 侧边栏导航项应包含 今日 / 自由练 / 我的（无需点击，避免 dark 全屏层与深链抖动）
  assert(/(Today|今日)[\s\S]*(Practice|自由练)[\s\S]*(Me|我的)/.test(text), '桌面端侧边栏含 今日 / 自由练 / 我的');

  // 7b. 桌面视口下的题库概览：宽屏有左侧边栏、卡片 maxWidth 760，数字与移动端一致才算"两种视口没有差异"。
  //     这里不能像 6c 那样直接 goto '/profile'：整套布局挂在 Stack.Protected 里，
  //     带路径的整页加载会被路由守卫重置回首页（实测 goto '/profile' 后 URL 变成 '/'、
  //     且停在今日页），所以改成点侧边栏的「我的」做客户端跳转——探针验证过暗色下这一下点得动。
  await clickI18n(page, '我的', 'Me');
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
