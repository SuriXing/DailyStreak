/**
 * i18n 类型与语言元信息。
 *
 * 约定：
 * - UI 文案：zh.ts 是键集基准，en/es 用 UiStrings 类型约束，缺键/多键在 tsc 阶段报错。
 * - 课程内容：courses.ts 的中文文案是基底，content/{en,es}.ts 提供覆盖层，运行时缺失自动回退中文。
 */

export const LOCALES = ['zh', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** 语言元信息：Intl tag + 界面里显示的本语言名称（始终用各自语言展示） */
export const LOCALE_META: Record<Locale, { tag: string; nativeName: string }> = {
  zh: { tag: 'zh-CN', nativeName: '中文' },
  en: { tag: 'en-US', nativeName: 'English' },
  es: { tag: 'es-ES', nativeName: 'Español' },
};

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** 复数词条：按 Intl.PluralRules 类别提供模板，缺失类别回退 other */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type DictValue = string | PluralForms;

/** UI 文案键集（zh 为基准） */
export interface UiStrings {
  'common.retry': DictValue;
  'common.errorGeneric': DictValue;

  'errors.timeout': DictValue;
  'errors.loadFailed': DictValue;
  'errors.checkInFailed': DictValue;
  'errors.undoFailed': DictValue;
  'errors.supabaseNotConfigured': DictValue;

  'tabs.checkin': DictValue;
  'tabs.study': DictValue;
  'tabs.profile': DictValue;

  'sidebar.tagline': DictValue;
  'sidebar.expand': DictValue;
  'sidebar.collapse': DictValue;

  'a11y.switchCourse': DictValue;

  'home.streakDays': DictValue;
  'home.celebrate': DictValue;
  'home.checkIn': DictValue;
  'home.checkedIn': DictValue;
  'home.undoCheckIn': DictValue;
  'home.todayPractice': DictValue;
  'home.progressDone': DictValue;
  'home.progressCount': DictValue;
  'home.goalDoneHint': DictValue;
  'home.goalHint': DictValue;
  'home.calendar': DictValue;
  'home.legendChecked': DictValue;
  'home.legendCompleted': DictValue;
  'home.legendToday': DictValue;
  'home.stats': DictValue;
  'home.totalCheckins': DictValue;
  'home.currentStreak': DictValue;

  'study.todayPractice': DictValue;
  'study.doneToday': DictValue;
  'study.remaining': DictValue;
  'study.plan': DictValue;
  'study.noReviews': DictValue;
  'study.masteryLine': DictValue;
  'study.practiceAgain': DictValue;
  'study.start': DictValue;
  'study.todayTopic': DictValue;

  'quiz.progress': DictValue;
  'quiz.correct': DictValue;
  'quiz.answerIs': DictValue;
  'quiz.next': DictValue;
  'quiz.summary': DictValue;

  'done.title': DictValue;
  'done.accuracy': DictValue;
  'done.reviewTomorrow': DictValue;
  'done.finish': DictValue;

  'profile.mastery': DictValue;
  'profile.dailyGoal': DictValue;
  'profile.goalHint': DictValue;
  'profile.goalQuestions': DictValue;
  'profile.signOut': DictValue;
  'profile.footer': DictValue;
  'profile.language': DictValue;

  'auth.configTitle': DictValue;
  'auth.configBody': DictValue;
  'auth.tagline': DictValue;
  'auth.usernamePlaceholder': DictValue;
  'auth.usernameLabel': DictValue;
  'auth.email': DictValue;
  'auth.passwordPlaceholder': DictValue;
  'auth.login': DictValue;
  'auth.signup': DictValue;
  'auth.toSignup': DictValue;
  'auth.toLogin': DictValue;
  'auth.signupSuccess': DictValue;
  'auth.invalidCredentials': DictValue;
  'auth.emailNotConfirmed': DictValue;
  'auth.userExists': DictValue;
  'auth.passwordTooShort': DictValue;
  'auth.rateLimited': DictValue;

  'calendar.weekdays': DictValue;
  'profile.theme': DictValue;
  'profile.themeSystem': DictValue;
  'profile.themeLight': DictValue;
  'profile.themeDark': DictValue;
  'badges.title': DictValue;
  'badges.streakDays': DictValue;
  'badges.locked': DictValue;
  'home.todayLesson': DictValue;
  'home.goStudy': DictValue;
  'home.weekly': DictValue;
  'home.weeklySummary': DictValue;
  'home.weeklyEmpty': DictValue;
  'home.milestone': DictValue;
  'sidebar.toggleTheme': DictValue;
  'auth.google': DictValue;
  'auth.apple': DictValue;
  'study.noSession': DictValue;
}

export type TKey = keyof UiStrings;

export type TFn = (key: TKey, params?: Record<string, string | number>) => string;

/** 单个知识点的可翻译内容 */
export interface ItemContent {
  title: string;
  body: string;
  question: string;
  options: string[];
  explanation: string;
}

/** 某一语言对课程内容的完整覆盖层（缺条目时回退 courses.ts 的中文基底） */
export interface CourseContent {
  /** 课程简介，键为课程 id（csa / csp / calc…） */
  descriptions: Record<string, string>;
  /** 技能标签，键为 courses.ts 里的中文技能名 */
  skills: Record<string, string>;
  /** 知识点内容，键为条目 id（如 csa-1） */
  items: Record<string, ItemContent>;
}
