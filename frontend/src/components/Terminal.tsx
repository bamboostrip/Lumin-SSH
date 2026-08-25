import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import type { IBufferLine, IBufferRange, IMarker, ITerminalInitOnlyOptions, ITerminalOptions } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Copy, Clipboard, Trash2, CheckSquare, Play, Clock, X, Zap, MessageSquarePlus, ExternalLink, Search, ChevronUp, ChevronDown, CaseSensitive } from 'lucide-react';
import * as AppGo from '../../wailsjs/go/wailsapp/App.js';
import { EventsOn } from '../../wailsjs/runtime/runtime.js';
import { getModKey, formatShortcut, isMac, buildCombo } from '../utils/platform.ts';
import { clampMenuPosition } from '../utils/menuPosition.ts';
import { extractQuickCommandParams, fillQuickCommandParams, normalizeQuickCommandParamHistory, type QuickCommandParamHistory } from '../utils/quickCommandParams.ts';
import {
  buildPathAutocompleteContext,
  buildStaticAutocompleteItems,
  createCommandAutocompleteState,
  loadPathAutocompleteItems,
  normalizeHistoryCommands,
  normalizeQuickCommandItems,
  normalizeRemoteAbsolutePath,
  type AutocompleteItem,
  type AutocompleteSources,
  type FlattenedQuickCommand,
} from '../utils/terminalCommandAutocomplete.ts';
import { parseCommandInputContext } from '../utils/terminalCommandAutocompleteParser.ts';
import Tiptop from './Tiptop.tsx';
import { useTerminalTimestamps } from './terminal/useTerminalTimestamps.ts';
import { useTerminalLinkUnderlines } from './terminal/useTerminalLinkUnderlines.ts';
import { useTerminalGutter } from './terminal/useTerminalGutter.ts';
import { useTerminalTheme } from './terminal/useTerminalTheme.ts';
import { useTerminalSettingsEvents } from './terminal/useTerminalSettingsEvents.ts';
import type { TerminalProps } from './terminal/terminalTypes.ts';
import { ToggleSwitch } from './settings/SharedComponents.tsx';
import type { QuickCommandsHandle } from './QuickCommands.tsx';
import { Button, ContextMenu, Modal } from './ui';
import '@xterm/xterm/css/xterm.css';
import { useTranslation, type I18nKey } from '../i18n.ts';
import { readClipboardText, buildWrappedMultiLineCommand, DEFAULT_TERMINAL_SHORTCUTS, extractCommandFromBufferLine, findTerminalHttpLinksOnLine, formatTerminalTimestamp, getLogicalLineSegments, getTerminalBufferSnapshotText, getTerminalInputStartLine, getTermSearchDecorations, getTextareaAutocompletePopupPosition, isInteractivePromptText, isTerminalHttpUrl, joinedIndexToPos, lineToTextAndCols, normalizeTerminalPasteText, SCREEN_NON_INTERACTIVE_OPTIONS, SHELL_PROMPT_PREFIX_PATTERNS, splitTrailingIncompleteEscapeSequence, startsInteractiveScreen, TERMINAL_SIGNAL_BYTES, TERMINAL_URL_REGEX, textDecoder, textEncoder } from '../utils/terminalHelpers.ts';
import defaultTermBg from '../assets/term_bg.webp';
import { Z } from '../constants/zIndex';
import { getTerminalTheme, getAppThemeMode, isDarkTerminalSurface, getSolidTerminalBackground, type TerminalTheme } from '../utils/theme.ts';
import { getResolvedProgramFontPreferences } from '../utils/programFonts.ts';
import { highlightKeywords, loadKeywordRulesFromStorage, setKeywordRules, createHighlightState, type KeywordRule } from '../utils/terminalKeywordHighlight.ts';

// 启动时从 localStorage 加载自定义关键字规则（模块级，仅执行一次）
loadKeywordRulesFromStorage();

export type { TerminalProps } from './terminal/terminalTypes.ts';

export default function Terminal({
  sessionId,
  serverId,
  historyServerId,
  status,
  isActive,
  serverName,
  connectedSessions = [],
  showCommands = false,
  onQuickCommandsOpenChange,
  quickCmdsRef,
  wsRebuildKey = 0,
}: TerminalProps) {
  const { t } = useTranslation();
  const containerRef   = useRef<HTMLDivElement | null>(null);
  const wrapperRef     = useRef<HTMLDivElement | null>(null);
  const termRef        = useRef<XTerm | null>(null);
  const fitAddonRef    = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const termSearchInputRef = useRef<HTMLInputElement | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const connectWebSocketRef = useRef<(() => void) | null>(null);
  const statusRef      = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const serverIdRef    = useRef(serverId);
  serverIdRef.current  = serverId;
  const [contextMenu, setContextMenu]         = useState<{ x: number; y: number; source: 'terminal' | 'input' } | null>(null);
  const [linkMenu, setLinkMenu]               = useState<{ x: number; y: number; url: string } | null>(null); // { x, y, url }
  const [linkToast, setLinkToast]             = useState('');
  const [contextHasSelection, setContextHasSelection] = useState(false);
  const [justConnected, setJustConnected]     = useState(false);
  const [cmdInput, setCmdInput]               = useState('');
  const [showHistory, setShowHistory]         = useState(false);
  const [altOpenHistoryEnabled, setAltOpenHistoryEnabled] = useState(localStorage.getItem('altOpenHistory') !== 'false');
  const [historyList, setHistoryList]         = useState<Array<{ id: string; command: string }>>([]);
  const historyListRef                        = useRef<Array<{ id: string; command: string }>>([]);
  useEffect(() => { historyListRef.current = historyList; }, [historyList]);
  const [historyMode, setHistoryMode]         = useState<'server' | 'global'>('server'); // 'server' | 'global'
  const [searchQuery, setSearchQuery]         = useState('');
  const [historySelectedIndex, setHistorySelectedIndex] = useState(0);
  const [showTermSearch, setShowTermSearch]   = useState(false);
  const [termSearchQuery, setTermSearchQuery] = useState('');
  const [termSearchCaseSensitive, setTermSearchCaseSensitive] = useState(false);
  const [termSearchResult, setTermSearchResult] = useState({ resultIndex: -1, resultCount: 0 });
  const cmdInputRef                           = useRef<HTMLTextAreaElement | null>(null);
  const [cmdInputWidth, setCmdInputWidth]     = useState<number>(600);

  useEffect(() => {
    const el = cmdInputRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0) {
          setCmdInputWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const historyBtnRef                         = useRef<HTMLButtonElement | null>(null);
  const historySearchInputRef                 = useRef<HTMLInputElement | null>(null);
  const historyScrollRef                      = useRef<HTMLDivElement | null>(null);
  const [historyPopupPos, setHistoryPopupPos] = useState<{ left: number; bottom: number } | null>(null);
  const commandsBtnRef                        = useRef<HTMLButtonElement | null>(null);
  const historyPopupRef                       = useRef<HTMLDivElement | null>(null);
  const pendingCmdRef                         = useRef('');
  const awaitingPasswordRef                   = useRef(false); // 检测到密码提示后，下一行输入不记入命令历史
  const awaitingCommandFinishRef              = useRef(false); // 按回车提交命令后，等待命令完成（提示符回归）
  const [terminalCwd, setTerminalCwd]         = useState('/');
  const [commandAutocomplete, setCommandAutocomplete] = useState(createCommandAutocompleteState());
  // 命令输入快捷键提示浮层开关（F1 切换；关闭持久化到 localStorage）
  const [cmdInputHintsHidden, setCmdInputHintsHidden] = useState(() => localStorage.getItem('terminalCmdInputHintsHidden') === 'true');
  const commandAutocompleteRequestRef         = useRef(0);
  const commandAutocompleteFocusedRef         = useRef(false);
  const commandAutocompleteKeyboardNavigationRef = useRef(false);
  const commandAutocompleteDebounceRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandAutocompleteBlurTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandAutocompleteDataRef            = useRef<AutocompleteSources & {
    historyServerId: string;
    serverLoaded: boolean;
    globalLoaded: boolean;
    quickLoaded: boolean;
  }>({
    historyServerId: '',
    serverHistory: [],
    globalHistory: [],
    quickCommands: [],
    serverLoaded: false,
    globalLoaded: false,
    quickLoaded: false,
  });
  const commandAutocompleteListRef            = useRef<HTMLDivElement | null>(null);
  const [commandAutocompletePopupPos, setCommandAutocompletePopupPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  // ── 快捷命令条：输入框上方一排按钮，点击后弹确认框再发送（对齐安卓端） ──
  const [quickCmdBarVisible, setQuickCmdBarVisible] = useState(
    () => localStorage.getItem('terminalQuickCmdBar') === 'true'
  );
  const [quickCmdBarItems, setQuickCmdBarItems] = useState<FlattenedQuickCommand[]>([]);
  const [quickCmdSearch, setQuickCmdSearch] = useState('');
  const [quickCmdSearchOpen, setQuickCmdSearchOpen] = useState(false);
  const quickCmdSearchRef = useRef<HTMLInputElement | null>(null);
  // 待确认命令：{ item, values } 或 null（点命令条按钮后弹确认框，对齐安卓端）
  const [pendingQuickCmd, setPendingQuickCmd] = useState<{ item: FlattenedQuickCommand; values: Record<string, string> } | null>(null);
  const [quickCmdHistoryParam, setQuickCmdHistoryParam] = useState<number | null>(null);
  const [quickCmdHistoryPosition, setQuickCmdHistoryPosition] = useState({ left: 0, top: 0 });
  const [quickCmdHistorySearch, setQuickCmdHistorySearch] = useState('');
  const [quickCmdParamHistory, setQuickCmdParamHistory] = useState<QuickCommandParamHistory>({});
  const quickCmdParamHistoryRef = useRef<QuickCommandParamHistory>({});
  useEffect(() => {
    if (quickCmdHistoryParam === null) return;
    const closeHistory = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-terminal-quick-cmd-history]')) return;
      setQuickCmdHistoryParam(null);
      setQuickCmdHistorySearch('');
    };
    document.addEventListener('click', closeHistory, true);
    return () => document.removeEventListener('click', closeHistory, true);
  }, [quickCmdHistoryParam]);
  useEffect(() => {
    let cancelled = false;
    AppGo.GetParamHistory().then((raw) => {
      if (cancelled) return;
      try {
        const history = normalizeQuickCommandParamHistory(JSON.parse(raw));
        quickCmdParamHistoryRef.current = history;
        setQuickCmdParamHistory(history);
      } catch (_) {}
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── 点击历史弹窗外关闭（document 捕获阶段 mousedown） ──
  // 必须用 capture：命令按钮 / 底部快捷命令面板会 stopPropagation，
  // 冒泡阶段收不到，历史开着点「命令」或命令面板时就收不起来。
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (historyPopupRef.current?.contains(target)) return;
      if (historyBtnRef.current?.contains(target)) return;
      // 全局对话框（luminDialog，如清空确认）打开时，点确认/取消不应收起历史弹窗
      if ((target as Element).closest?.('[data-global-dialog-active="true"]')) return;
      setShowHistory(false);
      setHistoryPopupPos(null);
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [showHistory]);

  // 热路径缓存：避免在按键和消息回调中频繁读取 localStorage
  const shortcutsRef = useRef<Record<string, string> | null>(null);
  const localEchoRef = useRef(localStorage.getItem('terminalLocalEcho') === 'true');
  const timestampsEnabledRef = useRef(localStorage.getItem('terminalTimestamps') === 'true');
  const terminalRightClickPasteOnEmptyRef = useRef(localStorage.getItem('terminalRightClickPasteOnEmpty') === 'true');
  const terminalRightClickPasteModeRef = useRef(localStorage.getItem('terminalRightClickPasteMode') === 'always' ? 'always' : 'empty');
  const terminalLeftClickCopyOnSelectionRef = useRef(localStorage.getItem('terminalLeftClickCopyOnSelection') === 'true');
  const terminalLeftClickCopyOnSelectionModeRef = useRef(localStorage.getItem('terminalLeftClickCopyOnSelectionMode') === 'mouseup' ? 'mouseup' : 'click');
  const terminalMouseDownSelectionRef = useRef<{ mode: 'mouseup' | 'click'; startClientX: number; startClientY: number; text?: string } | null>(null);
  const isTerminalPointerDownRef = useRef(false);
  // macOS WKWebView / 系统手势可能吞掉 mouseup，导致 xterm 拖选状态机卡死（此后划动指针 = 持续划选）。
  // 主动向 document 派发合成 mouseup 闭合状态机：xterm 的选区收尾监听挂在 document 上且不校验 isTrusted；
  // 事件坐标仅 altClickMovesCursor 分支使用（合成事件 altKey=false 不会进入），无指针信息时传 0 即可。
  const dispatchSyntheticTerminalMouseUp = useCallback((clientX = 0, clientY = 0) => {
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      buttons: 0,
      button: 0,
    }));
  }, []);
  const [timestampsVisible, setTimestampsVisible] = useState(localStorage.getItem('terminalTimestamps') === 'true');
  // 命令块：左侧折叠钮 + 树线，可收起输出
  const commandBlocksEnabledRef = useRef(localStorage.getItem('terminalCommandBlocks') === 'true');
  const [commandBlocksVisible, setCommandBlocksVisible] = useState(localStorage.getItem('terminalCommandBlocks') === 'true');
  const [terminalDefaultMouseCursorEnabled, setTerminalDefaultMouseCursorEnabled] = useState(localStorage.getItem('terminalOutputDefaultMouseCursor') === 'true');
  const keywordHighlightEnabledRef = useRef(localStorage.getItem('terminalKeywordHighlight') === 'true');
  // 关键字高亮：二进制帧流式解码器（每次建连重置，保证 UTF-8 跨帧字符完整）
  const hlDecoderRef = useRef(new TextDecoder());
  // 关键字高亮：per-session 前景色状态。服务端着色区间可能跨帧，
  // 需跨帧跟踪 fgActive 才不会误注入/误清色；每个终端会话独立持有，
  // 多标签/分屏互不污染。建连 / 开关切换时一并重置。
  const hlStateRef = useRef(createHighlightState());
  const [alternateBufferActive, setAlternateBufferActive] = useState(false);
  const alternateBufferActiveRef = useRef(false);
  const screenScrollbackRef = useRef({ pending: false, active: false });
  const prepareScreenScrollbackRef = useRef<(command: string) => void>(() => {});
  // ── 时间戳 ring / 链接下划线 / 命令块 gutter（terminal/ 目录同名 hook） ──
  const { tsRingRef, tsSet, tsEnsureLine, tsClearLine, tsClear, tsSnapshotByLine, tsRemountFromList } = useTerminalTimestamps({ timestampsEnabledRef });
  const { linkUnderlineLayerRef, linkUnderlineSyncRAFRef, getViewportLinkCache, scheduleLinkUnderlineSync } = useTerminalLinkUnderlines({ termRef, containerRef });
  const { gutterRef, gutterSyncRAFRef, cbRewriteLockRef, isShellPromptLine, isCollapseSummaryLine, scheduleGutterSync, syncGutter, handleClearScreen, cbExpandAllCollapsed, cbClear } = useTerminalGutter({
    termRef,
    containerRef,
    timestampsEnabledRef,
    commandBlocksEnabledRef,
    alternateBufferActiveRef,
    commandBlocksVisible,
    t,
    tsRingRef,
    tsEnsureLine,
    tsClearLine,
    tsSnapshotByLine,
    tsRemountFromList,
  });
  const smartWriteRef = useRef<((data: string | Uint8Array) => void) | null>(null);

  // ── 主题/壁纸与设置事件监听（terminal/ 目录同名 hook） ──
  const { T, themeToggle, bgInfo } = useTerminalTheme({ termRef, wrapperRef });
  useTerminalSettingsEvents({
    termRef,
    fitAddonRef,
    gutterRef,
    shortcutsRef,
    localEchoRef,
    timestampsEnabledRef,
    commandBlocksEnabledRef,
    terminalRightClickPasteOnEmptyRef,
    terminalRightClickPasteModeRef,
    terminalLeftClickCopyOnSelectionRef,
    terminalLeftClickCopyOnSelectionModeRef,
    keywordHighlightEnabledRef,
    hlDecoderRef,
    hlStateRef,
    setTimestampsVisible,
    setCommandBlocksVisible,
    setTerminalDefaultMouseCursorEnabled,
    setAltOpenHistoryEnabled,
    cbExpandAllCollapsed,
    cbClear,
    scheduleGutterSync,
  });

  // ── 初始化 xterm + WebSocket 终端通道 ────────────────────────────────
  // xterm.js 通过 AttachAddon + WebSocket 直接连到本地 Go WebSocket 服务器
  // 完全绕开 Wails IPC跨进程通信，走 TCP loopback 延迟极低
  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const fontSize = parseInt(localStorage.getItem('terminalFontSize') || '13', 10);

    const term = new XTerm({
      // background 用不透明的容器底色：nano/vim 的反转显示（SGR 7）需要真实的背景色参与
      // 互换，透明底会退化成黑字黑底；壁纸/色调层改为叠在内容上方保持观感
      theme:            { ...T.xterm, background: getSolidTerminalBackground(T) },
      fontFamily:       getResolvedProgramFontPreferences().terminalFontFamily,
      fontSize:         fontSize,
      fontWeight:       500,
      fontWeightBold:   700,
      lineHeight:       1.22,
      letterSpacing:    0.3,
      // 关自动反差：搜索高亮底上白字会被压成黑字
      minimumContrastRatio: 0,
      cursorBlink:      true,
      cursorStyle:      'bar',
      cursorWidth:      1,
      scrollback:       5000,
      // SearchAddon 高亮装饰依赖 proposed API
      allowProposedApi: true,
      fastScrollModifier: 'alt',
      macOptionIsMeta:  true,
      padding:          8,
      windowOptions: {
        setWinSizeChars: true
      }
      // xterm 5 类型未声明 padding 选项（运行期仍生效），按构造参数类型断言
    } as ITerminalOptions & ITerminalInitOnlyOptions & { padding?: number });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    const searchAddon = new SearchAddon({ highlightLimit: 1000 });
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    const searchResultsDisposable = searchAddon.onDidChangeResults((result) => {
      setTermSearchResult({
        resultIndex: typeof result?.resultIndex === 'number' ? result.resultIndex : -1,
        resultCount: typeof result?.resultCount === 'number' ? result.resultCount : 0,
      });
    });
    // 点击/手型用 provider；常驻下划线用覆盖层。可见区扫描走 getViewportLinkCache
    const linkProviderDisposable = term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const found = getViewportLinkCache(term).get(bufferLineNumber) || [];
        if (!found.length) {
          callback(undefined);
          return;
        }
        callback(found.map(({ text, range }) => ({
          text,
          range,
          decorations: { underline: false, pointerCursor: true },
          activate(event, uri) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            try { term.clearSelection(); } catch (_) {}
            requestAnimationFrame(() => { try { term.clearSelection(); } catch (_) {} });
            const x = event?.clientX ?? 0;
            const y = event?.clientY ?? 0;
            setContextMenu(null);
            setLinkMenu({ ...clampMenuPosition(x, y, 200, 96), url: uri });
          },
        })));
      },
    });
    term.open(containerRef.current);
    screenScrollbackRef.current.pending = false;
    screenScrollbackRef.current.active = false;
    const syncTuiState = (screenActive = screenScrollbackRef.current.active) => {
      const active = term.buffer.active.type === 'alternate' || screenActive;
      alternateBufferActiveRef.current = active;
      setAlternateBufferActive(active);
      if (active) {
        if (gutterSyncRAFRef.current !== null) {
          cancelAnimationFrame(gutterSyncRAFRef.current);
          gutterSyncRAFRef.current = null;
        }
        if (gutterRef.current) gutterRef.current.innerHTML = '';
        if (linkUnderlineLayerRef.current) linkUnderlineLayerRef.current.innerHTML = '';
      } else {
        scheduleGutterSync();
        scheduleLinkUnderlineSync();
      }
    };
    prepareScreenScrollbackRef.current = (command) => {
      if (screenScrollbackRef.current.active) return;
      screenScrollbackRef.current.pending = startsInteractiveScreen(command);
    };
    const screenAltModeSetDisposable = term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
      const mode = params.length === 1 && typeof params[0] === 'number' ? params[0] : 0;
      if ((!screenScrollbackRef.current.pending && !screenScrollbackRef.current.active) || (mode !== 47 && mode !== 1047 && mode !== 1049)) return false;
      screenScrollbackRef.current.pending = false;
      screenScrollbackRef.current.active = true;
      syncTuiState(true);
      return true;
    });
    const screenAltModeResetDisposable = term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
      const mode = params.length === 1 && typeof params[0] === 'number' ? params[0] : 0;
      if (!screenScrollbackRef.current.active || (mode !== 47 && mode !== 1047 && mode !== 1049)) return false;
      screenScrollbackRef.current.active = false;
      screenScrollbackRef.current.pending = false;
      syncTuiState(false);
      // normal buffer 已承载 screen 历史，不能再执行 1049l 的旧光标恢复，否则长日志会把提示符拉回已裁剪位置。
      return true;
    });
    try { fitAddon.fit(); } catch (_) {}
    const terminalInput = containerRef.current.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
    if (terminalInput) {
      terminalInput.name = 'terminalInput';
      terminalInput.autocomplete = 'off';
    }
    alternateBufferActiveRef.current = false;
    setAlternateBufferActive(false);

    // ── 智能写入：用户手动滚动上时保持位置 ─────────────────────────
    let userPinned = false; // 用户手动往上滚后锁定
    const onTermScroll = () => {
      const buf = term.buffer.active;
      // 滚到底部时解除锁定
      if (buf.viewportY >= buf.baseY) {
        userPinned = false;
      }
      scheduleGutterSync();
      scheduleLinkUnderlineSync();
    };
    const scrollDisposable = term.onScroll(onTermScroll);
    // 直接监听 xterm 视口 DOM scroll 事件作为更可靠的备选
    const vpEl = containerRef.current.querySelector('.xterm-viewport');
    if (vpEl) {
      vpEl.addEventListener('scroll', onTermScroll, { passive: true });
    }

    // ── 每行时间戳 / 命令块：marker 跟随 xterm scrollback 裁剪 ──
    const lineFeedDisposable = term.onLineFeed(() => {
      if (alternateBufferActiveRef.current || term.buffer.active.type !== 'normal') return;
      if (!timestampsEnabledRef.current && !commandBlocksEnabledRef.current) return;

      const buf = term.buffer.active;
      const cursorLine = buf.baseY + buf.cursorY;
      // 往回跳过 isWrapped 包裹行，记到逻辑行首行
      let pos = cursorLine - 1;
      while (pos > 0) {
        const line = buf.getLine(pos);
        if (line && line.isWrapped) { pos--; } else { break; }
      }
      if (pos < 0) return;

      // 收起/展开改写 buffer 时不要打新时间戳；摘要行不打。
      // 回车完成的行（含「空提示符出现」/「执行命令」）都用当前时刻覆盖旧戳。
      if (timestampsEnabledRef.current && !cbRewriteLockRef.current) {
        const posText = buf.getLine(pos)?.translateToString(true) || '';
        if (!isCollapseSummaryLine(posText)) {
          tsClearLine(pos);
          tsSet(term.registerMarker(pos - cursorLine), formatTerminalTimestamp());
        }
      }
      // 命令块由 gutter sync 扫描提示符决定，lineFeed 只需刷新
      if (commandBlocksEnabledRef.current && !cbRewriteLockRef.current) {
        scheduleGutterSync();
      }
    });
    const writeParsedDisposable = term.onWriteParsed(() => {
      scheduleGutterSync();
      scheduleLinkUnderlineSync();
      // 命令完成检测：仅当处于"等待命令完成"状态且不在 TUI（备用屏）时，
      // 检查光标所在行是否已回归 shell 提示符。命中则派发事件并退出等待态。
      // 提示符识别复用 isShellPromptLine；只取末行避免全量扫描。
      if (!awaitingCommandFinishRef.current || alternateBufferActiveRef.current) return;
      const buf = term.buffer.active;
      if (!buf) return;
      const lastLine = buf.getLine(buf.baseY + buf.cursorY);
      const text = lastLine ? lastLine.translateToString(true) : '';
      if (isShellPromptLine(text)) {
        awaitingCommandFinishRef.current = false;
        window.dispatchEvent(new CustomEvent('ssh-command-finished', {
          detail: { sessionId: serverIdRef.current }
        }));
      }
    });
    const bufferChangeDisposable = term.buffer.onBufferChange((buffer) => {
      syncTuiState(buffer.type === 'alternate' || screenScrollbackRef.current.active);
    });
    const wheelHandler = (e: WheelEvent) => {
      // 触控板双指滚动打断选区状态防呆：
      // 当双指滚动开始时，若由于单指先行接触残留了 isTerminalPointerDownRef 状态，
      // 且当前无物理按键按下，主动释放状态并闭合选区，防止滚动后单指滑动意外划选文字
      if (isTerminalPointerDownRef.current && (e.buttons === 0 || !(e.buttons & 1))) {
        isTerminalPointerDownRef.current = false;
        dispatchSyntheticTerminalMouseUp(e.clientX, e.clientY);
      }
      // 无论向上还是向下滚动，都检查当前位置并更新锁定状态
      requestAnimationFrame(() => {
        const buf = term.buffer.active;
        userPinned = buf.viewportY < buf.baseY;
      });
    };
    containerRef.current?.addEventListener('wheel', wheelHandler, { passive: true });

    const isClearScreenData = (d: string | Uint8Array) => {
      if (!d) return false;
      if (typeof d === 'string') return d.includes('\x1b[2J') || d.includes('\x1b[3J');
      // Binary: scan for \x1b[2J (clear) or \x1b[3J (clear scrollback)
      if (!d.includes(0x1b)) return false;
      for (let i = 0; i <= d.length - 4; i++) {
        if (d[i] === 0x1b && d[i+1] === 0x5b && (d[i+2] === 0x32 || d[i+2] === 0x33) && d[i+3] === 0x4a) {
          return true;
        }
      }
      return false;
    };
    const smartWrite = (data: string | Uint8Array) => {
      if (isClearScreenData(data)) handleClearScreen();
      // 关键字高亮：高亮开启时 onmessage 已统一解码为字符串（incomingText），这里只需处理字符串；
      // 关闭时数据为原始 string/Uint8Array，直接透传不高亮。
      let writeData = data;
      if (keywordHighlightEnabledRef.current && typeof data === 'string') {
        writeData = highlightKeywords(data, hlStateRef.current);
      }
      if (userPinned) {
        // xterm.js 在用户不在底部时已经会保持滚动位置。
        // 之前用 scrollToLine(savedY) 在异步回调中执行，会在用户向下滚动后
        // 把视图拉回旧位置，导致用户无法追上最新输出。
        // 现在仅在 xterm.js 自动滚动打断时才恢复（用相对偏移检测）。
        const buf = term.buffer.active;
        const offset = buf.baseY - buf.viewportY;
        term.write(writeData, () => {
          const newBuf = term.buffer.active;
          // 只有当 offset 变小（说明 xterm 自动滚动了）才恢复
          if (newBuf.baseY - newBuf.viewportY < offset) {
            const newY = newBuf.baseY - offset;
            if (newY >= 0) term.scrollToLine(newY);
          }
        });
      } else {
        term.write(writeData);
      }
    };
    smartWriteRef.current = smartWrite;

    // ── DOM 渲染器（WebGL 在 CJK/宽字符支持差，使用默认 DOM 渲染确保中文正常显示）──

    termRef.current    = term;
    fitAddonRef.current = fitAddon;
    window.__luminTerminalSnapshots = window.__luminTerminalSnapshots || {};
    window.__luminTerminalSnapshots[sessionId] = () => getTerminalBufferSnapshotText(termRef.current || term);

    const fitTimer = setTimeout(() => {
      try { fitAddon.fit(); } catch (_) {}
    }, 100);

    // ── 自定义快捷键 ──────────────────────────────────────────────

    // 初始化快捷键缓存（移出按键热路径，仅在首次或变更时读取）
    if (shortcutsRef.current === null) {
      let defaults: Record<string, string>;
      try {
        const saved = localStorage.getItem('appShortcuts');
        defaults = saved
          ? { ...DEFAULT_TERMINAL_SHORTCUTS, ...JSON.parse(saved) }
          : { ...DEFAULT_TERMINAL_SHORTCUTS };
      } catch (_) {
        defaults = { ...DEFAULT_TERMINAL_SHORTCUTS };
      }
      shortcutsRef.current = defaults;
    }

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;

      // 修饰键策略：macOS 上 ⌘ = UI 动作（复制/粘贴/清屏/查找），物理 ⌃ = 终端控制信号
      // （SIGINT/EOF 等，与原生终端一致，⌃V 发送 \x16 literal-next 而非粘贴）；
      // Win/Linux 上两者合一为 Ctrl。信号/清屏/选区粘贴同时匹配两种组合键。

      // 1. 获取用户自定义的快捷键配置（从 ref 缓存读取，避免热路径访问 localStorage）
      const customShortcuts: Record<string, string> = shortcutsRef.current || DEFAULT_TERMINAL_SHORTCUTS;

      // 2. 解析当前按下的组合键字符串（macOS 下主快捷键使用 ⌘ Meta，Win/Linux 下使用 Ctrl）
      const pressedStr = buildCombo(e, getModKey(e));
      // 3. 基于物理 Ctrl 键的组合键（用于终端控制信号 SIGINT/EOF 等，跨平台始终绑定物理 Ctrl；
      //    Win/Linux 上与 pressedStr 恒相同，仅 macOS 需要单独构建）
      const physicalCtrlStr = isMac ? buildCombo(e, e.ctrlKey) : pressedStr;

      // ── 自定义复制键（默认 ⌘C 或 Ctrl+C）：智能处理 ────────
      if (pressedStr === customShortcuts.copy) {
        const selection = term.getSelection();
        if (selection) {
          e.preventDefault();
          navigator.clipboard.writeText(selection);
          term.clearSelection();
          return false; // 已复制，阻止 xterm 把按键发给服务器
        }
        // 【关键】如果没有选区，则直接放行 (return true)
        // 这样在 Win/Linux 上按 Ctrl+C 能变成标准的终端中断符 (\x03) 发给服务器
        return true; 
      }

      // ── Ctrl+Shift+C：强制系统级复制，作为备用方案 ────────
      if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
        return false;
      }

      // ── 自定义粘贴键 ───────────────────────────
      if (pressedStr === customShortcuts.paste) {
        // 在 macOS 上按下 ⌘V 且使用默认粘贴配置时，放行给系统原生 paste 事件处理，避免触发 WebKit 异步剪贴板 "Paste" 提示气泡。
        // 原生路径由 xterm 的 paste 监听器处理：换行归一 + 按需 bracketed paste 包裹（多行粘贴不会逐行自动执行），
        // 并统一走 term.onData（含 normalizeTerminalPasteText 与本地回显逻辑）。
        if (isMac && e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V') && customShortcuts.paste === 'Ctrl+V') {
          return true;
        }

        // 自定义粘贴组合键无法触发系统原生 paste 事件（只有真实的 ⌘V/Ctrl+V 能），
        // 改走 Wails 运行时剪贴板读取，macOS 下同样不弹 "Paste" 气泡；浏览器 dev 回退 Clipboard API。
        e.preventDefault();
        readClipboardText().then((text) => {
          const payload = normalizeTerminalPasteText(text);
          if (payload && wsRef.current?.readyState === WebSocket.OPEN) {
            pendingCmdRef.current += payload.replace(/[\x00-\x1F\x7F]/g, '');
            wsRef.current.send(textEncoder.encode(payload));
          }
        }).catch((err) => {
          console.error('Clipboard read failed:', err);
          termRef.current?.focus();
        });
        return false;
      }

      // ── 自定义清屏键 ───────────────────────────
      if (pressedStr === customShortcuts.clear || physicalCtrlStr === customShortcuts.clear) {
        e.preventDefault();
        term.clear();
        return false;
      }

      // 新建标签页的快捷键放行给外层 App 处理
      if (pressedStr === customShortcuts.newTab) {
        return true;
      }

      // ── 查找终端缓冲区（默认 ⌘F 或 Ctrl+F）。仅匹配主快捷键：物理 ⌃F 在 macOS 上
      // 保持终端语义（readline 前进一个字符 \x06），不打开查找 ────────────────
      const findShortcut = customShortcuts.find || 'Ctrl+F';
      if (pressedStr === findShortcut) {
        e.preventDefault();
        const selection = term.getSelection();
        setShowTermSearch(true);
        if (selection && !selection.includes('\n') && selection.length <= 200) {
          setTermSearchQuery(selection);
        }
        requestAnimationFrame(() => {
          termSearchInputRef.current?.focus();
          termSearchInputRef.current?.select();
        });
        return false;
      }

      // ── 自定义控制信号（向服务器发送对应的控制字符）。
      // 同时匹配物理 Ctrl 与主修饰键组合：跨平台物理 Ctrl 始终可用，
      // macOS 上 ⌘+信号键也生效（保留旧版 ⌘ 映射 Ctrl 的肌肉记忆） ────────────────
      for (const [key, bytes] of Object.entries(TERMINAL_SIGNAL_BYTES)) {
        if (customShortcuts[key] && (physicalCtrlStr === customShortcuts[key] || pressedStr === customShortcuts[key])) {
          e.preventDefault();
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(bytes);
          }
          return false;
        }
      }

      // 已有动作优先，避免重复绑定时一次按键执行两个动作
      if (pressedStr === customShortcuts.pasteSelection || physicalCtrlStr === customShortcuts.pasteSelection) {
        e.preventDefault();
        void pasteTerminalSelectionToTerminal();
        return false;
      }

      // ── 其他标准控制字符全部透传给服务器处理 ────────────────────────
      return true;
    });

    // ── WebSocket 连接 & Predictive Local Echo ─────────────────────
    let ws: WebSocket | null = null;
    let wsConnecting = false;
    let cancelled = false;
    const pendingEchoes: string[] = [];
    let predictiveDecoder = new TextDecoder();
    let predictiveTextCarry = '';
    // 重置高亮流式解码器，避免上一次连接的残留字节污染本次输出
    hlDecoderRef.current = new TextDecoder();
    // 同步重置前景色状态：上次连接可能在颜色区间未闭合时断开（fgActive=true），
    // 不清掉会让新连接开局误判为「前景色已激活」而哑火高亮
    hlStateRef.current = createHighlightState();

    const connectWebSocket = () => {
      if (cancelled || wsConnecting || statusRef.current !== 'connected' || wsRef.current) return;
      wsConnecting = true;
      // 并行获取端口与鉴权 token，后端要求连接时通过 ?token=xxx 携带，防止本机恶意进程注入命令
      Promise.all([AppGo.GetWsPort(), AppGo.GetWsToken()]).then(([port, token]) => {
        if (cancelled || statusRef.current !== 'connected' || wsRef.current || !port || !termRef.current) return;
        const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
        const currentWs = new WebSocket(`ws://127.0.0.1:${port}/ws/${sessionId}${tokenQuery}`);
        ws = currentWs;
        currentWs.binaryType = 'arraybuffer';
        wsRef.current = currentWs;
        currentWs.onclose = () => {
          if (wsRef.current === currentWs) wsRef.current = null;
        };

      currentWs.onopen = () => {
        // 补发一次初始尺寸：终端首次 fit 发生在 onResize 订阅之前，那次
        // 尺寸变化事件被错过，本地 PTY 可能长期停留在出生尺寸；这里主动
        // 同步一次，同时给 SIGWINCH 会重绘提示符的 shell（bash/zsh）兜底自愈机会。
        if (termRef.current) {
          AppGo.ResizeTerminal(sessionId, termRef.current.cols, termRef.current.rows);
        }
      };

      currentWs.onmessage = (ev) => {
        if (!termRef.current) return;
        // 在原始数据上检测清屏序列（不依赖后续文本处理路径）
        const rawBytes = typeof ev.data === 'string' ? null : new Uint8Array(ev.data);
        // 统一解码：高亮开启时整个连接只用一个流式解码器（hlDecoderRef），
        // 避免「快速路径 / 回显过滤路径」各自持有一个解码器导致跨帧 UTF-8 失步损坏
        const incomingText = (keywordHighlightEnabledRef.current && rawBytes)
          ? hlDecoderRef.current.decode(rawBytes, { stream: true })
          : null;
        if (timestampsEnabledRef.current) {
          if (typeof ev.data === 'string' && (ev.data.includes('\x1b[2J') || ev.data.includes('\x1b[3J'))) {
            handleClearScreen();
          } else if (rawBytes && rawBytes.includes(0x1b)) {
            for (let i = 0; i <= rawBytes.length - 4; i++) {
              if (rawBytes[i] === 0x1b && rawBytes[i+1] === 0x5b && (rawBytes[i+2] === 0x32 || rawBytes[i+2] === 0x33) && rawBytes[i+3] === 0x4a) {
                handleClearScreen();
                break;
              }
            }
          }
        }

          // 检测密码提示，标记下一行输入为密码（不记入命令历史）
        if (!awaitingPasswordRef.current) {
          const probeText = incomingText ?? (typeof ev.data === 'string' ? ev.data : textDecoder.decode(ev.data));
          // ponytail: 只在最后一行像密码/验证码提示时触发（关键词 + 行尾冒号），
          // 避免 "admin password: xxx" 之类信息性输出误判，导致下一条普通命令被跳过。
          // 行尾冒号是强约束，关键词可适度放宽：覆盖 OTP/MFA/Token 等验证码提示
          const lastLine = (probeText.split(/\r?\n/).pop() || '').trim();
          if (/(password|passwd|passphrase|密码|verification|otp|token|2fa|mfa|auth.*code)/i.test(lastLine) && /[:：]\s*$/.test(lastLine)) {
            awaitingPasswordRef.current = true;
          }
        }

        const shouldFilterIncomingText = (localEchoRef.current && pendingEchoes.length > 0) || predictiveTextCarry.length > 0

        if (!shouldFilterIncomingText) {
          predictiveDecoder = new TextDecoder()
          predictiveTextCarry = ''
          smartWrite(incomingText ?? (typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data)));
          return;
        }

        let text = incomingText ?? (typeof ev.data === 'string' ? ev.data : predictiveDecoder.decode(new Uint8Array(ev.data), { stream: true }));
        if (predictiveTextCarry) {
          text = predictiveTextCarry + text;
          predictiveTextCarry = '';
        }

        const splitText = splitTrailingIncompleteEscapeSequence(text);
        predictiveTextCarry = splitText.carry;
        text = splitText.complete;
        if (!text) {
          return;
        }

        let i = 0;
        const parts = [];

        while (i < text.length) {
          // 1. 强大且健壮的 ANSI 转义序列跳过逻辑 (CSI、OSC 及其他单字符转义)
          if (text[i] === '\x1b') {
            let j = i + 1;
            if (j >= text.length) { parts.push(text[i]); i++; continue; }
            if (text[j] === '[') {
               // CSI 序列
               j++;
               while (j < text.length) {
                 const c = text.charCodeAt(j);
                 if (c >= 0x40 && c <= 0x7E) { j++; break; }
                 j++;
               }
            } else if (text[j] === ']') {
               // OSC 序列 (如 Window Title)
               j++;
               while (j < text.length) {
                 if (text[j] === '\x07') { j++; break; }
                 if (text[j] === '\x1b' && j + 1 < text.length && text[j+1] === '\\') { j += 2; break; }
                 j++;
               }
            } else {
               // 其他 ESC 序列（跳过后面一个字符）
               j++;
            }
            parts.push(text.substring(i, j));
            i = j;
            continue;
          }

          // 2. 匹配回显字符并丢弃
          if (pendingEchoes.length > 0) {
            const expected = pendingEchoes[0];
            if (text[i] === expected) {
              pendingEchoes.shift();
              i++;
              continue;
            }
            if (expected === '\x7F' && text[i] === '\b') {
              pendingEchoes.shift();
              i++;
              continue;
            }
            // 遇到非打印控制字符（如 \r, \n, \x07 等），直接放行打印，不破坏当前的预测队列
            const charCode = text.charCodeAt(i);
            if (charCode < 32 || charCode === 127) {
              parts.push(text[i]);
              i++;
              continue;
            }
          }

          // 真正的冲突（服务器发来了与预测不符的可打印字符），视为脱轨，清空队列并接受服务器输出
          pendingEchoes.length = 0;
          parts.push(text[i]);
          i++;
        }

        // 写回经过滤的文本
        const newText = parts.join('');
        smartWrite(newText);
      };

      currentWs.onerror = (e) => console.error('[Terminal] WebSocket error', e);
      }).finally(() => {
        wsConnecting = false;
      });
    };
    connectWebSocketRef.current = connectWebSocket;
    connectWebSocket();

    // ── 历史指令记录 + 输入直觉 + Local Echo ────────────────────────
    let localInputLength = 0; // 用于保护提示符，防止退格越界
    let pendingCmdReliable = true;

    term.onData((data) => {
      if ((statusRef.current === 'closed' || statusRef.current === 'error') && (data.includes('\r') || data.includes('\n'))) {
        window.dispatchEvent(new CustomEvent('ssh-reconnect-trigger', { detail: sessionId }));
        return;
      }

      // 粘贴等多字符输入：把 \\r\\n / \\n 收成单个 \\r，保证 bash 的 \\ 续行不断
      let out = data;
      if (out.length > 1 && /[\r\n]/.test(out)) {
        out = normalizeTerminalPasteText(out);
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(textEncoder.encode(out));
      }

      // ── 命令记录：优先读取终端可见缓冲区的当前行（屏幕上实际渲染、
      // 真正被 shell 执行的命令），可正确捕捉 Tab 补全 / 方向键调历史 /
      // Ctrl+R 等 shell 编辑结果；pendingCmdRef 仅在缓冲读取失败时作兜底。
      if (out.includes('\r') || out.includes('\n')) {
        if (term.buffer.active.type === 'alternate') {
          pendingCmdRef.current = '';
          return;
        }
        // 多行粘贴：只把最后一行之前的可见内容并入历史，避免把整段 paste 拆烂
        const lines = out.split(/\r/).filter((line, i, arr) => i < arr.length - 1 || line.length > 0);
        if (lines.length > 1) {
          for (const line of lines) {
            const piece = line.replace(/[\x00-\x1F\x7F]/g, '');
            if (piece) pendingCmdRef.current += (pendingCmdRef.current ? ' ' : '') + piece;
          }
        } else {
          const nlIdx = out.search(/[\r\n]/);
          if (nlIdx > 0) {
            pendingCmdRef.current += out.slice(0, nlIdx).replace(/[\x00-\x1F\x7F]/g, '');
          }
        }
        let cmd = '';
        const buf = term.buffer.active;
        let promptFilteredThisTurn = false;
        if (buf) {
          const bufLine = buf.getLine(buf.baseY + buf.cursorY);
          const text = bufLine ? bufLine.translateToString(true) : '';
          cmd = extractCommandFromBufferLine(text);
          // 含控制字符（C0 0x00-0x1F / DEL / C1 0x80-0x9F，多为 ANSI 序列残留）
          // 或交互脚本提示：视为无效，回退到逐字符累加。注意保留合法 Unicode
          // （如提示符 ❯、中文路径、emoji 参数），不再按"非 ASCII"一刀切丢弃。
          const hasControl = /[\x00-\x1F\x7F-\x9F]/.test(cmd);
          const isPrompt = isInteractivePromptText(cmd);
          if (hasControl || isPrompt) {
            promptFilteredThisTurn = true;
            cmd = '';
          }
        }
        const pending = pendingCmdRef.current.trim();
        if (!promptFilteredThisTurn) {
          if (!cmd) {
            cmd = pending;
          } else if (pendingCmdReliable && pending) {
            const c = cmd.toLowerCase(), p = pending.toLowerCase();
            if (!c.startsWith(p) && !p.startsWith(c)) cmd = '';
          }
        }
        if (!awaitingPasswordRef.current) {
          prepareScreenScrollbackRef.current(cmd);
        }
        if (!awaitingPasswordRef.current && cmd.length > 1 && !/^\d+$/.test(cmd)) {
          window.dispatchEvent(new CustomEvent('ssh-command-history', {
            detail: { sessionId: serverIdRef.current, command: cmd, time: new Date().toISOString(), source: 'input' }
          }));
        }
        // 非密码输入且提交了实际命令：进入"等待命令完成"状态，
        // 待提示符回归（onWriteParsed 检测）时派发 ssh-command-finished 事件，
        // 供文件管理器自动刷新当前目录。
        awaitingCommandFinishRef.current = !awaitingPasswordRef.current && cmd.length > 0;
        awaitingPasswordRef.current = false;
        pendingCmdRef.current = '';
        pendingCmdReliable = true;
      } else if (out === '\x7F' || out === '\b') {
        pendingCmdRef.current = pendingCmdRef.current.slice(0, -1);
      } else if (!/[\x00-\x1F\x7F]/.test(out)) {
        pendingCmdRef.current += out;
      } else if (out === '\x03' || out === '\x04') {
        pendingCmdRef.current = '';
        pendingCmdReliable = true;
        if (!screenScrollbackRef.current.active) screenScrollbackRef.current.pending = false;
        awaitingPasswordRef.current = false; // Ctrl+C/D 取消当前输入，重置密码等待状态，避免下一条普通命令被误跳过
      } else {
        pendingCmdReliable = false;
      }

      // Local Echo 逻辑 (恢复默认开启)
      if (localEchoRef.current) {
        // 如果输入中不包含控制字符（如方向键、Esc、退格等），则视作常规可见输入（支持多字符连击或粘贴）
        if (!/[\x00-\x1F\x7F]/.test(out)) {
          // 由于 JavaScript 中部分多字节字符的 length 表现，这里按照字符串常规长度累加是安全的。
          // 因为退格也是按字符来删的。
          localInputLength += out.length;
          for (let i = 0; i < out.length; i++) {
            pendingEchoes.push(out[i]);
          }
          term.write(out);
        } else if (out === '\x7F') { // Backspace
          // 仅当我们确信这是用户刚刚输入的字符时，才在本地执行退格预测。
          // 否则（localInputLength <= 0），将退格完全交还给服务器，保护提示符不被删除。
          if (localInputLength > 0) {
            localInputLength--;
            pendingEchoes.push(out);
            term.write('\b \b'); // 本地立即执行退格效果
          }
        } else if (out === '\r' || out === '\n' || out === '\r\n' || (out.length > 1 && /[\r\n]/.test(out))) {
          localInputLength = 0;
        } else {
          // 遇到方向键、Ctrl快捷键（如 Ctrl+C/D/Z）等控制符，
          // 立刻清零预测输入长度，安全退回到服务器渲染模式
          localInputLength = 0;
        }
      }

    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      AppGo.ResizeTerminal(sessionId, cols, rows);
      scheduleGutterSync();
      scheduleLinkUnderlineSync();
    });
    // 首帧同步常驻下划线
    scheduleLinkUnderlineSync();

    return () => {
      cancelled = true;
      if (connectWebSocketRef.current === connectWebSocket) connectWebSocketRef.current = null;
      scrollDisposable.dispose();
      lineFeedDisposable.dispose();
      writeParsedDisposable.dispose();
      bufferChangeDisposable.dispose();
      screenAltModeSetDisposable.dispose();
      screenAltModeResetDisposable.dispose();
      resizeDisposable.dispose();
      try { linkProviderDisposable.dispose(); } catch (_) {}
      try { searchResultsDisposable.dispose(); } catch (_) {}
      try { searchAddon.dispose(); } catch (_) {}
      if (gutterSyncRAFRef.current !== null) {
        cancelAnimationFrame(gutterSyncRAFRef.current);
        gutterSyncRAFRef.current = null;
      }
      if (linkUnderlineSyncRAFRef.current !== null) {
        cancelAnimationFrame(linkUnderlineSyncRAFRef.current);
        linkUnderlineSyncRAFRef.current = null;
      }
      if (linkUnderlineLayerRef.current) linkUnderlineLayerRef.current.innerHTML = '';
      clearTimeout(fitTimer);
      if (vpEl) vpEl.removeEventListener('scroll', onTermScroll);
      // 移除 wheel 监听器，避免内存泄漏
      containerRef.current?.removeEventListener('wheel', wheelHandler);
      if (ws) { try { ws.close(); } catch (_) {} }
      if (wsRef.current === ws) wsRef.current = null;
      tsClear(); // 清理时间戳
      cbClear(); // 清理命令块边框
      if (window.__luminTerminalSnapshots?.[sessionId]) {
        delete window.__luminTerminalSnapshots[sessionId];
      }
      smartWriteRef.current = null;
      screenScrollbackRef.current.pending = false;
      screenScrollbackRef.current.active = false;
      prepareScreenScrollbackRef.current = () => {};
      alternateBufferActiveRef.current = false;
      termRef.current     = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      // xterm Viewport 构造里 setTimeout(syncScrollArea) 无句柄；StrictMode 先 dispose 再触发会读空 renderer.dimensions
      // 延后 dispose，让该 setTimeout 先跑完（同队列 FIFO）
      const termToDispose = term;
      setTimeout(() => {
        try { termToDispose.dispose(); } catch (_) {}
      }, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, wsRebuildKey]);

  // ── 监听字体大小修改事件 ──────────────────────────────────────
  useEffect(() => {
    const handleFontSizeChange = (e: Event) => {
      if (termRef.current) {
        termRef.current.options.fontSize = (e as CustomEvent<number>).detail;
        if (fitAddonRef.current) {
          try { fitAddonRef.current.fit(); } catch (_) {}
        }
        scheduleGutterSync();
      }
    };
    window.addEventListener('terminal-font-size-changed', handleFontSizeChange);
    return () => window.removeEventListener('terminal-font-size-changed', handleFontSizeChange);
  }, []);

  // SSH/本地/串口断开时终端组件会保活以保留输出；单独关闭 WS，释放
  // 浏览器连接和 Go ReadMessage goroutine。重连后只重建 WS，不重建 xterm。
  useEffect(() => {
    if (status === 'closed' || status === 'error') {
      screenScrollbackRef.current.pending = false;
      screenScrollbackRef.current.active = false;
      const actualAlternate = termRef.current?.buffer.active.type === 'alternate';
      alternateBufferActiveRef.current = actualAlternate;
      setAlternateBufferActive(actualAlternate);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
      return;
    }
    if (status === 'connected') {
      connectWebSocketRef.current?.();
    }
  }, [status]);

  // ── 状态变化提示 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current) return;
    const sw = smartWriteRef.current;
    if (status === 'error') {
      sw ? sw('\r\n\x1b[31m✗ ' + t('连接失败') + '\x1b[0m\r\n') : termRef.current.write('\r\n\x1b[31m✗ ' + t('连接失败') + '\x1b[0m\r\n');
    } else if (status === 'closed') {
      sw ? sw('\r\n\x1b[33m⚠ ' + t('已断开') + '\x1b[0m\r\n') : termRef.current.write('\r\n\x1b[33m⚠ ' + t('已断开') + '\x1b[0m\r\n');
    }
  }, [status]);

  // ── 监听容器大小变化进行自适应 ───────────────────────────────────
  useEffect(() => {
    if (!isActive || !containerRef.current || !fitAddonRef.current || !termRef.current) return;

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!termRef.current || !fitAddonRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = termRef.current;
          AppGo.ResizeTerminal(sessionId, cols, rows);
        } catch (e) {
          console.error('[Terminal] Resize error:', e);
        }
      }, 50);
    });

    observer.observe(containerRef.current);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [isActive, sessionId]);

  // ── 终端切换回来时，重新 fit ────────────────────────────────────
  useEffect(() => {
    if (!isActive || !termRef.current || !fitAddonRef.current) return;
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    const raf = requestAnimationFrame(() => {
      try {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          fitAddon.fit();
          const { cols, rows } = term;
          AppGo.ResizeTerminal(sessionId, cols, rows);
        }
      } catch (e) {
        console.error('[Terminal] activate fit error:', e);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, sessionId]);

  const getTerminalBufferCellPositionFromMouseEvent = useCallback((event: React.MouseEvent, isSelection = false) => {
    const term = termRef.current;
    const container = containerRef.current;
    if (!term?.buffer?.active || !container || typeof window === 'undefined') {
      return null;
    }
    const screen = container.querySelector('.xterm-screen');
    if (!screen) {
      return null;
    }
    const rect = screen.getBoundingClientRect();
    if (!rect.width || !rect.height || !term.cols || !term.rows) {
      return null;
    }
    const style = window.getComputedStyle(screen);
    const leftPadding = parseInt(style.getPropertyValue('padding-left'), 10) || 0;
    const topPadding = parseInt(style.getPropertyValue('padding-top'), 10) || 0;
    const cellWidth = rect.width / term.cols;
    const cellHeight = rect.height / term.rows;
    if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) {
      return null;
    }
    const relativeX = event.clientX - rect.left - leftPadding;
    const relativeY = event.clientY - rect.top - topPadding;
    let x = Math.ceil((relativeX + (isSelection ? cellWidth / 2 : 0)) / cellWidth);
    let viewportRow = Math.ceil(relativeY / cellHeight);
    x = Math.min(Math.max(x, 1), term.cols + (isSelection ? 1 : 0)) - 1;
    viewportRow = Math.min(Math.max(viewportRow, 1), term.rows) - 1;
    return {
      x,
      y: term.buffer.active.viewportY + viewportRow,
    };
  }, []);

  const isTerminalBufferCellWithinRange = useCallback((position: { x: number; y: number } | null, range: IBufferRange | null | undefined) => {
    if (!position || !range?.start || !range?.end) {
      return false;
    }
    return (position.y > range.start.y && position.y < range.end.y)
      || (range.start.y === range.end.y && position.y === range.start.y && position.x >= range.start.x && position.x < range.end.x)
      || (range.start.y < range.end.y && position.y === range.end.y && position.x < range.end.x)
      || (range.start.y < range.end.y && position.y === range.start.y && position.x >= range.start.x);
  }, []);

  const copyTerminalSelectionText = useCallback((text: string) => {
    if (!text) {
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      termRef.current?.focus();
    }).catch((err) => {
      console.error('Failed to write clipboard:', err);
      termRef.current?.focus();
    });
  }, []);

  const pasteClipboardToTerminal = useCallback(() => {
    // 走 Wails 运行时读取剪贴板：右键/菜单粘贴没有 keydown 可放行成原生 paste 事件，
    // macOS 下 navigator.clipboard.readText() 会弹 "Paste" 提示气泡（issue #263）
    readClipboardText().then((text) => {
      const payload = normalizeTerminalPasteText(text);
      if (payload && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        pendingCmdRef.current += payload.replace(/[\x00-\x1F\x7F]/g, '');
        wsRef.current.send(textEncoder.encode(payload));
      }
      termRef.current?.focus();
    }).catch((err) => {
      console.error('Failed to read clipboard:', err);
      termRef.current?.focus();
    });
  }, []);

  const pasteTerminalSelectionToTerminal = useCallback(async () => {
    const term = termRef.current;
    const selectedText = term?.getSelection?.() || '';
    if (!selectedText || !term) {
      term?.focus();
      return;
    }

    const lineCount = selectedText.replace(/\r\n?/g, '\n').split('\n').length;
    if (lineCount > 3 && localStorage.getItem('skipTerminalSelectionPasteConfirm') !== 'true') {
      const result = await window.luminDialog?.confirm(
        t('所选内容超过3行，是否继续粘贴？'),
        t('确认粘贴'),
        t('不再询问')
      );
      const confirmed = typeof result === 'object' ? result.confirmed : result === true;
      if (!confirmed) {
        term.focus();
        return;
      }
      if (typeof result === 'object' && result.checked) {
        localStorage.setItem('skipTerminalSelectionPasteConfirm', 'true');
      }
    }

    const payload = normalizeTerminalPasteText(selectedText);
    if (payload && wsRef.current?.readyState === WebSocket.OPEN) {
      pendingCmdRef.current += payload.replace(/[\x00-\x1F\x7F]/g, '');
      wsRef.current.send(textEncoder.encode(payload));
      term.clearSelection();
    }
    term.focus();
  }, [t]);

  const handleTerminalMouseDownCapture = useCallback((event: React.MouseEvent) => {
    if (event.button === 0) {
      isTerminalPointerDownRef.current = true;
    }
    if (event.button !== 0 || !terminalLeftClickCopyOnSelectionRef.current) {
      terminalMouseDownSelectionRef.current = null;
      return;
    }
    const mode = terminalLeftClickCopyOnSelectionModeRef.current === 'mouseup' ? 'mouseup' : 'click';
    if (mode === 'mouseup') {
      terminalMouseDownSelectionRef.current = {
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      return;
    }
    const term = termRef.current;
    const text = term?.getSelection?.() || '';
    const range = term?.getSelectionPosition?.();
    const position = getTerminalBufferCellPositionFromMouseEvent(event, true);
    if (!text || !range || !position || !isTerminalBufferCellWithinRange(position, range)) {
      terminalMouseDownSelectionRef.current = null;
      return;
    }
    terminalMouseDownSelectionRef.current = {
      mode,
      text,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }, [getTerminalBufferCellPositionFromMouseEvent, isTerminalBufferCellWithinRange]);

  const handleTerminalMouseUpCapture = useCallback((event: React.MouseEvent) => {
    if (event.button === 0) {
      isTerminalPointerDownRef.current = false;
    }
    const snapshot = terminalMouseDownSelectionRef.current;
    terminalMouseDownSelectionRef.current = null;
    if (event.button !== 0 || !terminalLeftClickCopyOnSelectionRef.current || !snapshot) {
      return;
    }
    const deltaX = Math.abs(event.clientX - snapshot.startClientX);
    const deltaY = Math.abs(event.clientY - snapshot.startClientY);
    if (snapshot.mode === 'mouseup') {
      if (deltaX <= 4 && deltaY <= 4) {
        return;
      }
      requestAnimationFrame(() => {
        const text = termRef.current?.getSelection?.() || '';
        if (!text) {
          return;
        }
        copyTerminalSelectionText(text);
      });
      return;
    }
    if (deltaX > 4 || deltaY > 4) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    copyTerminalSelectionText(snapshot.text ?? '');
  }, [copyTerminalSelectionText]);

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      // macOS WKWebView / 触控板手势丢失 mouseup 防呆：
      // 当物理上没有按键处于按下状态（buttons === 0 或未按左键），但终端仍记录着按下状态时，
      // 说明上一次 mousedown 对应的 mouseup 已丢失。主动派发合成 mouseup 闭合 xterm 拖拽选区状态机。
      if (isTerminalPointerDownRef.current && (event.buttons === 0 || !(event.buttons & 1))) {
        isTerminalPointerDownRef.current = false;
        dispatchSyntheticTerminalMouseUp(event.clientX, event.clientY);
      }
    };

    const handleWindowMouseUp = (event: MouseEvent) => {
      if (event.button === 0) {
        isTerminalPointerDownRef.current = false;
      }
      const snapshot = terminalMouseDownSelectionRef.current;
      if (event.button !== 0 || !terminalLeftClickCopyOnSelectionRef.current || !snapshot || snapshot.mode !== 'mouseup') {
        return;
      }
      terminalMouseDownSelectionRef.current = null;
      const deltaX = Math.abs(event.clientX - snapshot.startClientX);
      const deltaY = Math.abs(event.clientY - snapshot.startClientY);
      if (deltaX <= 4 && deltaY <= 4) {
        return;
      }
      requestAnimationFrame(() => {
        const text = termRef.current?.getSelection?.() || '';
        if (!text) {
          return;
        }
        copyTerminalSelectionText(text);
      });
    };

    const handleWindowPointerCancel = () => {
      if (isTerminalPointerDownRef.current) {
        isTerminalPointerDownRef.current = false;
        dispatchSyntheticTerminalMouseUp();
      }
    };

    const handleWindowBlur = () => {
      // 失焦常意味着按键最终在 WebView 之外释放（mouseup 不会送达），xterm 仍卡在拖选态。
      // 若只清 isTerminalPointerDownRef，检测基准被清空后这个卡死态将永远无法被发现，划动又会拖选；
      // 因此失焦时同样派发合成 mouseup 闭合它。快照需先清，避免合成 mouseup 冒泡触发 mouseup 模式的复制。
      const wasPointerDown = isTerminalPointerDownRef.current;
      isTerminalPointerDownRef.current = false;
      terminalMouseDownSelectionRef.current = null;
      if (wasPointerDown) {
        dispatchSyntheticTerminalMouseUp();
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove, { capture: true, passive: true });
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);
    window.addEventListener('dragend', handleWindowPointerCancel);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove, true);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
      window.removeEventListener('dragend', handleWindowPointerCancel);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [copyTerminalSelectionText]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setLinkMenu(null);
    const hasSelection = !!(termRef.current && termRef.current.getSelection());
    const rightClickPasteMode = terminalRightClickPasteModeRef.current === 'always' ? 'always' : 'empty';
    if (terminalRightClickPasteOnEmptyRef.current && (rightClickPasteMode === 'always' || !hasSelection)) {
      pasteClipboardToTerminal();
      return;
    }
    setContextHasSelection(hasSelection);
    setContextMenu({ x: e.clientX, y: e.clientY, source: 'terminal' });
  };

  const handleInputContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLinkMenu(null);
    const input = cmdInputRef.current;
    const hasSelection = !!input && (input.selectionStart ?? 0) !== (input.selectionEnd ?? 0);
    setContextHasSelection(hasSelection);
    setContextMenu({ x: e.clientX, y: e.clientY, source: 'input' });
  };

  const closeContextMenu = () => {
    if (contextMenu) setContextMenu(null);
  };

  const closeLinkMenu = () => {
    if (linkMenu) setLinkMenu(null);
  };

  const getTermSearchOptions = useCallback((incremental = false) => ({
    caseSensitive: termSearchCaseSensitive,
    incremental,
    // 高亮跟终端底色走，不跟界面 light/dark 走（浅色 UI + 深色终端时用深色方案）
    decorations: getTermSearchDecorations(T),
  }), [termSearchCaseSensitive, themeToggle, T]);

  const openTermSearch = useCallback((seedText?: string) => {
    setShowTermSearch(true);
    if (typeof seedText === 'string' && seedText && !seedText.includes('\n') && seedText.length <= 200) {
      setTermSearchQuery(seedText);
    } else {
      const selection = termRef.current?.getSelection?.();
      if (selection && !selection.includes('\n') && selection.length <= 200) {
        setTermSearchQuery(selection);
      }
    }
    requestAnimationFrame(() => {
      termSearchInputRef.current?.focus();
      termSearchInputRef.current?.select();
    });
  }, []);

  const closeTermSearch = useCallback(() => {
    setShowTermSearch(false);
    setTermSearchResult({ resultIndex: -1, resultCount: 0 });
    try { searchAddonRef.current?.clearDecorations(); } catch (_) {}
    termRef.current?.focus();
  }, []);

  const findTermNext = useCallback((incremental = false) => {
    const addon = searchAddonRef.current;
    const query = termSearchQuery;
    if (!addon || !query) {
      setTermSearchResult({ resultIndex: -1, resultCount: 0 });
      return;
    }
    addon.findNext(query, getTermSearchOptions(incremental));
  }, [getTermSearchOptions, termSearchQuery]);

  const findTermPrevious = useCallback(() => {
    const addon = searchAddonRef.current;
    const query = termSearchQuery;
    if (!addon || !query) {
      setTermSearchResult({ resultIndex: -1, resultCount: 0 });
      return;
    }
    addon.findPrevious(query, getTermSearchOptions(false));
  }, [getTermSearchOptions, termSearchQuery]);

  // 查找栏打开后：输入变化 / 大小写切换 / 主题切换 → 清旧装饰再搜（避免浅深色装饰残留）
  useEffect(() => {
    if (!showTermSearch) return;
    if (!termSearchQuery) {
      try { searchAddonRef.current?.clearDecorations(); } catch (_) {}
      setTermSearchResult({ resultIndex: -1, resultCount: 0 });
      return;
    }
    try { searchAddonRef.current?.clearDecorations(); } catch (_) {}
    findTermNext(true);
  }, [showTermSearch, termSearchQuery, termSearchCaseSensitive, themeToggle, findTermNext]);

  // 终端聚焦时 Ctrl+F；输入栏等区域同样可用
  useEffect(() => {
    if (!isActive) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const pressedStr = buildCombo(e, getModKey(e));
      const findShortcut = shortcutsRef.current?.find || 'Ctrl+F';
      if (pressedStr !== findShortcut) return;
      const activeEl = document.activeElement;
      const inWrapper = !!(wrapperRef.current && (
        wrapperRef.current.contains(activeEl)
        || wrapperRef.current.contains(e.target as Node | null)
      ));
      // xterm 辅助 textarea 有时不在 wrapper 内层级判断里，再兜一层
      const inXterm = !!(activeEl?.classList?.contains('xterm-helper-textarea')
        || (e.target as Element | null)?.classList?.contains('xterm-helper-textarea'));
      if (!inWrapper && !inXterm) return;
      e.preventDefault();
      e.stopPropagation();
      openTermSearch();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isActive, openTermSearch]);

  const openExternalUrl = (url: string) => {
    if (!url) return;
    if (typeof window.runtime?.BrowserOpenURL === 'function') {
      window.runtime.BrowserOpenURL(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleLinkMenuAction = (action: string) => {
    const url = linkMenu?.url || '';
    closeLinkMenu();
    if (!url) return;
    if (action === 'copy') {
      navigator.clipboard.writeText(url).then(() => {
        setLinkToast(t('链接已复制'));
        setTimeout(() => setLinkToast(''), 1500);
      }).catch(() => {});
      termRef.current?.focus();
      return;
    }
    if (action === 'open') {
      openExternalUrl(url);
      termRef.current?.focus();
    }
  };

  // 点击外部关闭右键菜单 / 链接菜单（[role="menu"] 为 ui/ContextMenu 菜单项容器）
  useEffect(() => {
    if (!contextMenu && !linkMenu) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('.context-menu, [role="menu"]')) return;
      setContextMenu(null);
      setLinkMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, linkMenu]);

  const handleMenuAction = (action: string) => {
    const contextSource = contextMenu?.source || 'terminal';
    closeContextMenu();

    if (contextSource === 'input') {
      const input = cmdInputRef.current;
      if (!input) return;
      const value = input.value || '';
      const selectionStart = input.selectionStart ?? 0;
      const selectionEnd = input.selectionEnd ?? selectionStart;
      const selectedText = selectionEnd > selectionStart ? value.slice(selectionStart, selectionEnd) : '';

      switch (action) {
        case 'cut': {
          if (!selectedText) {
            input.focus();
            return;
          }
          navigator.clipboard.writeText(selectedText).catch(() => {});
          const nextValue = `${value.slice(0, selectionStart)}${value.slice(selectionEnd)}`;
          setCmdInput(nextValue);
          requestAnimationFrame(() => {
            if (!cmdInputRef.current) return;
            cmdInputRef.current.focus();
            cmdInputRef.current.setSelectionRange(selectionStart, selectionStart);
            syncCommandInputHeight();
            if (nextValue.trim()) {
              commandAutocompleteFocusedRef.current = true;
              scheduleCommandAutocompleteSuggestions(nextValue);
            } else {
              closeCommandAutocomplete();
            }
          });
          break;
        }
        case 'copy':
          if (selectedText) {
            navigator.clipboard.writeText(selectedText).catch(() => {});
          }
          input.focus();
          break;
        case 'paste':
          readClipboardText().then((text) => {
            const insertText = String(text || '');
            const nextValue = `${value.slice(0, selectionStart)}${insertText}${value.slice(selectionEnd)}`;
            const nextCaret = selectionStart + insertText.length;
            setCmdInput(nextValue);
            requestAnimationFrame(() => {
              if (!cmdInputRef.current) return;
              cmdInputRef.current.focus();
              cmdInputRef.current.setSelectionRange(nextCaret, nextCaret);
              syncCommandInputHeight();
              if (nextValue.trim()) {
                commandAutocompleteFocusedRef.current = true;
                scheduleCommandAutocompleteSuggestions(nextValue);
              } else {
                closeCommandAutocomplete();
              }
            });
          }).catch((err) => {
            console.error('Failed to read clipboard:', err);
            input.focus();
          });
          break;
        case 'selectAll':
          requestAnimationFrame(() => {
            cmdInputRef.current?.focus();
            cmdInputRef.current?.select();
          });
          break;
        default:
          input.focus();
          break;
      }
      return;
    }

    if (!termRef.current) return;
    switch (action) {
      case 'copy': {
        const selectedText = termRef.current.getSelection();
        if (selectedText) {
          navigator.clipboard.writeText(selectedText);
          termRef.current.clearSelection();
        }
        termRef.current.focus();
        break;
      }
      case 'paste':
        pasteClipboardToTerminal();
        break;
      case 'pasteSelection':
        void pasteTerminalSelectionToTerminal();
        break;
      case 'sendToAssistant': {
        const selectedText = termRef.current.getSelection();
        if (selectedText) {
          window.dispatchEvent(new CustomEvent('ai-terminal-send-to-assistant', {
            detail: {
              sessionId: serverIdRef.current,
              terminalId: sessionId,
              text: selectedText,
            },
          }));
          termRef.current.clearSelection();
        }
        termRef.current.focus();
        break;
      }
      case 'clear':
        termRef.current.clear();
        termRef.current.focus();
        break;
      case 'selectAll':
        termRef.current.selectAll();
        termRef.current.focus();
        break;
      case 'find': {
        const selectedText = termRef.current.getSelection();
        openTermSearch(selectedText || undefined);
        break;
      }
      default:
        termRef.current.focus();
        break;
    }
  };

  const isConnected  = status === 'connected';
  const isConnecting = status === 'connecting';
  const isError      = status === 'error';
  const isClosed     = status === 'closed';
  const statusColor  = isConnected ? 'var(--success)' : isConnecting ? 'var(--warning)' : isError ? 'var(--danger)' : 'var(--text-tertiary)';
  const cmdTrimmed   = cmdInput.trim();

  // 命令条搜索：收起时一并清空关键词，避免留下不可见的过滤条件
  const closeQuickCmdSearch = useCallback(() => {
    setQuickCmdSearchOpen(false);
    setQuickCmdSearch('');
  }, []);

  // 命令条搜索：按名称/命令/分组过滤，大小写不敏感
  const filteredQuickCmdItems = useMemo(() => {
    const kw = quickCmdSearch.trim().toLowerCase();
    if (!kw) return quickCmdBarItems;
    return quickCmdBarItems.filter((item) => (
      item.name.toLowerCase().includes(kw)
      || item.command.toLowerCase().includes(kw)
      || (item.groupPath || '').toLowerCase().includes(kw)
    ));
  }, [quickCmdBarItems, quickCmdSearch]);
  const [multiLineWrapEnabled, setMultiLineWrapEnabled] = useState(() => localStorage.getItem('terminalMultiLineWrapEnabled') !== 'false');

  const syncCommandInputHeight = useCallback(() => {
    const element = cmdInputRef.current
    if (!element) return
    element.style.height = '36px'
    element.style.overflowY = 'hidden'
    element.scrollTop = 0
    if (!element.value) {
      return
    }
    const scrollHeight = Math.max(element.scrollHeight, 36)
    const nextHeight = Math.min(scrollHeight, 132)
    element.style.height = `${nextHeight}px`
    if (scrollHeight > 132) {
      element.style.overflowY = 'auto'
    }
  }, [])

  const toggleMultiLineWrap = useCallback(() => {
    setMultiLineWrapEnabled((previous) => {
      const next = !previous
      localStorage.setItem('terminalMultiLineWrapEnabled', next ? 'true' : 'false')
      return next
    })
    requestAnimationFrame(() => {
      cmdInputRef.current?.focus()
      syncCommandInputHeight()
    })
  }, [syncCommandInputHeight])

  // 连接成功时触发一次性涟漪动画
  useEffect(() => {
    if (isConnected) {
      setJustConnected(true);
      const timer = setTimeout(() => setJustConnected(false), 1400);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  // ── 底部命令输入栏逻辑 ──────────────────────────────────────

  const scrollOnNextUpdate = useRef(false);
  // 加载请求序号：快速切换模式/服务器时丢弃旧结果，避免倒灌
  const historyLoadSeqRef = useRef(0);

  // 弹窗打开/切换模式/收到变更事件时加载历史数据
  const reloadHistoryList = useCallback(() => {
    if (!showHistory) return;
    const seq = ++historyLoadSeqRef.current;
    scrollOnNextUpdate.current = true;
    (async () => {
      try {
        const raw = historyMode === 'global'
          ? await AppGo.GetGlobalCommandHistory()
          : await AppGo.GetCommandHistory(historyServerId);
        if (seq !== historyLoadSeqRef.current) return;
        const entries = JSON.parse(raw);
        const arr = Array.isArray(entries) ? entries : [];
        setHistoryList(arr);
        // 数据为空则无需滚动，直接清空列表
        if (arr.length === 0) scrollOnNextUpdate.current = false;
      } catch {
        if (seq !== historyLoadSeqRef.current) return;
        setHistoryList([]);
        scrollOnNextUpdate.current = false;
      }
    })();
  }, [showHistory, historyMode, historyServerId]);

  useEffect(() => {
    if (!showHistory) return;
    reloadHistoryList();
  }, [showHistory, reloadHistoryList]);

  // 监听清空/变更事件：按作用域刷新弹窗列表
  // - 全局清空/变更：仅当前为全局模式时刷新
  // - 服务器清空/变更：仅当前为服务器模式且目标服务器匹配时刷新
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ scope?: string; historyServerId?: string }>).detail;
      const scope = d?.scope || 'server';
      if (scope !== historyMode) return;
      if (scope === 'server' && d?.historyServerId && d.historyServerId !== historyServerId) return;
      reloadHistoryList();
    };
    window.addEventListener('ssh-history-cleared', handler);
    window.addEventListener('ssh-history-changed', handler);
    return () => {
      window.removeEventListener('ssh-history-cleared', handler);
      window.removeEventListener('ssh-history-changed', handler);
    };
  }, [showHistory, historyMode, historyServerId, reloadHistoryList]);

  // 数据渲染后定位到底部，默认选中最新一项
  useEffect(() => {
    if (!showHistory || !scrollOnNextUpdate.current) return;
    // 数据还没加载完（空状态），等待下一次更新
    if (historyList.length === 0) return;
    const el = historyScrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    scrollOnNextUpdate.current = false;
  }, [historyList, showHistory]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return historyList;
    const q = searchQuery.toLowerCase();
    return historyList.filter(item => item.command.toLowerCase().includes(q));
  }, [historyList, searchQuery]);

  // 反转后用于显示：最早的在上边，最新的在底部
  const displayHistory = useMemo(() => [...filteredHistory].reverse(), [filteredHistory]);

  useEffect(() => {
    setHistorySelectedIndex(displayHistory.length - 1);
  }, [displayHistory, showHistory]);

  useEffect(() => {
    if (!showHistory || historySelectedIndex < 0) return;
    const selectedRow = historyScrollRef.current?.querySelector(`[data-history-index="${historySelectedIndex}"]`);
    selectedRow?.scrollIntoView({ block: 'nearest' });
  }, [historySelectedIndex, showHistory, displayHistory]);

  const handleHistorySearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setShowHistory(false);
      setHistoryPopupPos(null);
      requestAnimationFrame(() => cmdInputRef.current?.focus());
      return;
    }
    if (displayHistory.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHistorySelectedIndex((current) => (current + 1) % displayHistory.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHistorySelectedIndex((current) => (
        current <= 0 ? displayHistory.length - 1 : current - 1
      ));
      return;
    }
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const selectedItem = displayHistory[historySelectedIndex] || displayHistory[0];
      if (selectedItem) selectHistoryCmd(selectedItem.command);
    }
  };

  const toggleHistory = () => {
    const willShow = !showHistory;
    if (willShow) {
      // 数据加载由 useEffect(showHistory) 负责
      const rect = historyBtnRef.current?.getBoundingClientRect();
      if (rect) {
        setHistoryPopupPos({
          left: Math.max(8, Math.min(rect.right - 480, window.innerWidth - 490)),
          bottom: window.innerHeight - rect.top + 4,
        });
      }
      // 历史弹窗是浮动层，不再收起底部快捷命令面板
    } else {
      setHistoryPopupPos(null);
    }
    setShowHistory(willShow);
  };

  const openHistoryAndFocusSearch = () => {
    if (!showHistory) toggleHistory();
    requestAnimationFrame(() => {
      historySearchInputRef.current?.focus({ preventScroll: true });
      historySearchInputRef.current?.select();
    });
  };

  const toggleCommands = () => {
    const willShow = !showCommands;
    if (willShow) {
      if (showHistory) { setShowHistory(false); setHistoryPopupPos(null); }
      onQuickCommandsOpenChange?.(true);
      return;
    }
    // 关闭面板时检查是否有未保存的修改
    if (quickCmdsRef?.current?.isDirty?.()) {
      quickCmdsRef.current?.showCloseConfirm();
      return; // 让 onClose 回调来关闭
    }
    onQuickCommandsOpenChange?.(false);
  };

  const selectHistoryCmd = (cmd: string) => {
    setCmdInput(cmd);
    setShowHistory(false);
    setHistoryPopupPos(null);
    cmdInputRef.current?.focus();
  };

  const executeCommand = (directCmd?: string) => {
    const rawCommand = directCmd ?? cmdInput;
    if (!isConnected) {
      if (isClosed || isError) {
        window.dispatchEvent(new CustomEvent('ssh-reconnect-trigger', { detail: sessionId }));
      }
      return;
    }
    const normalizedText = String(rawCommand ?? '').replace(/\r\n?/g, '\n');
    const text = normalizedText.trim();
    const isBlankSubmit = !text;
    const lineCount = normalizedText.split('\n').length;
    const finalPayload = isBlankSubmit
      ? '\r'
      : multiLineWrapEnabled && lineCount > 1
        ? buildWrappedMultiLineCommand(normalizedText)
        : text + '\r';
    prepareScreenScrollbackRef.current(text);
    AppGo.WriteTerminal(sessionId, finalPayload).catch((err) => {
      console.error('WriteTerminal failed:', err);
    });
    termRef.current?.scrollToBottom();
    if (!isBlankSubmit && text.length > 1 && !/^\d+$/.test(text) && !isInteractivePromptText(text) && !awaitingPasswordRef.current) {
      window.dispatchEvent(new CustomEvent('ssh-command-history', {
        detail: { sessionId: serverId, command: text, time: new Date().toISOString(), source: 'input' }
      }));
    }
    awaitingPasswordRef.current = false;
    // 快捷命令/输入框提交：与 onData 回车路径一致，进入等待命令完成状态
    awaitingCommandFinishRef.current = !isBlankSubmit && text.length > 0;
    setCmdInput('');
    setShowHistory(false);
    setHistoryPopupPos(null);
  };

  const copyCommand = () => {
    if (!cmdTrimmed) return;
    navigator.clipboard.writeText(cmdInput).catch(() => {});
  };

  // ── 快捷命令条：点按钮先弹确认框（对齐安卓端 QuickCommandConfirmDialog） ──
  const openQuickCmdConfirm = (item: FlattenedQuickCommand) => {
    if (!item?.command) return;
    const values: Record<string, string> = {};
    const history = quickCmdParamHistoryRef.current[item.command] || {};
    extractQuickCommandParams(item.command).forEach((p) => { values[p.num] = history[p.num]?.[0] || ''; });
    setPendingQuickCmd({ item, values });
  };

  // 确认后发送：addCR 语义对齐安卓端 sendQuickCommand
  const sendQuickCmdConfirmed = () => {
    const pending = pendingQuickCmd;
    if (!pending || !isConnected) return;
    const filled = fillQuickCommandParams(pending.item.command, pending.values);
    const text = filled.replace(/\r\n?/g, '\n').trim();
    if (!text) return;
    const nextParamHistory: QuickCommandParamHistory = {
      ...quickCmdParamHistoryRef.current,
      [pending.item.command]: { ...(quickCmdParamHistoryRef.current[pending.item.command] || {}) },
    };
    Object.entries(pending.values).forEach(([num, value]) => {
      if (!value) return;
      const values = nextParamHistory[pending.item.command][num] || [];
      nextParamHistory[pending.item.command][num] = [value, ...values.filter((entry) => entry !== value)].slice(0, 20);
    });
    const normalizedParamHistory = normalizeQuickCommandParamHistory(nextParamHistory);
    quickCmdParamHistoryRef.current = normalizedParamHistory;
    setQuickCmdParamHistory(normalizedParamHistory);
    AppGo.SaveParamHistory(JSON.stringify(normalizedParamHistory)).catch(() => {});
    setPendingQuickCmd(null);
    const lineCount = text.split('\n').length;
    const payload = pending.item.addCR === false
      ? text
      : multiLineWrapEnabled && lineCount > 1
        ? buildWrappedMultiLineCommand(text)
        : text + '\r';
    if (pending.item.addCR !== false) {
      prepareScreenScrollbackRef.current(text);
    }
    AppGo.WriteTerminal(sessionId, payload).catch((err) => {
      console.error('WriteTerminal failed:', err);
    });
    termRef.current?.scrollToBottom();
    if (text.length > 1 && !/^\d+$/.test(text) && !isInteractivePromptText(text)) {
      window.dispatchEvent(new CustomEvent('ssh-command-history', {
        detail: { sessionId: serverId, command: text, time: new Date().toISOString(), source: 'input' }
      }));
    }
    awaitingPasswordRef.current = false;
    awaitingCommandFinishRef.current = pending.item.addCR !== false;
  };

  const deleteHistoryItem = async (id: string) => {
    const scope = historyMode;
    try {
      const next = historyListRef.current.filter(item => item.id !== id);
      if (scope === 'global') {
        await AppGo.SaveGlobalCommandHistory(JSON.stringify(next));
      } else {
        await AppGo.SaveCommandHistory(historyServerId, JSON.stringify(next));
      }
      setHistoryList(next);
      // 通知历史页 / 自动补全刷新，避免继续显示已删除条目
      window.dispatchEvent(new CustomEvent('ssh-history-changed', {
        detail: { sessionId: serverId, historyServerId, scope }
      }));
    } catch (error) {
      console.error('[Terminal] 删除历史失败:', error);
    }
  };

  const clearCommandAutocompleteDebounce = useCallback(() => {
    if (commandAutocompleteDebounceRef.current) {
      clearTimeout(commandAutocompleteDebounceRef.current);
      commandAutocompleteDebounceRef.current = null;
    }
  }, []);

  const clearCommandAutocompleteBlurTimer = useCallback(() => {
    if (commandAutocompleteBlurTimerRef.current) {
      clearTimeout(commandAutocompleteBlurTimerRef.current);
      commandAutocompleteBlurTimerRef.current = null;
    }
  }, []);

  const closeCommandAutocomplete = useCallback(() => {
    commandAutocompleteRequestRef.current += 1;
    commandAutocompleteKeyboardNavigationRef.current = false;
    clearCommandAutocompleteDebounce();
    clearCommandAutocompleteBlurTimer();
    setCommandAutocompletePopupPos(null);
    setCommandAutocomplete(createCommandAutocompleteState());
  }, [clearCommandAutocompleteBlurTimer, clearCommandAutocompleteDebounce]);

  const updateCommandAutocompletePopupPosition = useCallback(() => {
    const nextPopupPos = getTextareaAutocompletePopupPosition(cmdInputRef.current)
    if (nextPopupPos) {
      setCommandAutocompletePopupPos(nextPopupPos)
    }
  }, [])

  // F1 切换命令输入快捷键提示；开启/关闭均二次确认，并告知再次切换的方式
  const toggleCommandInputHints = useCallback(async () => {
    const detail = cmdInputHintsHidden
      ? `${t('开启后将在命令输入框显示快捷键提示')}\n${t('随时按 {shortcut} 可再次关闭').replace('{shortcut}', 'F1')}`
      : `${t('关闭后将不再显示命令输入快捷键提示')}\n${t('随时按 {shortcut} 可重新开启').replace('{shortcut}', 'F1')}`;
    let confirmed = false;
    try {
      confirmed = Boolean(await window.luminDialog?.confirm(detail, t('提示')));
    } catch {
      confirmed = false;
    }
    if (!confirmed) return;
    setCmdInputHintsHidden((previous) => {
      const next = !previous;
      localStorage.setItem('terminalCmdInputHintsHidden', String(next));
      return next;
    });
  }, [cmdInputHintsHidden, t]);

  const ensureCommandAutocompleteData = useCallback(async () => {
    const cache = commandAutocompleteDataRef.current;
    const normalizedHistoryId = String(historyServerId || '').trim();

    if (cache.historyServerId !== normalizedHistoryId) {
      cache.historyServerId = normalizedHistoryId;
      cache.serverHistory = [];
      cache.serverLoaded = false;
    }

    if (!normalizedHistoryId) {
      cache.serverHistory = [];
      cache.serverLoaded = true;
    }

    const tasks = [];

    if (!cache.quickLoaded) {
      tasks.push(
        AppGo.GetQuickCommands()
          .then((raw) => {
            cache.quickCommands = normalizeQuickCommandItems(raw);
            cache.quickLoaded = true;
          })
          .catch(() => {
            cache.quickCommands = [];
            cache.quickLoaded = true;
          }),
      );
    }

    if (!cache.globalLoaded) {
      tasks.push(
        AppGo.GetGlobalCommandHistory()
          .then((raw) => {
            cache.globalHistory = normalizeHistoryCommands(raw);
            cache.globalLoaded = true;
          })
          .catch(() => {
            cache.globalHistory = [];
            cache.globalLoaded = true;
          }),
      );
    }

    if (normalizedHistoryId && !cache.serverLoaded) {
      tasks.push(
        AppGo.GetCommandHistory(normalizedHistoryId)
          .then((raw) => {
            cache.serverHistory = normalizeHistoryCommands(raw);
            cache.serverLoaded = true;
          })
          .catch(() => {
            cache.serverHistory = [];
            cache.serverLoaded = true;
          }),
      );
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    return cache;
  }, [historyServerId]);

  const loadCommandAutocompleteSuggestions = useCallback(async (nextValue: string) => {
    if (!commandAutocompleteFocusedRef.current || showHistory || showCommands) {
      closeCommandAutocomplete();
      return [];
    }

    updateCommandAutocompletePopupPosition();

    const normalizedValue = String(nextValue || '');
    if (!normalizedValue.trim()) {
      closeCommandAutocomplete();
      return [];
    }

    const cursorPosition = cmdInputRef.current ? (cmdInputRef.current.selectionStart ?? normalizedValue.length) : normalizedValue.length
    const requestId = commandAutocompleteRequestRef.current + 1;
    commandAutocompleteRequestRef.current = requestId;

    const cache = await ensureCommandAutocompleteData();
    if (commandAutocompleteRequestRef.current !== requestId) {
      return [];
    }

    const staticItems = buildStaticAutocompleteItems(normalizedValue, cache, {
      cursorPosition,
      currentCwd: terminalCwd,
    })
    const shouldLoadPathItems = Boolean(buildPathAutocompleteContext(normalizedValue, terminalCwd, { cursorPosition }))

    if (!shouldLoadPathItems) {
      setCommandAutocomplete(createCommandAutocompleteState({
        open: staticItems.length > 0,
        items: staticItems,
        selectedIndex: staticItems.length > 0 ? 0 : -1,
      }));
      return staticItems;
    }

    setCommandAutocomplete(createCommandAutocompleteState({
      open: true,
      loading: true,
      items: staticItems,
      selectedIndex: staticItems.length > 0 ? 0 : -1,
    }));

    const pathItems = await loadPathAutocompleteItems({
      sessionId,
      inputValue: normalizedValue,
      currentCwd: terminalCwd,
      cursorPosition,
      listDir: (activeSessionId, remotePath) => AppGo.ListDir(activeSessionId, remotePath),
    })
    if (commandAutocompleteRequestRef.current !== requestId) {
      return [];
    }

    const resolvedItems = [...pathItems, ...staticItems].slice(0, 10)
    setCommandAutocomplete(createCommandAutocompleteState({
      open: resolvedItems.length > 0,
      items: resolvedItems,
      loading: false,
      selectedIndex: resolvedItems.length > 0 ? 0 : -1,
    }));
    return resolvedItems;
  }, [closeCommandAutocomplete, ensureCommandAutocompleteData, sessionId, showCommands, showHistory, terminalCwd, updateCommandAutocompletePopupPosition]);

  const scheduleCommandAutocompleteSuggestions = useCallback((nextValue: string) => {
    clearCommandAutocompleteDebounce();
    commandAutocompleteDebounceRef.current = setTimeout(() => {
      void loadCommandAutocompleteSuggestions(nextValue);
    }, 140);
  }, [clearCommandAutocompleteDebounce, loadCommandAutocompleteSuggestions]);

  const applyCommandAutocompleteItem = useCallback((item: AutocompleteItem) => {
    if (!item || !item.value) {
      return;
    }
    if (item.quickCommand && extractQuickCommandParams(item.quickCommand.command).length > 0) {
      openQuickCmdConfirm({
        name: item.quickCommand.name,
        command: item.quickCommand.command,
        groupPath: item.quickCommand.groupPath,
        addCR: item.quickCommand.addCR,
      });
      closeCommandAutocomplete();
      return;
    }
    const nextValue = String(item.value);
    setCmdInput(nextValue);
    closeCommandAutocomplete();
    requestAnimationFrame(() => {
      if (!cmdInputRef.current) {
        return;
      }
      cmdInputRef.current.focus();
      cmdInputRef.current.setSelectionRange(nextValue.length, nextValue.length);
      commandAutocompleteFocusedRef.current = true;
      void loadCommandAutocompleteSuggestions(nextValue);
    });
  }, [closeCommandAutocomplete, loadCommandAutocompleteSuggestions, openQuickCmdConfirm]);

  useEffect(() => {
    let cancelled = false;
    setTerminalCwd('/');

    if (!sessionId) {
      return () => {
        cancelled = true;
      };
    }

    if (typeof AppGo.GetTerminalCwd === 'function') {
      AppGo.GetTerminalCwd(sessionId)
        .then((cwd) => {
          if (!cancelled) {
            setTerminalCwd(normalizeRemoteAbsolutePath(cwd) || '/');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTerminalCwd('/');
          }
        });
    }

    const off = EventsOn(`ssh-terminal-cwd-${sessionId}`, (cwd) => {
      if (cancelled) {
        return;
      }
      const normalizedCwd = normalizeRemoteAbsolutePath(cwd);
      if (normalizedCwd) {
        setTerminalCwd(normalizedCwd);
      }
    });

    return () => {
      cancelled = true;
      off?.();
    };
  }, [sessionId]);

  useEffect(() => {
    const invalidate = () => {
      const cache = commandAutocompleteDataRef.current;
      cache.serverLoaded = false;
      cache.globalLoaded = false;
    };

    window.addEventListener('ssh-command-history', invalidate);
    window.addEventListener('ssh-history-cleared', invalidate);
    window.addEventListener('ssh-history-changed', invalidate);
    return () => {
      window.removeEventListener('ssh-command-history', invalidate);
      window.removeEventListener('ssh-history-cleared', invalidate);
      window.removeEventListener('ssh-history-changed', invalidate);
    };
  }, []);

  useEffect(() => {
    if (!showCommands) {
      commandAutocompleteDataRef.current.quickLoaded = false;
    }
  }, [showCommands]);

  useEffect(() => {
    if (showHistory || showCommands) {
      closeCommandAutocomplete();
    }
  }, [closeCommandAutocomplete, showCommands, showHistory]);

  // ── 快捷命令条：可见时加载列表，命令增删改后刷新 ──
  useEffect(() => {
    const handleBarToggle = (e: Event) => setQuickCmdBarVisible((e as CustomEvent<unknown>).detail !== false);
    window.addEventListener('quick-cmd-bar-changed', handleBarToggle);
    return () => window.removeEventListener('quick-cmd-bar-changed', handleBarToggle);
  }, []);

  // 确认框：Esc 关闭（挂 document，焦点丢失时也能关）
  useEffect(() => {
    if (!pendingQuickCmd) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPendingQuickCmd(null);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [pendingQuickCmd]);

  // 搜索框展开后自动聚焦，省去再点一次
  useEffect(() => {
    if (quickCmdSearchOpen) quickCmdSearchRef.current?.focus();
  }, [quickCmdSearchOpen]);

  useEffect(() => {
    if (!quickCmdBarVisible) {
      setQuickCmdBarItems([]);
      setQuickCmdSearch('');
      setQuickCmdSearchOpen(false);
      return undefined;
    }
    let alive = true;
    const load = () => {
      AppGo.GetQuickCommands()
        .then((raw) => {
          if (alive) setQuickCmdBarItems(normalizeQuickCommandItems(raw));
        })
        .catch(() => {
          if (alive) setQuickCmdBarItems([]);
        });
    };
    load();
    window.addEventListener('quick-commands-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('quick-commands-changed', load);
    };
  }, [quickCmdBarVisible]);

  useEffect(() => {
    if (!cmdInput.trim()) {
      closeCommandAutocomplete();
    }
  }, [closeCommandAutocomplete, cmdInput]);

  useEffect(() => () => {
    clearCommandAutocompleteDebounce();
    clearCommandAutocompleteBlurTimer();
  }, [clearCommandAutocompleteBlurTimer, clearCommandAutocompleteDebounce]);

  useLayoutEffect(() => {
    syncCommandInputHeight()
    if (commandAutocomplete.open || commandAutocomplete.loading) {
      updateCommandAutocompletePopupPosition()
    }
  }, [cmdInput, commandAutocomplete.loading, commandAutocomplete.open, syncCommandInputHeight, updateCommandAutocompletePopupPosition])

  useEffect(() => {
    if (!commandAutocomplete.open && !commandAutocomplete.loading) {
      return undefined
    }
    const handleWindowChange = () => {
      updateCommandAutocompletePopupPosition()
    }
    window.addEventListener('resize', handleWindowChange)
    window.addEventListener('scroll', handleWindowChange, true)
    return () => {
      window.removeEventListener('resize', handleWindowChange)
      window.removeEventListener('scroll', handleWindowChange, true)
    }
  }, [commandAutocomplete.loading, commandAutocomplete.open, updateCommandAutocompletePopupPosition])

  useLayoutEffect(() => {
    syncCommandInputHeight()
  }, [cmdInput, syncCommandInputHeight])

  useLayoutEffect(() => {
    if (!commandAutocompleteKeyboardNavigationRef.current) {
      return;
    }
    if (!commandAutocomplete.open || !commandAutocompleteListRef.current || commandAutocomplete.selectedIndex < 0) {
      commandAutocompleteKeyboardNavigationRef.current = false;
      return;
    }
    const selectedNode = commandAutocompleteListRef.current.querySelector('[data-command-autocomplete-selected="true"]');
    if (!selectedNode || typeof selectedNode.scrollIntoView !== 'function') {
      commandAutocompleteKeyboardNavigationRef.current = false;
      return;
    }
    selectedNode.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    });
    commandAutocompleteKeyboardNavigationRef.current = false;
  }, [commandAutocomplete.open, commandAutocomplete.selectedIndex, commandAutocomplete.items.length]);

  return (
    <div
      ref={wrapperRef}
      onContextMenu={handleContextMenu}
      onClick={closeContextMenu}
      // 主题底色 + 色调层；壁纸半透明叠在上面
      className="relative h-full flex flex-col overflow-hidden bg-[var(--term-container-bg)]"
    >
      {/* 主题色调层：xterm 背景已不透明，叠在内容上方才能生效（弹出层 fixed+zIndex 更高，不受影响） */}
      <div
        className="absolute inset-0 pointer-events-none bg-[var(--term-tint,transparent)]"
        style={{ zIndex: Z.STACK }}
      />
      {/* 壁纸层：叠在内容上方，浅色底下使用 multiply 混合模式，避免亮色/白色壁纸部分遮盖冲淡字色 */}
      {/* 全局背景激活时不渲染默认终端纹理，避免与全局壁纸叠加 */}
      <div
        className="absolute inset-0 pointer-events-none bg-cover bg-center"
        style={{
          zIndex: Z.STACK,
          backgroundImage: `url("${bgInfo.image || (bgInfo.globalActive ? '' : defaultTermBg)}")`,
          opacity: Number.isFinite(bgInfo.opacity) ? bgInfo.opacity : 0.15,
          mixBlendMode: isDarkTerminalSurface(T) ? 'normal' : 'multiply',
        }}
      />

      {/* 内容层（置于背景之上) */}
      <div className="relative flex flex-col h-full" style={{ zIndex: Z.CONTENT }}>
      {/* ── Session 状态栏 ── */}
      <div className="term-status-bar">
        {/* 状态指示灯 - 使用全局 CSS 类，连接成功时触发涟漪动画 */}
        <div className={[
          'status-dot',
          isConnected  ? (justConnected ? 'just-connected' : 'online') : '',
          isConnecting ? 'connecting' : '',
          isError      ? 'offline' : '',
          !isConnected && !isConnecting && !isError ? 'offline' : '',
        ].filter(Boolean).join(' ')} style={{ flexShrink: 0 }} />
        <span className="font-medium font-mono text-[var(--term-server-color)]">
          {serverName || 'Terminal'}
        </span>

        {/* 右侧极简状态显示 */}
        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-xs font-mono font-bold" style={{ color: statusColor }}>
            {isConnected  ? t('已连接')
             : isConnecting ? t('连接中...')
             : isError      ? t('错误')
             : t('离线')}
          </span>
          {(isError || isClosed) && (
            <button
              className="term-reconnect-btn"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('ssh-reconnect-trigger', { detail: sessionId }));
              }}
            >
              {t('重新连接')}
            </button>
          )}
        </div>
      </div>

      {/* ── 终端内容查找栏 ── */}
      {showTermSearch && (
        <div
          className="term-search-bar flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[var(--term-separator)] bg-[var(--term-status-bg)] shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ zIndex: Z.SEARCH_PANEL }}
        >
          <Search size={13} className="text-[var(--term-muted)] shrink-0" />
          <input
            name="terminal-search"
            autoComplete="off"
            aria-label={t('终端输出搜索')}
            ref={termSearchInputRef}
            value={termSearchQuery}
            onChange={(e) => setTermSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeTermSearch();
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) findTermPrevious();
                else findTermNext(false);
              }
            }}
            placeholder={t('查找...')}
            className="term-search-input flex-1 min-w-0 px-2 py-1 bg-[var(--term-input-bg)] border border-[var(--term-btn-border)] rounded-sm text-sm text-[var(--term-input-color)] outline-none font-sans"
          />
          <span
            className={`text-xs font-mono min-w-[52px] text-center shrink-0 ${
              termSearchQuery && termSearchResult.resultCount === 0
                ? 'text-danger'
                : 'text-[var(--term-muted)]'
            }`}
          >
            {!termSearchQuery
              ? ''
              : termSearchResult.resultCount <= 0
                ? t('无匹配')
                : termSearchResult.resultIndex < 0
                  ? `${termSearchResult.resultCount}`
                  : `${termSearchResult.resultIndex + 1}/${termSearchResult.resultCount}`}
          </span>
          <Tiptop text={t('区分大小写')}>
            <button
              type="button"
              onClick={() => setTermSearchCaseSensitive((v) => !v)}
              aria-label={t('区分大小写')}
              aria-pressed={termSearchCaseSensitive}
              className={`term-btn${termSearchCaseSensitive ? ' active' : ''} py-1 px-1.5 min-w-7 h-[26px]`}
            >
              <CaseSensitive size={13} />
            </button>
          </Tiptop>
          <Tiptop text={t('上一个')}>
            <button
              type="button"
              onClick={() => findTermPrevious()}
              aria-label={t('上一个')}
              className="term-btn py-1 px-1.5 min-w-7 h-[26px]"
              disabled={!termSearchQuery}
            >
              <ChevronUp size={13} />
            </button>
          </Tiptop>
          <Tiptop text={t('下一个')}>
            <button
              type="button"
              onClick={() => findTermNext(false)}
              aria-label={t('下一个')}
              className="term-btn py-1 px-1.5 min-w-7 h-[26px]"
              disabled={!termSearchQuery}
            >
              <ChevronDown size={13} />
            </button>
          </Tiptop>
          <Tiptop text={t('关闭')}>
            <button
              type="button"
              onClick={closeTermSearch}
              aria-label={t('关闭')}
              className="term-btn py-1 px-1.5 min-w-7 h-[26px]"
            >
              <X size={13} />
            </button>
          </Tiptop>
        </div>
      )}

      {/* ── xterm 渲染层 + 时间轴 / 命令块边框 ── */}
      <div className="flex-1 min-h-0 flex">
        <div ref={gutterRef} className="shrink-0 pt-0 overflow-hidden box-border" style={{
          display: (timestampsVisible || commandBlocksVisible) && !alternateBufferActive ? 'block' : 'none',
          // 时间戳约 72px；命令块约 16px；两者同时开约 96px
          // 时间戳列 70 + 命令块 14 + padding ≈ 90；仅时间戳 75；仅命令块 22
          width: timestampsVisible && commandBlocksVisible ? 90 : timestampsVisible ? 75 : 22,
        }} />
        <div
          className={terminalDefaultMouseCursorEnabled ? 'terminal-output-default-mouse-cursor relative flex-1 min-h-0' : 'relative flex-1 min-h-0'}
          onMouseDownCapture={handleTerminalMouseDownCapture}
          onMouseUpCapture={handleTerminalMouseUpCapture}
        >
          <div
            ref={containerRef}
            className="h-full min-h-0 p-0 bg-transparent"
          />
          {/* 常驻链接下划线（pointer-events:none，不挡点击/选区） */}
          <div
            ref={linkUnderlineLayerRef}
            className="absolute inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: Z.STACK }}
          />
          </div>
      </div>

      {/* ── 快捷命令条（输入框上方，横向滚动，点击后弹确认框） ── */}
      {quickCmdBarVisible && (
        <div
          className="term-quick-cmd-bar"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="term-quick-cmd-list">
            {quickCmdBarItems.length === 0 ? (
              <span className="term-quick-cmd-empty">{t('暂无快捷命令, 可在「命令」面板添加')}</span>
            ) : filteredQuickCmdItems.length === 0 ? (
              <span className="term-quick-cmd-empty">{t('无匹配结果')}</span>
            ) : filteredQuickCmdItems.map((item, i) => (
              <Tiptop key={`${item.name}-${i}`} text={item.groupPath ? `${item.command} · ${item.groupPath}` : item.command}>
                <button
                  type="button"
                  className="term-quick-cmd-btn"
                  onClick={() => openQuickCmdConfirm(item)}
                  disabled={!isConnected}
                  aria-label={item.name}
                >
                  {item.name}
                </button>
              </Tiptop>
            ))}
          </div>
          {quickCmdBarItems.length > 0 && (
            <div className="term-quick-cmd-search-area">
              {quickCmdSearchOpen ? (
                <div className="term-quick-cmd-search">
                  <Search size={12} />
                  <input
                    name="terminal-quick-cmd-search"
                    autoComplete="off"
                    ref={quickCmdSearchRef}
                    type="text"
                    value={quickCmdSearch}
                    onChange={(e) => setQuickCmdSearch(e.target.value)}
                    onKeyDown={(e) => {
                      // 有内容先清空，已空再收起：Esc 不会一下丢掉搜索框
                      if (e.key !== 'Escape') return;
                      e.stopPropagation();
                      if (quickCmdSearch) setQuickCmdSearch('');
                      else closeQuickCmdSearch();
                    }}
                    onBlur={() => { if (!quickCmdSearch) closeQuickCmdSearch(); }}
                    placeholder={t('搜索')}
                    spellCheck={false}
                    aria-label={t('搜索命令...')}
                  />
                  <button
                    type="button"
                    onClick={closeQuickCmdSearch}
                    aria-label={t('关闭')}
                  ><X size={11} /></button>
                </div>
              ) : (
                <Tiptop text={t('搜索命令...')}>
                  <button
                    type="button"
                    className="term-quick-cmd-search-btn"
                    onClick={() => setQuickCmdSearchOpen(true)}
                    aria-label={t('搜索命令...')}
                    aria-expanded={false}
                  ><Search size={13} /></button>
                </Tiptop>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 底部命令输入栏 ── */}
      <div className="term-input-bar">
        {/* 命令输入框 */}
        <Tiptop
          text={!cmdInputHintsHidden && !cmdInput && !commandAutocomplete.open ? (
            <div className="flex flex-col gap-[5px] px-1 py-0.5 text-xs leading-[1.5] text-left min-w-[190px]">
              <div className="flex items-center gap-[5px] font-semibold text-primary border-b border-line-subtle pb-1 mb-0.5">
                <span>{t('命令输入快捷键')}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary">{t('执行命令')}</span>
                <kbd className="bg-overlay border border-line rounded-xs px-[5px] py-px text-[10px] font-mono">Enter</kbd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary">{t('换行多行输入')}</span>
                <kbd className="bg-overlay border border-line rounded-xs px-[5px] py-px text-[10px] font-mono">Shift + Enter</kbd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary">{t('快捷命令列表')}</span>
                <kbd className="bg-overlay border border-line rounded-xs px-[5px] py-px text-[10px] font-mono">/</kbd>
              </div>
              {altOpenHistoryEnabled && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-secondary">{t('搜索历史指令')}</span>
                  <kbd className="bg-overlay border border-line rounded-xs px-[5px] py-px text-[10px] font-mono">Alt</kbd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary">{t('补全候选项')}</span>
                <kbd className="bg-overlay border border-line rounded-xs px-[5px] py-px text-[10px] font-mono">Tab</kbd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary">{t('关闭此提示')}</span>
                <kbd className="bg-overlay border border-line rounded-xs px-[5px] py-px text-[10px] font-mono">F1</kbd>
              </div>
            </div>
          ) : undefined}
          placement="top"
          style={{ flex: 1, display: 'flex', minWidth: 0 }}
        >
          <textarea
            ref={cmdInputRef}
            className="input term-command-input w-full text-sm py-2 px-[11px] h-9 min-h-9 bg-[var(--term-input-bg)] text-[var(--term-input-color)]"
            name="terminalCommand"
            value={cmdInput}
            rows={1}
            spellCheck={false}
            autoComplete="off"
            onContextMenu={handleInputContextMenu}
            onChange={e => {
              const nextValue = e.target.value;
              setCmdInput(nextValue);
              if (commandAutocompleteFocusedRef.current) {
                scheduleCommandAutocompleteSuggestions(nextValue);
              }
            }}
            onFocus={() => {
              commandAutocompleteFocusedRef.current = true;
              clearCommandAutocompleteBlurTimer();
              updateCommandAutocompletePopupPosition();
              if (cmdInput.trim()) {
                scheduleCommandAutocompleteSuggestions(cmdInput);
              }
            }}
            onBlur={() => {
              commandAutocompleteFocusedRef.current = false;
              clearCommandAutocompleteBlurTimer();
              commandAutocompleteBlurTimerRef.current = setTimeout(() => {
                closeCommandAutocomplete();
              }, 120);
            }}
            onScroll={() => {
              if (commandAutocomplete.open || commandAutocomplete.loading) {
                updateCommandAutocompletePopupPosition();
              }
            }}
            onSelect={() => {
              if (commandAutocomplete.open || commandAutocomplete.loading) {
                updateCommandAutocompletePopupPosition();
              }
              if (commandAutocompleteFocusedRef.current && cmdInput.trim()) {
                scheduleCommandAutocompleteSuggestions(cmdInput);
              }
            }}
            onKeyDown={async (e) => {
              if (e.key === 'F1' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                void toggleCommandInputHints();
                return;
              }

              if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.repeat) {
                if (!altOpenHistoryEnabled) return;
                e.preventDefault();
                e.stopPropagation();
                closeCommandAutocomplete();
                openHistoryAndFocusSearch();
                return;
              }

              if (commandAutocomplete.open && e.key === 'ArrowDown') {
                e.preventDefault();
                if (commandAutocomplete.items.length === 0) {
                  return;
                }
                commandAutocompleteKeyboardNavigationRef.current = true;
                setCommandAutocomplete((previous) => ({
                  ...previous,
                  selectedIndex: previous.selectedIndex < 0
                    ? 0
                    : (previous.selectedIndex + 1) % previous.items.length,
                }));
                return;
              }

              if (commandAutocomplete.open && e.key === 'ArrowUp') {
                e.preventDefault();
                if (commandAutocomplete.items.length === 0) {
                  return;
                }
                commandAutocompleteKeyboardNavigationRef.current = true;
                setCommandAutocomplete((previous) => ({
                  ...previous,
                  selectedIndex: previous.selectedIndex < 0
                    ? previous.items.length - 1
                    : (previous.selectedIndex - 1 + previous.items.length) % previous.items.length,
                }));
                return;
              }

              if (e.key === 'Tab' && cmdInput.trim()) {
                e.preventDefault();
                let items = commandAutocomplete.items;
                if (items.length === 0) {
                  items = await loadCommandAutocompleteSuggestions(cmdInput);
                }
                const selectedIndex = commandAutocomplete.selectedIndex >= 0 ? commandAutocomplete.selectedIndex : 0;
                const selectedItem = items[selectedIndex] || items[0];
                if (selectedItem) {
                  applyCommandAutocompleteItem(selectedItem);
                }
                return;
              }

              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                requestAnimationFrame(() => {
                  if (commandAutocompleteFocusedRef.current && cmdInputRef.current) {
                    updateCommandAutocompletePopupPosition();
                    void loadCommandAutocompleteSuggestions(cmdInputRef.current.value);
                  }
                });
              }

              if (e.key === 'Escape') {
                if (commandAutocomplete.open) {
                  e.preventDefault();
                  closeCommandAutocomplete();
                  return;
                }
                setShowHistory(false);
              }

              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                if (e.shiftKey) {
                  return;
                }
                e.preventDefault();
                closeCommandAutocomplete();
                executeCommand();
              }
            }}
            placeholder={(() => {
              if (cmdInputWidth >= 520) {
                return altOpenHistoryEnabled
                  ? `${t('输入命令')} (/ ${t('快捷命令')}) · Shift+Enter ${t('换行')} · Alt → ${t('历史指令')}`
                  : `${t('输入命令')} (/ ${t('快捷命令')}) · Shift+Enter ${t('换行')}`;
              }
              if (cmdInputWidth >= 360) {
                return `${t('输入命令')} (/ ${t('快捷命令')}) · Shift+Enter ${t('换行')}`;
              }
              if (cmdInputWidth >= 240) {
                return `${t('输入命令')} (/ ${t('快捷命令')})`;
              }
              return `${t('输入命令')}...`;
            })()}
            style={{
              fontFamily: 'var(--font-terminal)',
              borderColor: cmdInput ? 'var(--border-focus)' : 'var(--term-btn-border)',
            }}
          />
        </Tiptop>

        {/* 历史按钮 */}
        <Tiptop text={t('历史指令')}>
          <button
            ref={historyBtnRef}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleHistory();
            }}
            aria-label={t('历史指令')}
            className={`term-btn${showHistory ? ' active' : ''}`}
          >
            <Clock size={13} />
            <span>{t('历史')}</span>
          </button>
        </Tiptop>

        {/* 快捷命令按钮 */}
        <Tiptop text={t('快捷命令')}>
          <button
            ref={commandsBtnRef}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleCommands();
            }}
            aria-label={t('快捷命令')}
            className={`term-btn${showCommands ? ' active' : ''}`}
          >
            <span className="inline-flex items-center"><Zap size={13} /></span>
            <span>{t('命令')}</span>
          </button>
        </Tiptop>

        {/* 执行按钮（绿色） */}
        <Tiptop text={t('执行')}>
          <button
            onClick={() => executeCommand()}
            disabled={!cmdTrimmed || !isConnected}
            aria-label={t('执行')}
            className={`term-btn-icon success${(cmdTrimmed && isConnected) ? ' enabled' : ''}`}
          >
            <Play size={13} />
          </button>
        </Tiptop>

        {/* 复制按钮（蓝色） */}
        <Tiptop text={t('复制')}>
          <button
            onClick={copyCommand}
            disabled={!cmdTrimmed}
            aria-label={t('复制')}
            className={`term-btn-icon accent${cmdTrimmed ? ' enabled' : ''}`}
          >
            <Clipboard size={13} />
          </button>
        </Tiptop>

        <Tiptop text={multiLineWrapEnabled ? t('函数/变量作用域:命令内部') : t('函数/变量作用域:终端会话')}>
          <button
            onClick={toggleMultiLineWrap}
            aria-label={multiLineWrapEnabled ? t('函数/变量作用域:命令内部') : t('函数/变量作用域:终端会话')}
            className={`term-btn${multiLineWrapEnabled ? ' active' : ''} p-0 w-9 min-w-9 h-9 min-h-9 justify-center`}
          >
            <span className="inline-flex items-center justify-center w-3.5 font-mono text-xs font-bold">
              &gt;_
            </span>
          </button>
        </Tiptop>
      </div>
      </div>

      {(commandAutocomplete.open || commandAutocomplete.loading) && !showHistory && !showCommands && commandAutocompletePopupPos && (
        <div
          className="term-popup flex flex-col overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            left: commandAutocompletePopupPos.left,
            top: commandAutocompletePopupPos.top,
            width: commandAutocompletePopupPos.width,
            maxHeight: commandAutocompletePopupPos.maxHeight ?? 260,
            zIndex: Z.POPUP,
          }}
        >
          <div className="flex items-center justify-between gap-2.5 px-2.5 py-[7px] border-b border-[var(--term-separator)] text-xs text-[var(--term-status-color)]">
            <span>{t('命令')}</span>
            <span className="text-[var(--term-muted)] font-mono">Tab</span>
          </div>
          <div ref={commandAutocompleteListRef} className="max-h-[220px] overflow-y-auto overflow-x-hidden">
            {commandAutocomplete.loading && commandAutocomplete.items.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-[var(--term-muted)]">
                {t('正在搜索...')}
              </div>
            ) : commandAutocomplete.items.map((item, index) => {
              const isSelected = index === commandAutocomplete.selectedIndex;
              return (
                <button
                  key={`${item.source}-${item.value}-${index}`}
                  data-command-autocomplete-selected={isSelected ? 'true' : 'false'}
                  type="button"
                  onMouseEnter={() => {
                    setCommandAutocomplete((previous) => ({
                      ...previous,
                      selectedIndex: index,
                    }));
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyCommandAutocompleteItem(item);
                  }}
                  className={`w-full min-w-0 grid gap-1 px-3 py-[9px] text-left cursor-pointer overflow-hidden border-x-0 border-t-0 ${
                    index === commandAutocomplete.items.length - 1 && !commandAutocomplete.loading ? '' : 'border-b border-b-[var(--term-separator)]'
                  } ${isSelected ? 'bg-[rgba(59,130,246,0.12)]' : 'bg-transparent'} text-[var(--term-input-color)]`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex-1 min-w-0 text-sm truncate"
                      style={{ fontFamily: 'var(--font-terminal)' }}
                    >
                      {item.label}
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full border border-[var(--term-btn-border)] text-[var(--term-status-color)] text-[10px] leading-[1.2]">
                      {item.badge}
                    </span>
                  </div>
                  {item.description ? (
                    <span className="text-xs text-[var(--term-muted)] truncate">
                      {item.description}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {commandAutocomplete.loading && commandAutocomplete.items.length > 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--term-muted)] border-t border-[var(--term-separator)]">
                {t('正在刷新结果...')}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── 历史指令弹窗（fixed 定位，不受 overflow:hidden 裁剪） ── */}
      {showHistory && historyPopupPos && (
        <div ref={historyPopupRef} className="term-popup flex flex-col box-border w-[480px] max-w-[calc(100vw-16px)] max-h-[280px] text-sm" style={{
            left: historyPopupPos.left,
            bottom: historyPopupPos.bottom,
            zIndex: Z.POPUP,
            fontFamily: 'var(--font-terminal)',
          }}>
            {/* 弹窗头部（标题 + 操作按钮） */}
            <div className="flex items-center justify-between px-2.5 py-2 border-b border-[var(--term-separator)] shrink-0">
              <span className="text-[var(--term-status-color)] text-xs">{t('历史命令')}</span>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-[5px]">
                  <span className="text-[var(--term-muted)] text-xs">{t('Alt 打开历史指令')}</span>
                  <ToggleSwitch checked={altOpenHistoryEnabled} onChange={() => {
                    const enabled = !altOpenHistoryEnabled;
                    setAltOpenHistoryEnabled(enabled);
                    localStorage.setItem('altOpenHistory', String(enabled));
                    window.dispatchEvent(new CustomEvent('alt-open-history-changed', { detail: enabled }));
                  }} />
                </div>
                <button
                  onClick={async () => {
                    const scope = historyMode;
                    // 二次确认，与历史页清空行为一致；按作用域给出不同提示
                    const msg = scope === 'global'
                      ? t('确定要清空全部服务器的历史指令吗？')
                      : t('确定要清空该服务器的历史指令吗？');
                    const result = await window.luminDialog?.confirm(msg);
                    const confirmed = typeof result === 'object' ? result?.confirmed : result === true;
                    if (!confirmed) return;
                    try {
                      if (scope === 'global') {
                        await AppGo.SaveGlobalCommandHistory('[]');
                      } else {
                        await AppGo.SaveCommandHistory(historyServerId, '[]');
                      }
                      setHistoryList([]);
                      // 通知历史页 / 自动补全按作用域刷新（全局清空不触碰服务器历史）
                      window.dispatchEvent(new CustomEvent('ssh-history-cleared', {
                        detail: { sessionId: serverId, historyServerId, scope }
                      }));
                    } catch (error) {
                      console.error('[Terminal] 清空历史失败:', error);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1 border border-line bg-raised text-danger rounded-xs px-2 py-[2px] text-xs cursor-pointer select-none transition-colors duration-100 hover:bg-hover"
                >
                  {t('清空列表')}
                </button>
                <button
                  onClick={() => { setShowHistory(false); setHistoryPopupPos(null); }}
                  aria-label={t('关闭')}
                  className="inline-flex items-center justify-center gap-1 border border-line bg-raised text-danger rounded-xs px-2 py-[3px] cursor-pointer select-none transition-colors duration-100 hover:bg-hover"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* 历史列表（可滚动） */}
            <div ref={historyScrollRef} className="flex-1 overflow-y-auto min-h-0">
            {filteredHistory.length === 0 ? (
              <div className="p-5 text-center text-[var(--term-muted)] text-sm">
                {searchQuery ? t('无匹配结果') : t('暂无历史记录')}
              </div>
            ) : displayHistory.map((item, index) => (
              <div
                key={item.id}
                data-history-index={index}
                role="option"
                aria-selected={historySelectedIndex === index}
                onClick={() => selectHistoryCmd(item.command)}
                className={`flex items-center justify-between px-2.5 py-1.5 cursor-pointer border-b border-[var(--term-separator)] transition-colors duration-100 ${historySelectedIndex === index ? 'bg-active' : 'hover:bg-hover'}`}
              >
                <span
                  className="flex-1 min-w-0 text-[var(--term-input-color)] truncate pr-2"
                  title={item.command}
                >
                  {item.command}
                </span>
                <div className="flex items-center gap-[3px] shrink-0">
                  {/* 执行（绿色） */}
                  <Tiptop text={t('执行')}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); executeCommand(item.command); }}
                      aria-label={t('执行')}
                      className="inline-flex items-center justify-center w-6 h-6 border border-line bg-raised rounded-xs text-secondary cursor-pointer transition-colors duration-100 hover:text-primary"
                    >
                      <Play size={12} />
                    </button>
                  </Tiptop>
                  {/* 复制（蓝色） */}
                  <Tiptop text={t('复制')}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.command).catch(() => {}); }}
                      aria-label={t('复制')}
                      className="inline-flex items-center justify-center w-6 h-6 border border-line bg-raised rounded-xs text-secondary cursor-pointer transition-colors duration-100 hover:text-primary"
                    >
                      <Clipboard size={12} />
                    </button>
                  </Tiptop>
                  {/* 删除（红色） */}
                  <Tiptop text={t('删除')}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                      aria-label={t('删除')}
                      className="inline-flex items-center justify-center w-6 h-6 border border-line bg-[rgba(255,123,114,0.15)] rounded-xs text-danger cursor-pointer transition-colors duration-100 hover:bg-danger-dim"
                    >
                      <X size={12} />
                    </button>
                  </Tiptop>
                </div>
              </div>
            ))}
            </div>

            {/* 搜索 + 模式切换 */}
            <div className="flex gap-1.5 items-center px-2.5 py-1.5 border-t border-[var(--term-separator)] shrink-0">
              <input
                ref={historySearchInputRef}
                name="terminal-history-search"
                autoComplete="off"
                aria-label={t('搜索命令历史')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleHistorySearchKeyDown}
                placeholder={t('搜索命令...')}
                className="flex-1 px-2 py-1 bg-[var(--term-input-bg)] border border-[var(--term-btn-border)] rounded-sm text-sm text-[var(--term-input-color)] outline-none"
              />
              <div className="segment-control">
                <button className={historyMode === 'server' ? 'active' : ''} onClick={() => setHistoryMode('server')}>
                  {t('当前服务器')}
                </button>
                <button className={historyMode === 'global' ? 'active' : ''} onClick={() => setHistoryMode('global')}>
                  {t('全部服务器')}
                </button>
              </div>
            </div>
          </div>
      )}

      {/* ── 快捷命令二次确认框（ui/Modal；z 层降到 Z.DIALOG） ── */}
      {pendingQuickCmd && (() => {
        const params = extractQuickCommandParams(pendingQuickCmd.item.command);
        const filled = fillQuickCommandParams(pendingQuickCmd.item.command, pendingQuickCmd.values);
        return (
          // 遮罩不响应点击：只能用「取消」/ 右上 X / Esc 关闭，避免误点丢失已填参数
          <Modal
            open
            onClose={() => setPendingQuickCmd(null)}
            title={pendingQuickCmd.item.name || t('发送快捷命令')}
            icon={<Zap size={16} />}
            size="sm"
            zIndex={Z.DIALOG}
            closeOnOverlay={false}
            closeOnEscape={false}
            footer={<>
              <Button variant="secondary" onClick={() => setPendingQuickCmd(null)}>
                {t('取消')}
              </Button>
              <Button
                variant="primary"
                onClick={sendQuickCmdConfirmed}
                disabled={!isConnected || !filled.trim()}
                autoFocus={params.length === 0}
                className="min-w-20"
              >
                <Play size={14} className="mr-1.5" />{t('发送')}
              </Button>
            </>}
          >
            {params.map((p, i) => (
              <div key={p.num} className="form-group">
                <label className="form-label" htmlFor={`quick-cmd-param-${p.num}`}>
                  {p.label || `${t('参数')}${p.num}`}
                </label>
                <div className="flex items-center gap-1.5">
                <input
                  name={`terminal-quick-cmd-param-${p.num}`}
                  autoComplete="off"
                  aria-label={p.label || `${t('参数')}${p.num}`}
                  id={`quick-cmd-param-${p.num}`}
                  type="text"
                  className="input"
                  value={pendingQuickCmd.values[p.num] || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPendingQuickCmd((prev) => (prev
                      ? { ...prev, values: { ...prev.values, [p.num]: value } }
                      : prev));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendQuickCmdConfirmed();
                    }
                  }}
                  autoFocus={i === 0}
                  placeholder={p.label || `p#${p.num}`}
                  style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)' }}
                />
                <Button
                  variant="secondary"
                  data-terminal-quick-cmd-history="true"
                  aria-expanded={quickCmdHistoryParam === p.num}
                  onClick={(event) => {
                    setQuickCmdHistorySearch('');
                    if (quickCmdHistoryParam === p.num) {
                      setQuickCmdHistoryParam(null);
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    setQuickCmdHistoryPosition({
                      left: Math.max(8, Math.min(rect.left, window.innerWidth - 228)),
                      top: Math.min(rect.bottom + 4, window.innerHeight - 228),
                    });
                    setQuickCmdHistoryParam(p.num);
                  }}
                >
                  {t('历史')}
                </Button>
                </div>
                {quickCmdHistoryParam === p.num && createPortal((() => {
                  const history = quickCmdParamHistory[pendingQuickCmd.item.command]?.[p.num] || [];
                  const filteredHistory = quickCmdHistorySearch
                    ? history.filter((value) => value.toLowerCase().includes(quickCmdHistorySearch.toLowerCase()))
                    : history;
                  const saveHistory = (values: string[]) => {
                    const command = pendingQuickCmd.item.command;
                    const nextHistory = {
                      ...quickCmdParamHistoryRef.current,
                      [command]: { ...(quickCmdParamHistoryRef.current[command] || {}), [p.num]: values },
                    };
                    quickCmdParamHistoryRef.current = nextHistory;
                    setQuickCmdParamHistory(nextHistory);
                    AppGo.SaveParamHistory(JSON.stringify(nextHistory)).catch(() => {});
                  };
                  return (
                    <div
                      data-terminal-quick-cmd-history="true"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      className="fixed w-[220px] max-h-[220px] flex flex-col box-border overflow-hidden bg-raised border border-line rounded-md shadow-md"
                      style={{
                        left: quickCmdHistoryPosition.left,
                        top: quickCmdHistoryPosition.top,
                        zIndex: Z.SUBMENU,
                      }}
                    >
                      <div className="p-1.5 shrink-0 border-b border-line-subtle">
                        <input
                          type="text"
                          className="input"
                          name={`terminal-quick-cmd-history-search-${p.num}`}
                          autoComplete="off"
                          autoFocus
                          value={quickCmdHistorySearch}
                          onChange={(event) => setQuickCmdHistorySearch(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setQuickCmdHistoryParam(null);
                              setQuickCmdHistorySearch('');
                            }
                          }}
                          placeholder={t('搜索历史...')}
                          aria-label={t('搜索历史...')}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          saveHistory([]);
                          setQuickCmdHistoryParam(null);
                          setQuickCmdHistorySearch('');
                        }}
                        className="w-full shrink-0 flex items-center gap-1 min-h-7 py-1 px-2 text-sm font-medium leading-none whitespace-nowrap select-none cursor-pointer outline-none border-0 border-b border-line-subtle rounded-none bg-transparent text-danger transition-colors duration-100 hover:bg-danger-dim"
                      >
                        {t('清空列表')}
                      </button>
                      <div className="flex-1 overflow-y-auto">
                        {filteredHistory.length === 0 ? (
                          <div className="px-3 py-2 text-muted text-sm">
                            {quickCmdHistorySearch ? t('无匹配结果') : t('暂无历史')}
                          </div>
                        ) : filteredHistory.map((value) => (
                          <div
                            key={value}
                            className="flex items-center border-b border-line-subtle"
                          >
                            <button
                              type="button"
                              title={value}
                              onClick={() => {
                                setPendingQuickCmd((prev) => prev ? { ...prev, values: { ...prev.values, [p.num]: value } } : prev);
                                setQuickCmdHistoryParam(null);
                                setQuickCmdHistorySearch('');
                              }}
                              className="flex-1 min-w-0 flex items-center gap-1 min-h-7 py-1 px-2 text-sm font-medium text-left leading-none select-none cursor-pointer outline-none border-0 rounded-none bg-transparent text-secondary transition-colors duration-100 font-mono overflow-hidden text-ellipsis whitespace-nowrap hover:bg-hover hover:text-primary"
                            >
                              {value}
                            </button>
                            <button
                              type="button"
                              title={t('删除')}
                              aria-label={t('删除')}
                              onClick={() => saveHistory(history.filter((entry) => entry !== value))}
                              className="shrink-0 self-stretch inline-flex items-center justify-center w-[26px] min-w-[26px] p-0 text-sm font-medium leading-none select-none cursor-pointer outline-none border-0 rounded-none bg-transparent text-danger transition-colors duration-100 hover:bg-hover"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })(), document.body)}
              </div>
            ))}

            <div className="form-group">
              <div className="form-label">{t('将要发送')}</div>
              <div className="term-quick-cmd-preview">{filled}</div>
            </div>
          </Modal>
        );
      })()}

      {/* ── 右键上下文菜单（ui/ContextMenu，items 按 source 组装） ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          minWidth={190}
          zIndex={Z.MENU}
          onClose={() => setContextMenu(null)}
          items={contextMenu.source === 'input' ? [
            { label: t('剪切'), icon: <Trash2 size={13} />, shortcut: formatShortcut('Ctrl+X'), disabled: !contextHasSelection, onSelect: () => handleMenuAction('cut') },
            { label: t('复制'), icon: <Copy size={13} />, shortcut: formatShortcut('Ctrl+C'), disabled: !contextHasSelection, onSelect: () => handleMenuAction('copy') },
            { label: t('粘贴'), icon: <Clipboard size={13} />, shortcut: formatShortcut('Ctrl+V'), onSelect: () => handleMenuAction('paste') },
            'separator',
            { label: t('全选'), icon: <CheckSquare size={13} />, shortcut: formatShortcut('Ctrl+A'), onSelect: () => handleMenuAction('selectAll') },
          ] : [
            { label: t('复制'), icon: <Copy size={13} />, shortcut: formatShortcut('Ctrl+C'), disabled: !contextHasSelection, onSelect: () => handleMenuAction('copy') },
            { label: t('粘贴'), icon: <Clipboard size={13} />, shortcut: formatShortcut('Ctrl+V'), onSelect: () => handleMenuAction('paste') },
            { label: t('粘贴所选项'), icon: <Clipboard size={13} />, shortcut: formatShortcut(shortcutsRef.current?.pasteSelection || DEFAULT_TERMINAL_SHORTCUTS.pasteSelection), disabled: !contextHasSelection, onSelect: () => handleMenuAction('pasteSelection') },
            'separator',
            { label: t('全选'), icon: <CheckSquare size={13} />, onSelect: () => handleMenuAction('selectAll') },
            { label: t('查找'), icon: <Search size={13} />, shortcut: formatShortcut(shortcutsRef.current?.find || 'Ctrl+F'), onSelect: () => handleMenuAction('find') },
            { label: t('添加到 AI助手'), icon: <MessageSquarePlus size={13} />, disabled: !contextHasSelection, onSelect: () => handleMenuAction('sendToAssistant') },
            { label: t('清空屏幕'), icon: <Trash2 size={13} />, shortcut: formatShortcut('Ctrl+L'), onSelect: () => handleMenuAction('clear') },
          ]}
        />
      )}

      {/* ── 终端链接菜单：复制 / 打开（对齐安卓） ── */}
      {linkMenu && (
        <>
          {/* 透明遮罩：挡住终端拖选，点击空白关闭 */}
          <div
            className="fixed inset-0 bg-transparent cursor-default"
            style={{ zIndex: Z.MENU_BACKDROP }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              try { termRef.current?.clearSelection(); } catch (_) {}
              setLinkMenu(null);
            }}
            onMouseMove={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          <div
            className="fixed bg-raised border border-line rounded-lg shadow-md p-1 min-w-[200px] max-w-[360px] animate-[fadeIn_0.12s_ease]"
            style={{
              left: linkMenu.x,
              top: linkMenu.y,
              zIndex: Z.MENU,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="px-3 pt-1.5 pb-1 text-xs text-muted truncate"
              title={linkMenu.url}
            >
              {linkMenu.url}
            </div>
            <div className="h-px my-1 mx-2 bg-line-subtle" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLinkMenuAction('copy');
              }}
              className="flex items-center gap-2 w-full h-7 px-3 mx-0 rounded-sm text-sm text-left whitespace-nowrap cursor-pointer outline-none border-none bg-transparent text-secondary transition-colors duration-100 hover:bg-hover hover:text-primary"
            >
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 shrink-0 [&>svg]:w-full [&>svg]:h-full"><Copy size={13} /></span>
              <span className="truncate">{t('复制')}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLinkMenuAction('open');
              }}
              className="flex items-center gap-2 w-full h-7 px-3 mx-0 rounded-sm text-sm text-left whitespace-nowrap cursor-pointer outline-none border-none bg-transparent text-secondary transition-colors duration-100 hover:bg-hover hover:text-primary"
            >
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 shrink-0 [&>svg]:w-full [&>svg]:h-full"><ExternalLink size={13} /></span>
              <span className="truncate">{t('打开')}</span>
            </button>
          </div>
        </>
      )}

      {linkToast && (
        <div
          className="absolute left-1/2 bottom-14 -translate-x-1/2 bg-[var(--term-context-bg,rgba(20,24,32,0.92))] [border:var(--term-context-border,1px_solid_rgba(255,255,255,0.08))] text-[var(--text-primary,#eaf0f7)] rounded-lg px-3 py-1.5 text-sm pointer-events-none shadow-[var(--term-context-shadow)]"
          style={{ zIndex: Z.POPUP }}
        >
          {linkToast}
        </div>
      )}
    </div>
  );
}
