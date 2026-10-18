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
 *
 * 对齐靠"选项行里的数字"这个语言无关的指纹。它的能力边界必须说清，而且**要分类报**：
 * 把判定不了的卡混成一句"跳过（N 条）"，读的人拿不到任何线索，也就没法据此干活（2026-10-17 改）。
 * 每一类要做什么事完全不同：
 *  - 可判定：指纹唯一、两侧多重集一致。脚本能**证明**英文顺序与中文一致，不一致就转正；
 *  - 顺序已一致（指纹序列逐位相同）：指纹重复或某行没有数字，够不上"证明"，但每一行读到的数字
 *    都落在同一个位置，说明顺序本来就是对的——视为通过，不再当问题报；
 *  - 需人读：两侧都有数字、多重集却真对不上。这是机器唯一能给出"有问题"证据的一类，
 *    也是真正可操作的工作队列，脚本逐张列 id；
 *  - 某侧无数字：至少一侧的四个选项里一个数字都没有。指纹没有信息，机器既不能证明一致、
 *    也不能报警。这类**不是"已通过"，只是"量不出来"**，别把它读成绿灯。
 *  - 上标与负号必须先归一化，否则 `10⁻⁶` 与 `10⁻²` 都会被读成 "10"，指纹重复导致整张卡被跳过。
 *    csp-125 就是这样漏掉的：中文 A 是 10⁻⁶（正确答案），英文 A 却是 3×10⁻²，
 *    英文读者看到的答案指向干扰项，而门禁只校验英文自洽、看不出两种语言的顺序错位。
 *    （2026-10-14 修好指纹并转正该卡。2026-10-17 实测：898 张带选项的卡里可判定 597 张
 *    ＝指纹唯一 278 + 逐位相同 319，需人读 20 张，某侧无数字 281 张。）
 * 用法：
 *   node scripts/sync-overlays.mjs --check        # 只报告差异，不写文件（`npm run check:overlays`：precheck 与 CI 都跑）
 *   node scripts/sync-overlays.mjs --write        # 写入
 *   node scripts/sync-overlays.mjs --write --from=HEAD^   # 以某个 git 版本的中文卡为基准算置换
 *
 * 退出码就是门禁契约（2026-10-19 接进 precheck 与 CI，动这段之前先读这里）：
 *   `--check` **只**在 `src 需要重算 > 0` 或 `选项顺序需重排 > 0` 时 exit 1，并逐张列出 id。
 *   这两项是同一个意思——"有人改了中文卡，却没跑 --write"——一次本地命令就能修好，
 *   所以适合做红灯；它们是**需要动手却没动手**的状态。
 *   另外三张清单（可判定 / 需人读 / 某侧无数字）**永不进退出码**：需人读 20 张、某侧无数字
 *   281 张都是**记录**（人读的结论写在 README 的保证表里），把它们做成红灯只会让门禁每天红、
 *   然后所有人学会忽略它。也正因为这样，这里**不**再加 `--strict` / `--ci` 之类的第二个模式：
 *   一个脚本两种退出条件，迟早出现"本地红、CI 绿、谁也说不出为什么"。
 *
 * 与 `check-flashcards` 的分工（两条检查都会因为 src 漂移而红，是有意的重叠）：
 *   - `check-flashcards`（`checkFlashcardOverlay`）按 id 逐张重算哈希、比对英文答案字母与
 *     `Correct option` 文本——**每种语言只跟它自己比**，所以英文选项整体被换位时它是绿的
 *     （`Answer: A` 和 `Correct option` 会一起指错、互相作证，csp-126 就是这样漏了五张卡）。
 *   - 本脚本用语言无关的数字指纹比较**中英两侧**的顺序，这是唯一能看见"英文顺序与中文不一致"
 *     的地方；它的 src 计数与上面那条重叠，但它是"有修复手段"的那一侧（--write）。
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

/**
 * 判定不了时**不能混成一堆**：三类要做的事完全不同，所以要分开记、分开打。
 * 分类完全按下面 `alignable` 的真实判据走（它要求四个选项、两侧每个选项都有数字、
 * 多重集一致、且四个指纹互不相同）：
 *   orderAgrees    两侧指纹序列逐位相同 → 顺序已经和中文一致，视为通过，不需要动作；
 *   needsHuman     两侧都有数字却对不上 → 多重集真的不一致，机器只有这一类能报警，必须逐张人读；
 *   bySideNoDigits 至少一侧四个选项一个数字都没有 → 指纹没有信息，机器判不了（不是通过）。
 * 这里的 `aligned` 是能证明一致的张数，与 orderAgrees / needsHuman / bySideNoDigits 合起来
 * 就是全部带选项的卡（概念卡没有选项行、不计入，与改前一致）。
 */
const report = {
  srcUpdated: 0,
  reordered: 0,
  /** 上面两项的卡 id：门禁红的时候要能点名，光给个数字没法下手。 */
  srcUpdatedIds: [],
  reorderedIds: [],
  aligned: 0,
  orphaned: [],
  orderAgrees: [],
  needsHuman: [],
  bySideNoDigits: [],
  /** 为什么这一桶够不上"证明"（互斥，三项之和 = orderAgrees.length）。 */
  orderAgreesWhy: { dup: 0, blank: 0, both: 0 },
  /** 哪一侧没有数字（两项之和 = bySideNoDigits.length）。 */
  noDigitsWhy: { bothSides: 0, oneSide: 0 },
  letterMismatch: [],
};

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
      report.orphaned.push(`${id}（覆盖层里有、卡片里没有）`);
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
    // 指纹里的数字要先把上标与负号归一化：`10⁻⁶` 与 `10⁻²` 如果不还原上标，都会被读成 "10"，
    // 两条指纹相同 → 这张卡被判定为"无法自动对齐"而跳过，错位就永远没人发现（csp-125 就是这样漏掉的）。
    const SUP = { '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9', '\u207b': '-', '\u207a': '+' };
    const normalizeNumbers = (s) =>
      s.replace(/[\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207b\u207a]/g, (c) => SUP[c]).replace(/\u2212/g, '-');
    const sig = (line) =>
      (normalizeNumbers(line).match(/-?\d+(?:\.\d+)?/g) || []).map(Number).sort((a, b) => a - b).join(',');
    const zhSig = zhNow.map(sig);
    const enSig = enOpts.map(sig);
    const override = ORDER_OVERRIDES[id];
    // 显式置换过的卡，顺序是"按表定的"而不是"指纹证出来的"，下面分类时要按前者算。
    let orderedByOverride = false;
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
      report.reorderedIds.push(id);
      orderedByOverride = true;
    }
    const alignable =
      zhNow.length === 4 &&
      enOpts.length === 4 &&
      zhSig.every(Boolean) &&
      enSig.every(Boolean) &&
      zhSig.slice().sort().join('|') === enSig.slice().sort().join('|') &&
      new Set(zhSig).size === 4;
    if (alignable) {
      report.aligned += 1;
      const newEn = zhSig.map((s) => `${'ABCD'[zhSig.indexOf(s)]}. ${enOpts[enSig.indexOf(s)].slice(3)}`);
      const head = en.front.split('\n').filter((l) => !/^[A-D]\. /.test(l));
      const zhAns = answerLetter(zh.back, 'zh');
      const zhIdx = 'ABCD'.indexOf(zhAns);
      const rebuiltFront = [...head, ...newEn].join('\n');
      const rebuiltBack = en.back
        .replace(/^Answer:\s*[A-D]/m, `Answer: ${zhAns}`)
        .replace(/\n\nCorrect option:\s*[\s\S]+$/, `\n\nCorrect option: ${newEn[zhIdx].slice(3)}`);
      if (rebuiltFront !== en.front || rebuiltBack !== en.back) {
        report.reordered += 1;
        report.reorderedIds.push(id);
      }
      front = rebuiltFront;
      back = rebuiltBack;
    } else if (zhSig.some(Boolean) && enSig.some(Boolean)) {
      // 两侧都至少有一个选项带数字，但指纹没能证明顺序。这里必须再分两种，因为要做的事不同：
      if (orderedByOverride || zhSig.join('|') === enSig.join('|')) {
        // 每一行读到的数字都落在同一个位置：英文顺序本来就和中文一致，不需要动作。
        // （被显式置换过的卡按置换表定序，置换的前提就是"换完逐字母对上"，同属这一类。）
        report.orderAgrees.push(id);
        const dup = new Set(zhSig).size < 4;
        const blank = zhSig.some((s) => !s) || enSig.some((s) => !s);
        if (dup && blank) report.orderAgreesWhy.both += 1;
        else if (dup) report.orderAgreesWhy.dup += 1;
        else report.orderAgreesWhy.blank += 1;
      } else {
        // 多重集真的对不上：机器唯一能给出"有问题"证据的一类，逐张人读。
        report.needsHuman.push(id);
      }
    } else if (zhNow.length === 4 && enOpts.length === 4) {
      // 至少一侧的四个选项里一个数字都没有，指纹没有信息可用，机器判不了。
      // 改前这类是**静默丢掉**的：读的人以为"没报就是没问题"，其实是从没量过。
      report.bySideNoDigits.push(id);
      if (!zhSig.some(Boolean) && !enSig.some(Boolean)) report.noDigitsWhy.bothSides += 1;
      else report.noDigitsWhy.oneSide += 1;
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
    if (want !== en.src) {
      report.srcUpdated += 1;
      report.srcUpdatedIds.push(id);
    }
  }

  if (touched > 0 && write) writeFileSync(abs, text);
  console.log(`${rel}: 需要更新 ${touched} 条${write && touched ? '（已写入）' : '（--check 模式，未写入）'}`);
}

/**
 * 需要动手的部分先说，而且点名到卡：这两项决定退出码，是三张记录清单之外唯一能当门禁的东西。
 * （printIds 在这里之前定义，因为本段和末尾的能力报告都要用它。）
 */
const printIds = (ids) => {
  const line = [];
  for (const id of ids) {
    line.push(id);
    if (line.length === 12) {
      console.log('      ' + line.join(' '));
      line.length = 0;
    }
  }
  if (line.length) console.log('      ' + line.join(' '));
};

console.log(`\nsrc 需要重算：${report.srcUpdated} 条；选项顺序需重排：${report.reordered} 条`);
if (report.srcUpdatedIds.length) {
  console.log(`  中文改过、覆盖层没跟上（--write 会重算 src）：`);
  printIds(report.srcUpdatedIds);
}
if (report.reorderedIds.length) {
  console.log(`  英文选项顺序与中文不一致（--write 会按指纹重排）：`);
  printIds(report.reorderedIds);
}
if (report.letterMismatch.length) {
  console.log(`\n中英文简析提到的字母不一致（${report.letterMismatch.length} 条）：`);
  for (const s of report.letterMismatch.slice(0, 20)) console.log('  - ' + s);
}
if (report.orphaned.length) {
  console.log(`\n孤立 id（覆盖层里有、卡片里没有，${report.orphaned.length} 条）：`);
  for (const s of report.orphaned) console.log('  - ' + s);
}

/**
 * 指纹的能力报告：分类列清单，别混成一句"跳过（N 条）"。
 * id 列表由上面的 printIds 折行输出——需要一个不漏地人读时，这份清单就是入口。
 */
const decidable = report.aligned + report.orderAgrees.length;
const optionCards = decidable + report.needsHuman.length + report.bySideNoDigits.length;
console.log(`\n── 指纹的能力报告（${optionCards} 张带选项的卡；概念卡没有选项行、不在这个口径里）──`);
console.log(`  可判定，不需要人看：${decidable} 张`);
console.log(`    指纹唯一且两侧多重集一致（能证明顺序）：${report.aligned} 张`);
console.log(
  `    指纹序列逐位相同（顺序本来就一致，视为通过）：${report.orderAgrees.length} 张` +
    `（其中只有指纹重复 ${report.orderAgreesWhy.dup} 张、只有某行没数字 ${report.orderAgreesWhy.blank} 张、两者都有 ${report.orderAgreesWhy.both} 张）`,
);
console.log(`\n  需人读（两侧都有数字却对不上，这才是真实工作队列）：${report.needsHuman.length} 张`);
printIds(report.needsHuman);
console.log(
  `\n  某侧无数字（指纹没有信息，既不能证明一致也不能报警；${report.bySideNoDigits.length} 张` +
    `，其中两侧都没有数字 ${report.noDigitsWhy.bothSides} 张、只有一侧 ${report.noDigitsWhy.oneSide} 张）：`,
);
printIds(report.bySideNoDigits);
console.log(
  `\n  （上面三张清单是记录，永不进退出码：红只看「src 重算」与「选项重排」两项。` +
    `把它们做成红灯，${report.needsHuman.length + report.bySideNoDigits.length} 张卡会让门禁每天红一次，然后没人再看它。）`,
);

// 门禁结论：只有"需要动手却没动手"的两项算失败，且逐张点名过（见上面的 id 清单）。
if (!write) {
  if (report.srcUpdated || report.reordered) {
    console.error(
      `\n❌ 英文覆盖层与中文卡不对齐: src 需要重算 ${report.srcUpdated} 条、` +
        `选项顺序需重排 ${report.reordered} 条——卡见上面点名的 id。`,
    );
    console.error('   → 跑 node scripts/sync-overlays.mjs --write，再重跑 npm run precheck。');
    process.exitCode = 1;
  } else {
    console.log(
      `✅ 英文覆盖层对齐检查通过：${optionCards} 张带选项的卡里 ${decidable} 张可判定顺序，` +
        `${report.needsHuman.length} 张需人读、${report.bySideNoDigits.length} 张某侧无数字（记录，不算失败）；` +
        'src 与选项顺序都没有待办。',
    );
  }
}
