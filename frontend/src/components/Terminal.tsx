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
import { useTerminalClipboard } from './terminal/useTerminalClipboard.ts';
import { useTerminalSession } from './terminal/useTerminalSession.ts';
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
  const { isTerminalPointerDownRef, dispatchSyntheticTerminalMouseUp, pasteClipboardToTerminal, pasteTerminalSelectionToTerminal, handleTerminalMouseDownCapture, handleTerminalMouseUpCapture } = useTerminalClipboard({
    termRef,
    containerRef,
    wsRef,
    pendingCmdRef,
    terminalRightClickPasteOnEmptyRef,
    terminalRightClickPasteModeRef,
    terminalLeftClickCopyOnSelectionRef,
    terminalLeftClickCopyOnSelectionModeRef,
    t,
  });
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

  // ── xterm/WebSocket 会话主链路（terminal/useTerminalSession） ──
  useTerminalSession({
    sessionId,
    wsRebuildKey,
    status,
    isActive,
    t,
    T,
    containerRef,
    termRef,
    fitAddonRef,
    searchAddonRef,
    wsRef,
    serverIdRef,
    shortcutsRef,
    localEchoRef,
    timestampsEnabledRef,
    commandBlocksEnabledRef,
    alternateBufferActiveRef,
    setAlternateBufferActive,
    screenScrollbackRef,
    prepareScreenScrollbackRef,
    awaitingPasswordRef,
    awaitingCommandFinishRef,
    pendingCmdRef,
    isTerminalPointerDownRef,
    dispatchSyntheticTerminalMouseUp,
    keywordHighlightEnabledRef,
    hlDecoderRef,
    hlStateRef,
    termSearchInputRef,
    setShowTermSearch,
    setTermSearchQuery,
    setTermSearchResult,
    setContextMenu,
    setLinkMenu,
    isShellPromptLine,
    isCollapseSummaryLine,
    cbRewriteLockRef,
    tsSet,
    tsClearLine,
    tsClear,
    cbClear,
    gutterRef,
    gutterSyncRAFRef,
    linkUnderlineLayerRef,
    linkUnderlineSyncRAFRef,
    getViewportLinkCache,
    scheduleGutterSync,
    scheduleLinkUnderlineSync,
    handleClearScreen,
    pasteTerminalSelectionToTerminal,
  });


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
