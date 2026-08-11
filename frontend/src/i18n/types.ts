/**
 * i18n 翻译表类型模板
 *
 * 以 zh-CN 为基准语言推导键类型，其他语言文件的键必须与之完全一致
 * （可配合 `npm run i18n:check` 脚本校验）。
 *
 * 阶段 3 将把此类型接入 i18n.js 的 t() 与语言表加载流程。
 */
import type zhCN from './zh-CN/basic.js';

/** 完整翻译表（键为中文文案，值为对应语言译文） */
export type I18nDict = typeof zhCN;

/** 翻译键集合 */
export type I18nKey = keyof I18nDict;
