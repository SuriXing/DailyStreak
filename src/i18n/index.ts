export {
  UI_DICTS,
  getDeviceLocale,
  pluralCategory,
  interpolate,
  translate,
  formatDateLong,
  localizeStudyItem,
  localizeCourse,
} from './core';
export { I18nProvider, useI18n } from './context';
export { LOCALES, LOCALE_META } from './types';
export type {
  Locale,
  TKey,
  TFn,
  UiStrings,
  DictValue,
  PluralForms,
  PluralCategory,
  ItemContent,
  CourseContent,
} from './types';
