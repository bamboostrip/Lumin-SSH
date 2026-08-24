// 平台检测工具
export const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** 修饰键事件（键盘/鼠标事件共有的 ctrlKey、metaKey 字段） */
interface ModifierKeyEvent {
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * 获取修饰键状态（macOS 上将 Meta/⌘ 映射为主快捷键 Ctrl）
 * 用于快捷键检测：const mod = getModKey(e);
 */
export function getModKey(e: ModifierKeyEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * 标准化快捷键字符串显示（macOS 将 Ctrl 替换为 ⌘）
 * 如 "Ctrl+C" → "⌘C" (macOS)
 */
export function formatShortcut(str: string): string {
  if (!str) return str;
  if (isMac) return str.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧');
  return str;
}

