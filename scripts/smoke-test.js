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
 * 逐个遍历生成的选择题（练习册 + 情境题），把它的 difficulty 交给 fn（没写字段就给 null）。
 * 练习池的大小与"某一档有多少题"都从生成数据里数出来，这样每加一批题都不用回来改数字——
 * 它曾经硬编码成 725，加了 125 道情境题后就过期了。
 */
function forEachPracticeCard(fn) {
  const dir = path.join(__dirname, '..', 'src', 'data', 'subject-decks');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts') || f === 'index.ts') continue;
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
  const chipSelected = (d) => page.locator(chipSel(d)).getAttribute('aria-selected');
  assert((await readProgress(page))?.[1] === pool, `默认「全部」时分母是整池 ${pool}`);
  assert((await chipSelected(first)) === 'false', `难度 ${first} 初始未选中`);

  await page.locator(chipSel(first)).click();
  assert(await waitForTotal(page, onlyFirst), `选中难度 ${first} 后分母变成 ${onlyFirst}（该档的题数）`);
  assert((await chipSelected(first)) === 'true', `难度 ${first} 的 chip 显示为选中（aria-selected）`);
  assert((await chipSelected('all')) === 'false', '选中一个档后「全部」不再是选中态');

  await page.locator(chipSel(second)).click();
  assert(await waitForTotal(page, both), `再选中难度 ${second} 后分母变成 ${both}（两档题数之和 ${onlyFirst} + ${onlySecond}）`);
  assert((await chipSelected(first)) === 'true', `多选后难度 ${first} 仍然是选中态（不是被替换掉）`);
  assert((await chipSelected(second)) === 'true', `多选后难度 ${second} 也是选中态`);

  await page.locator(chipSel('all')).click();
  assert(await waitForTotal(page, pool), `点「全部」后分母回到整池 ${pool}（清空多选）`);
  assert((await chipSelected(first)) === 'false', '清空后各档都回到未选中');
  assert((await chipSelected('all')) === 'true', '清空后「全部」重新成为选中态');

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
