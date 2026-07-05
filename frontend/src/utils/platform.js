// 平台检测工具
const _isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * 获取修饰键状态（macOS 上将 Meta/⌘ 映射为 Ctrl）
 * 用于快捷键检测：const mod = getModKey(e);
 */
export function getModKey(e) {
  return _isMac ? (e.ctrlKey || e.metaKey) : e.ctrlKey;
}

/**
 * 获取修饰键显示文本
 * macOS 显示 ⌘，其他显示 Ctrl
 */
export function getModLabel() {
  return _isMac ? '⌘' : 'Ctrl';
}

/**
 * 标准化快捷键字符串显示（macOS 将 Ctrl 替换为 ⌘）
 * 如 "Ctrl+C" → "⌘C" (macOS)
 */
export function formatShortcut(str) {
  if (!str) return str;
  if (_isMac) return str.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧');
  return str;
}
