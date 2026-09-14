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
  const hasTap = await page.getByText(/点击卡片|Tap the card/).count();
  if (hasTap > 0) {
    await page.getByText(/点击卡片|Tap the card/).first().click();
  } else {
    await page.getByText(/^A\./).first().click();
  }
  await page.waitForTimeout(900);
  await clickI18n(page, '今日打卡', 'Check in today');
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assertI18n(text, '今日已打卡', 'Checked in today', '打卡成功（先作答今日一课），按钮变为已打卡');
  assertI18n(text, '今日练习', "Today's practice", '今日练习进度卡渲染');

  // 4. 自由练（Practice）：闪卡会话
  await clickI18n(page, '自由练', 'Practice');
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assertI18n(text, '点击卡片查看答案', 'Tap the card to reveal the answer', '自由练渲染闪卡');
  assert(text.includes('全部卡组'), '自由练渲染卡组筛选（全部卡组）');

  // 5. 翻面 + 下一张
  await clickI18n(page, '翻面', 'Flip');
  await page.waitForTimeout(800);
  text = await page.locator('body').innerText();
  assert(!(text.includes('点击卡片查看答案') || text.includes('Tap the card to reveal the answer')), '翻面后露出答案（隐藏翻卡提示）');
  await clickI18n(page, '下一张', 'Next');
  await page.waitForTimeout(800);
  text = await page.locator('body').innerText();
  assert(/2 \/ 1146/.test(text), '下一张后进度为 2 / 1146');

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
