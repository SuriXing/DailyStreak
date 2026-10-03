#!/usr/bin/env node
/**
 * 把 content/local/ 里你自己放的题目打包成 public/local-deck.json。
 *
 * 为什么这样绕：卡片数据是打进 bundle 的，直接 import 会让这些题跟着站点一起发布出去。
 * 这里改成写一个静态 JSON，由 App 在运行时 fetch（src/data/local-bank.ts）。
 * content/local/ 与 public/local-deck.json 都在 .gitignore 里，所以本地真题既不在仓库里，
 * 也不会进任何一次部署。
 *
 * 用法：npm run bank:local（有题可放时先跑它，再 npm run web）
 *
 * 支持仓库里已有的两种题目格式（每个文件按行判断）：
 *   1. 41. 题干？ A. 选项 B. 选项 C. 选项 D. 选项
 *   2. 41. 题干？ A 选项 B 选项 C 选项 D 选项
 * 答案可以写在同行末尾 `[答案 B]`，也可以放在同目录的 <文件名>-answers.md 里：
 *   - 表格：|41|B|解析|
 *   - 行内：41 B（解析）;
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(root, 'content', 'local');
const OUT = path.join(root, 'public', 'local-deck.json');

const splitDot = (line) => line.split(/\s(?=[A-D]\.\s)/);
const splitSpace = (line) => line.split(/\s(?=[A-D]\s)/);

function parseAnswers(text) {
  const byNum = new Map();
  for (const line of text.split('\n')) {
    const row = line.match(/^\|\s*(\d+)\s*\|\s*([A-D])\s*\|\s*(.*?)\s*\|/);
    if (row) {
      byNum.set(Number(row[1]), { letter: row[2], brief: row[3] });
      continue;
    }
    const inline = line.match(/(\d+)\s+([A-D])（(.*?)）\s*;/g);
    if (inline) {
      for (const chunk of inline) {
        const m = chunk.match(/(\d+)\s+([A-D])（(.*?)）\s*;/);
        if (m) byNum.set(Number(m[1]), { letter: m[2], brief: m[3] });
      }
    }
  }
  return byNum;
}

if (!fs.existsSync(SRC_DIR)) {
  console.log(`ℹ️ 没有 ${path.relative(root, SRC_DIR)}/ 目录。想练自己的题（例如真题）时，把 markdown 放进去再跑一次。`);
  process.exit(0);
}

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.md') && !f.endsWith('-answers.md'))
  .sort();
if (!files.length) {
  console.log(`ℹ️ ${path.relative(root, SRC_DIR)}/ 是空的，什么也没生成。`);
  process.exit(0);
}

const cards = [];
const skipped = [];
let label = '本地题库';
for (const file of files) {
  const text = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading && label === '本地题库') label = heading[1].trim();
  const answersPath = path.join(SRC_DIR, file.replace(/\.md$/, '-answers.md'));
  const answers = fs.existsSync(answersPath) ? parseAnswers(fs.readFileSync(answersPath, 'utf8')) : new Map();
  const base = path.basename(file, '.md');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const head = line.match(/^(\d+)\.\s+(.*)$/);
    if (!head) continue;
    const num = Number(head[1]);
    let body = head[2];
    let inline = null;
    const tail = body.match(/\[\s*答案\s*[:：]?\s*([A-D])\s*\]\s*$/);
    if (tail) {
      inline = tail[1];
      body = body.slice(0, tail.index).trim();
    }
    const parts = splitDot(body).length === 5 ? splitDot(body) : splitSpace(body);
    if (parts.length !== 5) {
      skipped.push(`${file} 第 ${num} 题（只解析到 ${parts.length - 1} 个选项）`);
      continue;
    }
    const options = parts.slice(1).map((p) => p.replace(/^[A-D][.\s]\s*/, '').trim());
    const answer = (inline || (answers.get(num) || {}).letter || '').toUpperCase();
    if (!'ABCD'.includes(answer) || answer.length !== 1) {
      skipped.push(`${file} 第 ${num} 题（找不到答案）`);
      continue;
    }
    const idx = answer.charCodeAt(0) - 65;
    const brief = (answers.get(num) || {}).brief || '';
    cards.push({
      id: `local-${base}-${String(num).padStart(3, '0')}`,
      deck: 'local',
      category: '本地题库',
      front: `${parts[0].trim()}\n${options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}`,
      back: `答案：${answer}\n${brief ? `简析：${brief}\n` : ''}\n正确选项：${options[idx]}`.replace(/\n{3,}/g, '\n\n'),
      source: 'local-exam',
      verified: false,
    });
  }
}

if (!cards.length) {
  console.log('⚠️ 没有解析出任何题目。检查一下格式（每个文件开头可以写一行 # 标题作为卡组名）。');
  for (const s of skipped.slice(0, 10)) console.log(`   - ${s}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ label, generatedAt: new Date().toISOString(), cards }, null, 1)}\n`);
console.log(`✅ 本地题库：${cards.length} 张 → ${path.relative(root, OUT)}（已被 .gitignore 排除，不会进仓库或部署）`);
if (skipped.length) {
  console.log(`   ⚠️ 跳过 ${skipped.length} 行：`);
  for (const s of skipped.slice(0, 10)) console.log(`   - ${s}`);
}
