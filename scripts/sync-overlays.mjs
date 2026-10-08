#!/usr/bin/env node
/**
 * 把英文覆盖层对齐到当前中文卡片。
 *
 * 覆盖层是"中文卡 + 英文 front/back + src（中文正文的短哈希）"，它不复制中文，只声明
 * 自己对应哪一版中文。于是中文一改，覆盖层就有两件事要跟着动：
 *
 *  1. src —— 重新算哈希。这是机械的。
 *  2. 选项顺序 —— 生成脚本会给部分卡片轮转选项（把正确项打散到 A/B/C/D）；卡片顺序一变，
 *     覆盖层里的英文选项行必须按同一置换重排，否则英文卡自己内部就错位了。
 *     附带的好处是：英文简析里的 A/B/C/D 引用是从中文源答案抄来的，重排回源顺序之后
 *     这些引用才真正指向它说的那个选项。
 *
 * 这个脚本**只做位移和哈希**，不碰任何英文句子：一句英文该怎么改是人的判断。
 * 用法：
 *   node scripts/sync-overlays.mjs --check        # 只报告差异，不写文件（CI 用）
 *   node scripts/sync-overlays.mjs --write        # 写入
 *   node scripts/sync-overlays.mjs --write --from=HEAD^   # 以某个 git 版本的中文卡为基准算置换
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const write = args.includes('--write');
const from = (args.find((a) => a.startsWith('--from=')) || '').slice('--from='.length) || 'HEAD';

const DECKS = ['csa', 'csp', 'precalc', 'calcbc', 'stats'];
/** 少数卡的数字指纹不足以自动对齐（选项里是同一批数字），用显式置换补上。 */
const ORDER_OVERRIDES = JSON.parse(
  readFileSync(path.join(root, 'scripts/overlay-order-overrides.json'), 'utf8'),
);
const OVERLAY_FILES = [
  'src/data/flashcard-i18n.ts',
  'src/data/flashcard-i18n-drill.ts',
  'src/data/flashcard-i18n-scenario.ts',
];

const sha1Text = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12);
const srcOf = (front, back) => sha1Text(`${front}\u0000${back}`);

/** 从生成模块里读卡片：一行一张，字段是 JSON 字面量。 */
function readCards(text) {
  const out = new Map();
  const re =
    /\{ id: ("[^"]+")(?:, level: "[a-z]+")?, deck: "[^"]+", category: "[^"]+"(?:, difficulty: \d+)?, front: ("(?:\\.|[^"\\])*"), back: ("(?:\\.|[^"\\])*"), source: "[^"]+", verified: (?:true|false) \}/g;
  for (const m of text.matchAll(re)) {
    out.set(JSON.parse(m[1]), { front: JSON.parse(m[2]), back: JSON.parse(m[3]) });
  }
  return out;
}

function cardsFromGit(ref, rel) {
  try {
    return readCards(execFileSync('git', ['show', `${ref}:${rel}`], { cwd: root, encoding: 'utf8' }));
  } catch {
    return new Map();
  }
}

/** 覆盖层文件里一行一条：  "id": { front: "...", back: "...", src: "..." }, */
function parseOverlay(text) {
  const entries = new Map();
  const re = /^(\s*)(?:("([^"]+)": \{ front: ("(?:\\.|[^"\\])*"), back: ("(?:\\.|[^"\\])*"), src: "([0-9a-f]{12})" \},)|('([^']+)': \{ front: ('(?:\\.|[^'\\])*'), back: ('(?:\\.|[^'\\])*'), src: '([0-9a-f]{12})' \},))$/gm;
  for (const m of text.matchAll(re)) {
    if (m[3]) {
      entries.set(m[3], {
        quote: '"',
        front: JSON.parse(m[4]),
        back: JSON.parse(m[5]),
        src: m[6],
        raw: m[2],
      });
    } else {
      // 单引号写法（概念卡覆盖层）：把 JS 单引号字符串还原成普通字符串。
      const un = (s) => s.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      entries.set(m[8], { quote: "'", front: un(m[9]), back: un(m[10]), src: m[11], raw: m[7] });
    }
  }
  return entries;
}

const optionLines = (front) => front.split('\n').filter((l) => /^[A-D]\. /.test(l));
const answerLetter = (back, label) => {
  const m = back.match(label === 'en' ? /^Answer:\s*([A-D])/m : /答案：([A-D])/);
  return m ? m[1] : null;
};

const report = { srcUpdated: 0, reordered: 0, skipped: [], letterMismatch: [] };

for (const rel of OVERLAY_FILES) {
  const abs = path.join(root, rel);
  let text = readFileSync(abs, 'utf8');
  const entries = parseOverlay(text);
  if (!entries.size) {
    console.error(`⚠️ ${rel}: 没解析出条目（格式变了？）`);
    continue;
  }
  // 中文卡：当前（工作区）与基准（git 版本）两个顺序。
  const now = new Map();
  const before = new Map();
  for (const deck of DECKS.flatMap((d) => [d, `${d}-scenario`])) {
    const p = `src/data/subject-decks/${deck}.ts`;
    for (const [id, c] of readCards(readFileSync(path.join(root, p), 'utf8'))) now.set(id, c);
    for (const [id, c] of cardsFromGit(from, p)) before.set(id, c);
  }
  // AMC10 概念卡不轮转、也不在这里改，但同样要对齐 src。
  for (const [id, c] of readCards(readFileSync(path.join(root, 'src/data/amc10-flashcards.ts'), 'utf8'))) {
    now.set(id, c);
    before.set(id, c);
  }

  let touched = 0;
  for (const [id, en] of entries) {
    const zh = now.get(id);
    if (!zh) {
      report.skipped.push(`${id}（覆盖层里有、卡片里没有）`);
      continue;
    }
    const want = srcOf(zh.front, zh.back);
    const old = before.get(id);
    const zhNow = optionLines(zh.front);
    const zhOld = old ? optionLines(old.front) : zhNow;
    const enOpts = optionLines(en.front);
    let front = en.front;
    let back = en.back;

    // 对齐英文选项与中文选项的顺序。
    // 做法是"按指纹重新对齐"而不是"套一次置换"：置换必须相对某个基准版本，而覆盖层没记录
    // 自己对应哪一版顺序，于是同一个置换跑两次会把英文顺序再转回去（真的发生过）。
    // 指纹用每行里的数字——数字在两种语言里是同一串字符——把英文行按指纹对应到中文行。
    // 指纹不唯一或对不上就跳过，交给人处理，绝不猜。
    const sig = (line) => (line.match(/\d+(?:\.\d+)?/g) || []).sort().join(',');
    const zhSig = zhNow.map(sig);
    const enSig = enOpts.map(sig);
    const override = ORDER_OVERRIDES[id];
    // 显式置换：只有在"换了之后逐字母指纹才对上、而现在对不上"时才应用，因此可以重复运行。
    if (
      Array.isArray(override) &&
      override.length === 4 &&
      zhNow.length === 4 &&
      enOpts.length === 4 &&
      zhSig.every(Boolean) &&
      enSig.every(Boolean) &&
      zhSig.join('|') !== enSig.join('|') &&
      override.map((i) => enSig[i]).join('|') === zhSig.join('|')
    ) {
      const permuted = override.map((i, k) => `${'ABCD'[k]}. ${enOpts[i].slice(3)}`);
      const head = en.front.split('\n').filter((l) => !/^[A-D]\. /.test(l));
      const zhAns = answerLetter(zh.back, 'zh');
      const zhIdx = 'ABCD'.indexOf(zhAns);
      front = [...head, ...permuted].join('\n');
      back = en.back
        .replace(/^Answer:\s*[A-D]/m, `Answer: ${zhAns}`)
        .replace(/\n\nCorrect option:\s*[\s\S]+$/, `\n\nCorrect option: ${permuted[zhIdx].slice(3)}`);
      report.reordered += 1;
    }
    const alignable =
      zhNow.length === 4 &&
      enOpts.length === 4 &&
      zhSig.every(Boolean) &&
      enSig.every(Boolean) &&
      zhSig.slice().sort().join('|') === enSig.slice().sort().join('|') &&
      new Set(zhSig).size === 4;
    if (alignable) {
      const newEn = zhSig.map((s) => `${'ABCD'[zhSig.indexOf(s)]}. ${enOpts[enSig.indexOf(s)].slice(3)}`);
      const head = en.front.split('\n').filter((l) => !/^[A-D]\. /.test(l));
      const zhAns = answerLetter(zh.back, 'zh');
      const zhIdx = 'ABCD'.indexOf(zhAns);
      const rebuiltFront = [...head, ...newEn].join('\n');
      const rebuiltBack = en.back
        .replace(/^Answer:\s*[A-D]/m, `Answer: ${zhAns}`)
        .replace(/\n\nCorrect option:\s*[\s\S]+$/, `\n\nCorrect option: ${newEn[zhIdx].slice(3)}`);
      if (rebuiltFront !== en.front || rebuiltBack !== en.back) report.reordered += 1;
      front = rebuiltFront;
      back = rebuiltBack;
    } else if (zhSig.some(Boolean) && enSig.some(Boolean)) {
      // 两边都有数字却对不上，才是真的可疑；纯文字选项（没有数字）不算问题。
      report.skipped.push(`${id}（中文与英文选项里的数字对不上，需人工核对）`);
    }
    if (answerLetter(back, 'en') !== answerLetter(zh.back, 'zh') && enOpts.length === 4) {
      // 顺序没变但答案字母对不上：只可能是中文答案变了，英文答案跟着走。
      const zhAns = answerLetter(zh.back, 'zh');
      const zhIdx = 'ABCD'.indexOf(zhAns);
      back = en.back
        .replace(/^Answer:\s*[A-D]/m, `Answer: ${zhAns}`)
        .replace(/\n\nCorrect option:\s*[\s\S]+$/, `\n\nCorrect option: ${enOpts[zhIdx].slice(3)}`);
    }

    // 这里**不**做"中英文简析提到的字母是否一致"的检查：英文里 "A cast truncates toward zero"
    // 的 A 是冠词，正则分不清它和选项字母，这种检查只会制造假警报。
    if (front !== en.front || back !== en.back || want !== en.src) {
      touched += 1;
    }
    if (front !== en.front) {
      // 按行整体替换，保持文件里其它内容一个字不动。
      const nl = en.raw;
      const rebuilt =
        nl.slice(0, nl.indexOf('front: ')) +
        `front: ${JSON.stringify(front)}, back: ${JSON.stringify(back)}, src: "${want}" },`;
      text = text.replace(nl, rebuilt);
    } else if (back !== en.back || want !== en.src) {
      const nl = en.raw;
      const tail = `back: ${JSON.stringify(back)}, src: "${want}" },`;
      const rebuilt = nl.slice(0, nl.indexOf('back: ')) + tail;
      text = text.replace(nl, rebuilt);
    }
    if (want !== en.src) report.srcUpdated += 1;
  }

  if (touched > 0 && write) writeFileSync(abs, text);
  console.log(`${rel}: 需要更新 ${touched} 条${write && touched ? '（已写入）' : '（--check 模式，未写入）'}`);
}

console.log(`\nsrc 需要重算：${report.srcUpdated} 条；选项顺序需重排：${report.reordered} 条`);
if (report.letterMismatch.length) {
  console.log(`\n中英文简析提到的字母不一致（${report.letterMismatch.length} 条）：`);
  for (const s of report.letterMismatch.slice(0, 20)) console.log('  - ' + s);
}
if (report.skipped.length) {
  console.log(`\n跳过（${report.skipped.length} 条）：`);
  for (const s of report.skipped.slice(0, 20)) console.log('  - ' + s);
}
if (!write && (report.srcUpdated || report.reordered)) process.exitCode = 1;
