#!/usr/bin/env node
/**
 * 把 pre-commit 钩子安装到 .git/hooks（package.json 的 prepare 阶段自动执行，幂等）。
 * 非 git 环境（如 CI 的导出副本）直接跳过。
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gitDir = path.join(root, '.git');
if (!fs.existsSync(gitDir)) {
  console.log('[hooks] .git 不存在，跳过 pre-commit 安装');
  process.exit(0);
}

const hooksDir = path.join(gitDir, 'hooks');
fs.mkdirSync(hooksDir, { recursive: true });
const target = path.join(hooksDir, 'pre-commit');
fs.copyFileSync(path.join(root, 'scripts', 'hooks', 'pre-commit'), target);
fs.chmodSync(target, 0o755);
console.log('[hooks] pre-commit 已安装（运行 npm run precheck；--no-verify 可跳过）');
