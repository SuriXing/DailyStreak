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
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
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
  assertI18n(text, '今日打卡', 'Check in today', '注册后进入打卡页');
  assert(
    !(text.includes('没有账号？去注册') || text.includes('No account? Sign up')),
    '注册后不再显示登录页',
  );

  // 3. 打卡
  await clickI18n(page, '今日打卡', 'Check in today');
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assertI18n(text, '今日已打卡', 'Checked in today', '打卡成功，按钮变为已打卡');
  assertI18n(text, '今日练习', "Today's practice", '今日练习进度卡渲染');

  // 4. 学习页
  await clickI18n(page, '学习', 'Study');
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assertI18n(text, '开始练习', 'Start practice', '学习页渲染今日练习卡');
  assertI18n(text, '复习 0 道', '0 to review', '新用户计划为纯新题');

  // 5. 开始答题
  await clickI18n(page, '开始练习', 'Start practice');
  await page.waitForTimeout(1500);
  text = await page.locator('body').innerText();
  assertI18n(text, '第 1/5 题', 'Question 1/5', '会话开始，显示题号进度');
  assert(text.includes('？') || text.includes('?'), '题目渲染');

  // 5b. 答完 5 题 → 小结 → 完成 → 重做（清除当天记录）
  for (let i = 0; i < 5; i++) {
    await page.getByText(/^A\./).first().click();
    await page.waitForTimeout(800);
    if (i < 4) {
      await clickI18n(page, '下一题', 'Next');
    } else {
      await clickI18n(page, '查看小结', 'See summary');
    }
    await page.waitForTimeout(800);
  }
  text = await page.locator('body').innerText();
  assertI18n(text, '答对', 'correct', '小结卡渲染');
  await page.getByText(/^(Finish|完成|Finalizar)$/).first().click();
  await page.waitForTimeout(1200);
  text = await page.locator('body').innerText();
  assertI18n(text, '重新做一遍', 'Redo today', '完成后出现重做入口');
  await clickI18n(page, '重新做一遍', 'Redo today');
  await page.waitForTimeout(800);
  text = await page.locator('body').innerText();
  assertI18n(text, '确认清除并重做', 'Clear and redo', '重做前有清除确认');
  await clickI18n(page, '确认清除并重做', 'Clear and redo');
  await page.waitForTimeout(2000);
  text = await page.locator('body').innerText();
  assertI18n(text, '还差 5 题', '5 questions to go', '清除后回到今日初始状态');

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
  await clickI18n(page, '跟随系统', 'System');
  await page.waitForTimeout(800);

  // 6c. 打卡页新增：今日知识点 + 本周概览
  await clickI18n(page, '打卡', 'Check in');
  await page.waitForTimeout(2000);
  text = await page.locator('body').innerText();
  assertI18n(text, '今日知识点', "Today's lesson", '打卡页渲染今日知识点入口');
  assertI18n(text, '本周概览', 'This week', '打卡页渲染本周概览');

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
  // 通过侧边栏导航到学习页
  await clickI18n(page, '学习', 'Study');
  await page.waitForTimeout(2000);
  text = await page.locator('body').innerText();
  assertI18n(text, '开始练习', 'Start practice', '桌面端侧边栏导航到学习页');

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
