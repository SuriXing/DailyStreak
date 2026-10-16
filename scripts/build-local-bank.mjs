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
 *
 * 难度是**可选**的：行尾写 `[难度 3]`（也认 `[难度：3]`、`[difficulty 3]`），取值 1-4，
 * 与内置题库的 rubric 同口径（见 docs/difficulty-rubric.md）。不写就是"没有分级"：
 * JSON 里连 difficulty 字段都不写，卡片照样能练、能翻面、能点选，只是不参与练习页的难度筛选
 * 与"由易到难/由难到易"排序——和内置题库里 564 张 AMC10 概念卡一个待遇。老文件（一个标记都没写）
 * 因此完全不受影响，解析结果与加这个功能之前逐字节相同。
 * 反过来，**标了但读不出来**（`[难度 5]`、`[难度 难]`、`[难度 ]`）会跳过这道题并把原因打出来，
 * 而不是静默当成"没标"：难度标错和有意不标是两回事，降级成没分级的话，用户会以为难度已经生效，
 * 却在界面上找不到它——跳过 + 打印至少让人当场看见。
 * 两个标记可以连写，顺序任意：`… [难度 3] [答案 B]` 与 `… [答案 B] [难度 3]` 都认。
 *
 * 测试用钩子：LOCAL_BANK_SRC / LOCAL_BANK_OUT 可以覆写输入目录与输出文件。
 * scripts/test-session-logic.mjs 的往返测试靠这两个变量在临时目录里跑生成器，
 * 否则它会把开发者本机那份 public/local-deck.json 冲掉（那份文件不在仓库里，冲掉就真没了）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.resolve(process.env.LOCAL_BANK_SRC ?? path.join(root, 'content', 'local'));
const OUT = path.resolve(process.env.LOCAL_BANK_OUT ?? path.join(root, 'public', 'local-deck.json'));

/** 行尾标记：`[答案 B]`（原有）与 `[难度 3]`（本次新增）。两个都可能出现，所以从行尾反复剥。 */
const ANSWER_TAIL = /\[\s*答案\s*[:：]?\s*([A-D])\s*\]\s*$/;
const DIFFICULTY_TAIL = /\[\s*(?:难度|difficulty)\s*[:：]?\s*(\d+)\s*\]\s*$/i;
/** 宽松版：只要行里出现过难度标记就算命中。用来发现"标了但读不出来"，不能当成"没标"。 */
const DIFFICULTY_ANY = /\[\s*(?:难度|difficulty)/i;
/** 与 content/subject-banks/difficulty.json 的 rubric 同一口径：四档，1 最简单、4 最难。 */
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 4;

const splitDot = (line) => line.split(/\s(?=[A-D]\.\s)/);
const splitSpace = (line) => line.split(/\s(?=[A-D]\s)/);

/** 提示里的路径：在仓库里写相对路径（好读），在仓库外（测试的临时目录）写绝对路径。 */
const showPath = (p) => {
  const rel = path.relative(root, p);
  return rel.startsWith('..') ? p : rel;
};

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
  console.log(`ℹ️ 没有 ${showPath(SRC_DIR)}/ 目录。想练自己的题（例如真题）时，把 markdown 放进去再跑一次。`);
  process.exit(0);
}

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.md') && !f.endsWith('-answers.md'))
  .sort();
if (!files.length) {
  console.log(`ℹ️ ${showPath(SRC_DIR)}/ 是空的，什么也没生成。`);
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
    let rawDifficulty = null;
    // 从行尾往回剥标记：题干本体里出现 "[答案 X]"、"[难度 3]" 这种字面量的可能性极低，
    // 而"标记写在选项后面"是唯一自然的写法，所以只认行尾。
    for (;;) {
      const answerTail = body.match(ANSWER_TAIL);
      if (answerTail) {
        inline = answerTail[1];
        body = body.slice(0, answerTail.index).trim();
        continue;
      }
      const difficultyTail = body.match(DIFFICULTY_TAIL);
      if (difficultyTail) {
        rawDifficulty = Number(difficultyTail[1]);
        body = body.slice(0, difficultyTail.index).trim();
        continue;
      }
      break;
    }
    if (rawDifficulty === null && DIFFICULTY_ANY.test(body)) {
      skipped.push(`${file} 第 ${num} 题（难度标记读不出来，只认 [难度 ${DIFFICULTY_MIN}-${DIFFICULTY_MAX}]）`);
      continue;
    }
    if (rawDifficulty !== null && (rawDifficulty < DIFFICULTY_MIN || rawDifficulty > DIFFICULTY_MAX)) {
      skipped.push(`${file} 第 ${num} 题（难度 ${rawDifficulty} 超出 ${DIFFICULTY_MIN}-${DIFFICULTY_MAX}）`);
      continue;
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
      // 只有标了难度才写这个字段：没标就是"没有分级"，而不是"难度 0"——
      // 0 在打包格式里是占位符，本地题库不需要一个假的 0（缺字段一样不会变成 0 档，见 flashcard-session.ts）。
      ...(rawDifficulty === null ? {} : { difficulty: rawDifficulty }),
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
const graded = cards.filter((card) => card.difficulty !== undefined).length;
console.log(
  `✅ 本地题库：${cards.length} 张 → ${showPath(OUT)}（已被 .gitignore 排除，不会进仓库或部署）`,
);
console.log(`   难度：${graded} 张带分级、${cards.length - graded} 张没有分级（没标的卡不参与难度筛选与难度排序）`);
if (skipped.length) {
  console.log(`   ⚠️ 跳过 ${skipped.length} 行：`);
  for (const s of skipped.slice(0, 10)) console.log(`   - ${s}`);
}
