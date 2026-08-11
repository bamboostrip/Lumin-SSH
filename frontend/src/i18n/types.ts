/**
 * i18n 翻译表类型模板
 *
 * 以 zh-CN 为基准语言推导键类型，其他语言文件的键必须与之完全一致
 * （可配合 `npm run i18n:check` 脚本校验）。
 *
 * 已接入 src/i18n.ts：t() 的 key 参数为 I18nKey，setLanguage/loadLanguage 为 LanguageCode。
 */
import type zhCN from './zh-CN/basic.js';

/** 完整翻译表（键为中文文案，值为对应语言译文） */
export type I18nDict = typeof zhCN;

/** 翻译键集合 */
export type I18nKey = keyof I18nDict;

/**
 * 支持的语言代码（与 src/i18n/<lang>/basic.js 目录一一对应，共 28 种）。
 * 新增语言目录时需同步更新此联合类型。
 */
export type LanguageCode =
  | 'ar'
  | 'bn'
  | 'cs'
  | 'de'
  | 'el'
  | 'en-US'
  | 'es'
  | 'fa-IR'
  | 'fr'
  | 'hi'
  | 'id'
  | 'it'
  | 'ja-JP'
  | 'ko-KR'
  | 'nl'
  | 'pl'
  | 'pt-BR'
  | 'ro'
  | 'ru'
  | 'th'
  | 'tr'
  | 'uk'
  | 'vi'
  | 'zh-CN'
  | 'zh-HK'
  | 'zh-Hant'
  | 'zh-MO'
  | 'zh-TW';
