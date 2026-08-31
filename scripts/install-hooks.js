#!/usr/bin/env node
/**
 * 把 git 钩子（pre-commit / pre-push）安装到 .git/hooks
 * （package.json 的 prepare 阶段自动执行，幂等）。
 * 非 git 环境（如 CI 的导出副本）直接跳过。
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gitDir = path.join(root, '.git');
if (!fs.existsSync(gitDir)) {
  console.log('[hooks] .git 不存在，跳过钩子安装');
  process.exit(0);
}

const hooks = ['pre-commit', 'pre-push'];
const hooksDir = path.join(gitDir, 'hooks');
fs.mkdirSync(hooksDir, { recursive: true });
for (const hook of hooks) {
  const target = path.join(hooksDir, hook);
  fs.copyFileSync(path.join(root, 'scripts', 'hooks', hook), target);
  fs.chmodSync(target, 0o755);
}
console.log(`[hooks] 已安装：${hooks.join('、')}（--no-verify 可跳过）`);
