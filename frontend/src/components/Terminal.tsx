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
import { useTerminalQuickCmd } from './terminal/useTerminalQuickCmd.ts';
import { useTerminalCommandInput } from './terminal/useTerminalCommandInput.ts';
import { useTerminalHistory } from './terminal/useTerminalHistory.ts';
import { TerminalHistoryPopup } from './terminal/TerminalHistoryPopup.tsx';
import { TerminalQuickCmdBar } from './terminal/TerminalQuickCmdBar.tsx';
import { TerminalInputBar } from './terminal/TerminalInputBar.tsx';
import { TerminalAutocompletePopup } from './terminal/TerminalAutocompletePopup.tsx';
import { TerminalQuickCmdConfirm } from './terminal/TerminalQuickCmdConfirm.tsx';
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
  const [showHistory, setShowHistory]         = useState(false);
  const [altOpenHistoryEnabled, setAltOpenHistoryEnabled] = useState(localStorage.getItem('altOpenHistory') !== 'false');
  const [showTermSearch, setShowTermSearch]   = useState(false);
  const [termSearchQuery, setTermSearchQuery] = useState('');
  const [termSearchCaseSensitive, setTermSearchCaseSensitive] = useState(false);
  const [termSearchResult, setTermSearchResult] = useState({ resultIndex: -1, resultCount: 0 });
  const [historyPopupPos, setHistoryPopupPos] = useState<{ left: number; bottom: number } | null>(null);
  const commandsBtnRef                        = useRef<HTMLButtonElement | null>(null);
  const pendingCmdRef                         = useRef('');
  const awaitingPasswordRef                   = useRef(false); // 检测到密码提示后，下一行输入不记入命令历史
  const awaitingCommandFinishRef              = useRef(false); // 按回车提交命令后，等待命令完成（提示符回归）

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

  const isConnected  = status === 'connected';
  const isClosed     = status === 'closed';
  const isError      = status === 'error';
  const [multiLineWrapEnabled, setMultiLineWrapEnabled] = useState(() => localStorage.getItem('terminalMultiLineWrapEnabled') !== 'false');
  const {
    quickCmdBarVisible, quickCmdBarItems, quickCmdSearch, setQuickCmdSearch, quickCmdSearchOpen, setQuickCmdSearchOpen,
    closeQuickCmdSearch, filteredQuickCmdItems, pendingQuickCmd, setPendingQuickCmd,
    quickCmdHistoryParam, setQuickCmdHistoryParam, quickCmdHistoryPosition, setQuickCmdHistoryPosition,
    quickCmdHistorySearch, setQuickCmdHistorySearch, quickCmdParamHistory, setQuickCmdParamHistory, quickCmdParamHistoryRef,
    openQuickCmdConfirm, sendQuickCmdConfirmed,
  } = useTerminalQuickCmd({
    isConnected,
    sessionId,
    serverId,
    multiLineWrapEnabled,
    prepareScreenScrollbackRef,
    awaitingPasswordRef,
    awaitingCommandFinishRef,
    termRef,
  });
  const {
    cmdInput, setCmdInput, cmdInputRef,
    commandAutocomplete, setCommandAutocomplete, commandAutocompletePopupPos, commandAutocompleteListRef,
    commandAutocompleteFocusedRef, commandAutocompleteKeyboardNavigationRef, commandAutocompleteBlurTimerRef,
    cmdInputHintsHidden, toggleCommandInputHints,
    closeCommandAutocomplete, scheduleCommandAutocompleteSuggestions, loadCommandAutocompleteSuggestions,
    applyCommandAutocompleteItem, updateCommandAutocompletePopupPosition, clearCommandAutocompleteBlurTimer,
    syncCommandInputHeight, executeCommand, copyCommand,
  } = useTerminalCommandInput({
    sessionId,
    serverId,
    historyServerId,
    showHistory,
    showCommands,
    isConnected,
    isClosed,
    isError,
    multiLineWrapEnabled,
    prepareScreenScrollbackRef,
    awaitingPasswordRef,
    awaitingCommandFinishRef,
    termRef,
    openQuickCmdConfirm,
    setShowHistory,
    setHistoryPopupPos,
    t,
  });
  const {
    historyList, setHistoryList, historyMode, setHistoryMode, searchQuery, setSearchQuery, historySelectedIndex,
    historyBtnRef, historySearchInputRef, historyScrollRef, historyPopupRef,
    filteredHistory, displayHistory, handleHistorySearchKeyDown,
    toggleHistory, openHistoryAndFocusSearch, toggleCommands, selectHistoryCmd, deleteHistoryItem,
  } = useTerminalHistory({
    showHistory,
    setShowHistory,
    setHistoryPopupPos,
    historyServerId,
    serverId,
    showCommands,
    onQuickCommandsOpenChange,
    quickCmdsRef,
    setCmdInput,
    cmdInputRef,
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

  const isConnecting = status === 'connecting';
  const statusColor  = isConnected ? 'var(--success)' : isConnecting ? 'var(--warning)' : isError ? 'var(--danger)' : 'var(--text-tertiary)';
  const cmdTrimmed   = cmdInput.trim();

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
        <TerminalQuickCmdBar
          quickCmdBarItems={quickCmdBarItems}
          filteredQuickCmdItems={filteredQuickCmdItems}
          quickCmdSearch={quickCmdSearch}
          setQuickCmdSearch={setQuickCmdSearch}
          quickCmdSearchOpen={quickCmdSearchOpen}
          setQuickCmdSearchOpen={setQuickCmdSearchOpen}
          closeQuickCmdSearch={closeQuickCmdSearch}
          openQuickCmdConfirm={openQuickCmdConfirm}
          isConnected={isConnected}
          t={t}
        />
      )}

      {/* ── 底部命令输入栏 ── */}
      <TerminalInputBar
        cmdInput={cmdInput}
        setCmdInput={setCmdInput}
        cmdInputRef={cmdInputRef}
        cmdInputHintsHidden={cmdInputHintsHidden}
        commandAutocomplete={commandAutocomplete}
        setCommandAutocomplete={setCommandAutocomplete}
        commandAutocompleteFocusedRef={commandAutocompleteFocusedRef}
        commandAutocompleteKeyboardNavigationRef={commandAutocompleteKeyboardNavigationRef}
        scheduleCommandAutocompleteSuggestions={scheduleCommandAutocompleteSuggestions}
        clearCommandAutocompleteBlurTimer={clearCommandAutocompleteBlurTimer}
        commandAutocompleteBlurTimerRef={commandAutocompleteBlurTimerRef}
        updateCommandAutocompletePopupPosition={updateCommandAutocompletePopupPosition}
        closeCommandAutocomplete={closeCommandAutocomplete}
        loadCommandAutocompleteSuggestions={loadCommandAutocompleteSuggestions}
        applyCommandAutocompleteItem={applyCommandAutocompleteItem}
        toggleCommandInputHints={toggleCommandInputHints}
        altOpenHistoryEnabled={altOpenHistoryEnabled}
        openHistoryAndFocusSearch={openHistoryAndFocusSearch}
        handleInputContextMenu={handleInputContextMenu}
        setShowHistory={setShowHistory}
        showHistory={showHistory}
        showCommands={showCommands}
        historyBtnRef={historyBtnRef}
        toggleHistory={toggleHistory}
        toggleCommands={toggleCommands}
        executeCommand={executeCommand}
        cmdTrimmed={cmdTrimmed}
        isConnected={isConnected}
        copyCommand={copyCommand}
        multiLineWrapEnabled={multiLineWrapEnabled}
        toggleMultiLineWrap={toggleMultiLineWrap}
        t={t}
      />
      </div>

      {(commandAutocomplete.open || commandAutocomplete.loading) && !showHistory && !showCommands && commandAutocompletePopupPos && (
        <TerminalAutocompletePopup
          commandAutocomplete={commandAutocomplete}
          setCommandAutocomplete={setCommandAutocomplete}
          commandAutocompletePopupPos={commandAutocompletePopupPos}
          commandAutocompleteListRef={commandAutocompleteListRef}
          applyCommandAutocompleteItem={applyCommandAutocompleteItem}
          t={t}
        />
      )}

      {/* ── 历史指令弹窗（fixed 定位，不受 overflow:hidden 裁剪） ── */}
      {showHistory && historyPopupPos && (
        <TerminalHistoryPopup
          historyPopupPos={historyPopupPos}
          historyPopupRef={historyPopupRef}
          historyScrollRef={historyScrollRef}
          historySearchInputRef={historySearchInputRef}
          altOpenHistoryEnabled={altOpenHistoryEnabled}
          setAltOpenHistoryEnabled={setAltOpenHistoryEnabled}
          historyMode={historyMode}
          setHistoryMode={setHistoryMode}
          setHistoryList={setHistoryList}
          setShowHistory={setShowHistory}
          setHistoryPopupPos={setHistoryPopupPos}
          filteredHistory={filteredHistory}
          displayHistory={displayHistory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          historySelectedIndex={historySelectedIndex}
          handleHistorySearchKeyDown={handleHistorySearchKeyDown}
          selectHistoryCmd={selectHistoryCmd}
          executeCommand={executeCommand}
          deleteHistoryItem={deleteHistoryItem}
          serverId={serverId}
          historyServerId={historyServerId}
          t={t}
        />
      )}

      {/* ── 快捷命令二次确认框（ui/Modal；z 层降到 Z.DIALOG） ── */}
      {pendingQuickCmd && (
        <TerminalQuickCmdConfirm
          pendingQuickCmd={pendingQuickCmd}
          setPendingQuickCmd={setPendingQuickCmd}
          sendQuickCmdConfirmed={sendQuickCmdConfirmed}
          isConnected={isConnected}
          quickCmdHistoryParam={quickCmdHistoryParam}
          setQuickCmdHistoryParam={setQuickCmdHistoryParam}
          quickCmdHistoryPosition={quickCmdHistoryPosition}
          setQuickCmdHistoryPosition={setQuickCmdHistoryPosition}
          quickCmdHistorySearch={quickCmdHistorySearch}
          setQuickCmdHistorySearch={setQuickCmdHistorySearch}
          quickCmdParamHistory={quickCmdParamHistory}
          setQuickCmdParamHistory={setQuickCmdParamHistory}
          quickCmdParamHistoryRef={quickCmdParamHistoryRef}
          t={t}
        />
      )}

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