import { getLocales } from 'expo-localization';

import type { Course, StudyItem } from '@/data/courses';

import { zh } from './locales/zh';
import { en } from './locales/en';
import { es } from './locales/es';
import { courseContentEn } from './content/en';
import { courseContentEs } from './content/es';
import { LOCALE_META, type CourseContent, type Locale, type PluralCategory, type TKey, type UiStrings } from './types';

export const UI_DICTS: Record<Locale, UiStrings> = { zh, en, es };

/** 各语言对课程内容的覆盖层；zh 直接使用 courses.ts 的中文基底 */
const COURSE_CONTENT: Partial<Record<Locale, CourseContent>> = {
  en: courseContentEn,
  es: courseContentEs,
};

/** 读取设备语言（首次启动的默认语言），未识别时回退中文 */
export function getDeviceLocale(): Locale {
  try {
    const tag = getLocales()[0]?.languageTag ?? '';
    const lang = tag.split('-')[0]?.toLowerCase();
    if (lang === 'en') return 'en';
    if (lang === 'es') return 'es';
    return 'zh';
  } catch {
    return 'zh';
  }
}

export function pluralCategory(locale: Locale, count: number | undefined): PluralCategory {
  if (typeof count !== 'number' || Number.isNaN(count)) return 'other';
  try {
    return new Intl.PluralRules(LOCALE_META[locale].tag).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/** {name} 占位符插值；缺参时保留占位符，便于发现漏传 */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** 核心翻译：当前语言 → 回退 zh → 回退 key 本身 */
export function translate(locale: Locale, key: TKey, params?: Record<string, string | number>): string {
  const dict = UI_DICTS[locale] ?? UI_DICTS.zh;
  const entry = dict[key] ?? UI_DICTS.zh[key];
  if (entry === undefined) return String(key);
  const template =
    typeof entry === 'string'
      ? entry
      : (entry[pluralCategory(locale, params ? Number(params.count) : undefined)] ?? entry.other);
  return interpolate(template, params);
}

/** 长日期格式化（如「8月31日 星期日」/ "Sunday, August 31"），Intl 不可用时给出简单回退 */
export function formatDateLong(date: Date, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(LOCALE_META[locale].tag, {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date);
  } catch {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

/** 按语言返回知识点内容；未翻译的条目自动回退中文基底 */
export function localizeStudyItem(item: StudyItem, locale: Locale): StudyItem {
  const content = COURSE_CONTENT[locale];
  if (!content) return item;
  const ic = content.items[item.id];
  return {
    ...item,
    skill: content.skills[item.skill] ?? item.skill,
    title: ic?.title ?? item.title,
    body: ic?.body ?? item.body,
    question: ic?.question ?? item.question,
    options: ic?.options ?? item.options,
    explanation: ic?.explanation ?? item.explanation,
  };
}

/** 按语言返回课程（简介 + 全部条目）；未翻译字段回退中文基底 */
export function localizeCourse(course: Course, locale: Locale): Course {
  return {
    ...course,
    description: COURSE_CONTENT[locale]?.descriptions[course.id] ?? course.description,
    items: course.items.map((it) => localizeStudyItem(it, locale)),
  };
}
