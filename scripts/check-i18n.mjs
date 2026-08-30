#!/usr/bin/env node
/**
 * i18n 完备性校验：
 * 1. en/es 的 UI 词典键集必须与 zh 完全一致（不多不少）。
 * 2. en/es 的课程内容覆盖层必须覆盖 courses.ts 里全部条目、技能与课程简介。
 *
 * 用法：npm run i18n:check（CI 与本地均可，退出码非 0 表示缺失）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const problems = [];

// ---- 解析 courses.ts 的结构化数据 ----
const coursesSrc = read('src/data/courses.ts');
const ids = [...coursesSrc.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
const itemIds = ids.filter((id) => /\d/.test(id));
const courseIds = ids.filter((id) => !/\d/.test(id));
const skills = [...coursesSrc.matchAll(/skill: '([^']+)'/g)].map((m) => m[1]);
if (!itemIds.length || !courseIds.length || !skills.length) {
  console.error('无法从 src/data/courses.ts 解析出条目/课程/技能，请检查解析正则');
  process.exit(1);
}

// ---- UI 词典键集对齐 ----
const dictKeys = {};
for (const locale of ['zh', 'en', 'es']) {
  const src = read(`src/i18n/locales/${locale}.ts`);
  dictKeys[locale] = [...src.matchAll(/^\s{2}'([a-zA-Z0-9.]+)':/gm)].map((m) => m[1]);
  if (!dictKeys[locale].length) problems.push(`src/i18n/locales/${locale}.ts 未解析到任何 key`);
}
const zhKeys = new Set(dictKeys.zh);
for (const locale of ['en', 'es']) {
  const keys = new Set(dictKeys[locale]);
  for (const key of zhKeys) if (!keys.has(key)) problems.push(`${locale}.ts 缺少 key: ${key}`);
  for (const key of keys) if (!zhKeys.has(key)) problems.push(`${locale}.ts 多出 key: ${key}`);
}

// ---- 课程内容覆盖层 ----
for (const locale of ['en', 'es']) {
  const src = read(`src/i18n/content/${locale}.ts`);
  for (const id of itemIds) {
    if (!src.includes(`'${id}':`)) problems.push(`content/${locale}.ts 缺少条目: ${id}`);
  }
  for (const skill of skills) {
    if (!src.includes(`'${skill}':`)) problems.push(`content/${locale}.ts 缺少技能翻译: ${skill}`);
  }
  for (const courseId of courseIds) {
    if (!new RegExp(`\\b${courseId}: ['"]`).test(src)) {
      problems.push(`content/${locale}.ts 缺少课程简介: ${courseId}`);
    }
  }
}

if (problems.length) {
  console.error(`❌ i18n 校验失败（${problems.length} 处）:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `✅ i18n 校验通过: zh/en/es 词典键集一致（${zhKeys.size} keys），` +
    `课程内容覆盖 ${itemIds.length} 条目 / ${skills.length} 技能 / ${courseIds.length} 课程`,
);
