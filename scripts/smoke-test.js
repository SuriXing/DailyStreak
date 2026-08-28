#!/usr/bin/env node
/**
 * DailyStreak 浏览器冒烟测试（Playwright，无头 Chromium）
 *
 * 覆盖：登录门控 → 注册 → 打卡 → 三个 Tab 渲染 → 开始练习。
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
  assert(text.includes('登 录'), '未登录时显示登录页（路由守卫生效）');
  assert(text.includes('没有账号？去注册'), '登录页有注册入口');

  // 2. 注册并进入主界面
  await page.getByText('没有账号？去注册').click();
  const inputs = page.locator('input');
  assert((await inputs.count()) >= 3, '注册表单有三个输入框');
  await inputs.nth(0).fill('smoke');
  await inputs.nth(1).fill(EMAIL);
  await inputs.nth(2).fill(PASSWORD);
  await page.getByText('注 册').click();
  await page.waitForTimeout(7000);
  text = await page.locator('body').innerText();
  assert(text.includes('今日打卡'), '注册后进入打卡页');
  assert(!text.includes('登 录'), '注册后不再显示登录页');

  // 3. 打卡
  await page.getByText('今日打卡').click();
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assert(text.includes('今日已打卡'), '打卡成功，按钮变为已打卡');
  assert(text.includes('今日练习'), '今日练习进度卡渲染');

  // 4. 学习页
  await page.getByText('学习', { exact: true }).last().click();
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assert(text.includes('开始练习'), '学习页渲染今日练习卡');
  assert(text.includes('复习 0 道'), '新用户计划为纯新题');

  // 5. 开始答题
  await page.getByText('开始练习').click();
  await page.waitForTimeout(1500);
  text = await page.locator('body').innerText();
  assert(text.includes('第 1/5 题'), '会话开始，显示题号进度');
  assert(text.includes('小测验') || text.includes('？'), '题目渲染');

  // 6. 我的页
  await page.getByText('我的', { exact: true }).last().click();
  await page.waitForTimeout(2500);
  text = await page.locator('body').innerText();
  assert(text.includes('课程掌握度'), '我的页渲染课程掌握度');
  assert(text.includes('每日目标'), '我的页渲染每日目标');

  const consoleErrors = errors.filter((e) => !e.includes('favicon'));
  assert(consoleErrors.length === 0, `无浏览器控制台错误${consoleErrors.length ? '：' + consoleErrors[0] : ''}`);

  console.log(`\n🎉 全部通过（测试账号 ${EMAIL}，密码 ${PASSWORD}）`);
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
