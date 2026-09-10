/*
 * Wails v3 迁移兼容层（shim）：
 * v2 的 wailsjs/runtime（window.runtime 全局 + window['go'] IPC）在 v3 中已移除，
 * 运行时统一走 @wailsio/runtime。本文件把 v2 的命名导出 API 逐个映射到 v3，
 * 使 src 下 80+ 处 `import { EventsOn ... } from 'wailsjs/runtime/runtime.js'`
 * 无需改动。类型声明见同目录 runtime.d.ts（保持 v2 签名不变）。
 *
 * 差异说明：
 *  - v3 事件回调收到 WailsEvent 对象；Go 侧 Event.Emit 单参数时 data 是原始值
 *    （非数组，见 v3 event_manager.go 的 len(data)==1 分支），多参数时才是数组。
 *    此处归一化为数组后展开，保持 v2 的 (...data) 回调签名。
 *  - v3 文件拖放改为 data-file-drop-target 属性 + Go 侧 WindowFilesDropped 事件，
 *    Go 侧转发为 "wails:file-drop" 事件，此处复刻 v2 的 OnFileDrop(x, y, paths) 回调。
 */
import { Browser, Clipboard, Events, Window } from '@wailsio/runtime';

const currentWindow = Window.Get();

function spreadEventData(callback) {
  return (event) => {
    const data = event?.data;
    if (Array.isArray(data)) return callback(...data);
    if (data === null || data === undefined) return callback();
    return callback(data);
  };
}

// ── Events ──────────────────────────────────────────────────────────────────
export function EventsEmit(eventName, ...data) {
  return Events.Emit(eventName, data.length > 1 ? data : data[0]);
}

export function EventsOn(eventName, callback) {
  return Events.On(eventName, spreadEventData(callback));
}

export function EventsOnMultiple(eventName, callback, maxCallbacks) {
  return Events.OnMultiple(eventName, spreadEventData(callback), maxCallbacks);
}

export function EventsOnce(eventName, callback) {
  return Events.Once(eventName, spreadEventData(callback));
}

export function EventsOff(...eventNames) {
  return Events.Off(...eventNames);
}

export function EventsOffAll() {
  return Events.OffAll();
}

// ── Window ──────────────────────────────────────────────────────────────────
export function WindowReload() {
  window.location.reload();
}

export function WindowSetTitle(title) {
  return currentWindow.SetTitle(title);
}

export function WindowFullscreen() {
  return currentWindow.Fullscreen();
}

export function WindowUnfullscreen() {
  return currentWindow.UnFullscreen();
}

export function WindowIsFullscreen() {
  return currentWindow.IsFullscreen();
}

export function WindowSetSize(width, height) {
  return currentWindow.SetSize(width, height);
}

export function WindowGetSize() {
  return currentWindow.Size();
}

export function WindowSetMaxSize(width, height) {
  return currentWindow.SetMaxSize(width, height);
}

export function WindowSetMinSize(width, height) {
  return currentWindow.SetMinSize(width, height);
}

export function WindowSetPosition(x, y) {
  return currentWindow.SetPosition(x, y);
}

export function WindowGetPosition() {
  return currentWindow.Position();
}

export function WindowHide() {
  return currentWindow.Hide();
}

export function WindowShow() {
  return currentWindow.Show();
}

export function WindowMaximise() {
  return currentWindow.Maximise();
}

export function WindowToggleMaximise() {
  return currentWindow.ToggleMaximise();
}

export function WindowUnmaximise() {
  return currentWindow.UnMaximise();
}

export function WindowIsMaximised() {
  return currentWindow.IsMaximised();
}

export function WindowMinimise() {
  return currentWindow.Minimise();
}

export function WindowUnminimise() {
  return currentWindow.UnMinimise();
}

export function WindowIsMinimised() {
  return currentWindow.IsMinimised();
}

export function WindowSetAlwaysOnTop(b) {
  return currentWindow.SetAlwaysOnTop(b);
}

export function WindowCenter() {
  return currentWindow.Center();
}

// ── Browser ─────────────────────────────────────────────────────────────────
// 纯浏览器 dev（无 wails 后端）时 Browser.OpenURL 会请求失败，
// 这里降级到 window.open，等价 v2 代码里对 window.runtime 的 typeof 守卫兜底。
export function BrowserOpenURL(url) {
  return Browser.OpenURL(url).catch((err) => {
    console.warn('[wails3-shim] BrowserOpenURL failed, falling back to window.open:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

// ── Clipboard ───────────────────────────────────────────────────────────────
export function ClipboardGetText() {
  return Clipboard.Text();
}

export function ClipboardSetText(text) {
  return Clipboard.SetText(text);
}

// ── Drag & Drop ─────────────────────────────────────────────────────────────
// v2 的 OnFileDrop(callback, useDropTarget)：拖放任意位置触发回调 (x, y, paths)。
// v3 中拖放先落到 Go（WindowFilesDropped），由 Go 转发 "wails:file-drop" 事件。
// 配套要求：页面上需存在 [data-file-drop-target] 元素（main.tsx 中挂在 body 上），
// 否则 WebView 层会直接忽略拖放。
export function OnFileDrop(callback, _useDropTarget) {
  return Events.On('wails:file-drop', spreadEventData(callback));
}

export function OnFileDropOff() {
  return Events.Off('wails:file-drop');
}
