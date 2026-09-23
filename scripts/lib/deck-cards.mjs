/**
 * 读取生成出来的卡组模块。
 *
 * 生成文件里每张卡是一行 TS 对象字面量（键没有引号），所以不能直接 JSON.parse。
 * 打包（scripts/pack-decks.mjs）与校验（scripts/check-flashcards.mjs）共用这里，
 * 避免两边各写一套解析而慢慢漂移。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** 五个选择题卡组的 key，与 scripts/build-subject-decks.js 的 SUBJECTS 对应。 */
export const SUBJECT_DECKS = ['csa', 'csp', 'precalc', 'calcbc', 'stats', 'csa-scenario', 'csp-scenario', 'precalc-scenario', 'calcbc-scenario', 'stats-scenario'];

function atKeyStart(out) {
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i] === ' ') continue;
    return out[i] === '{' || out[i] === ',';
  }
  return true;
}

/** 给对象字面量的键补上引号，使其成为合法 JSON（字符串内部的冒号不受影响）。 */
export function toJson(line) {
  const src = line.trim().replace(/,$/, '');
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch) && atKeyStart(out)) {
      let end = i;
      while (end < src.length && /[A-Za-z0-9_$]/.test(src[end])) end += 1;
      let colon = end;
      while (colon < src.length && src[colon] === ' ') colon += 1;
      if (src[colon] === ':') {
        out += `"${src.slice(i, end)}"`;
        i = end - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function lines(absPath, prefix) {
  return readFileSync(absPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(prefix))
    .map((l) => JSON.parse(toJson(l)));
}

export function readCards(absPath) {
  return lines(absPath, '{ id: ');
}

export function readDecks(absPath) {
  return lines(absPath, '{ key: ');
}

/**
 * 读出全部卡组：AMC10（564 张 + 5 个卡组标签）与五个选择题卡组（各 120 张 + 1 个标签）。
 * 传 root 为仓库根目录。
 */
export function readAllDecks(root) {
  const amc10Path = path.join(root, 'src', 'data', 'amc10-flashcards.ts');
  const amc10 = { cards: readCards(amc10Path), decks: readDecks(amc10Path) };
  const subjectCards = [];
  const subjectDeckList = [];
  for (const key of SUBJECT_DECKS) {
    const p = path.join(root, 'src', 'data', 'subject-decks', `${key}.ts`);
    subjectCards.push(...readCards(p));
    subjectDeckList.push(...readDecks(p));
  }
  return { amc10, subject: { cards: subjectCards, decks: subjectDeckList } };
}
