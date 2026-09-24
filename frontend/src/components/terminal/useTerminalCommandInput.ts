import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import * as AppGo from '../../../wailsjs/go/wailsapp/App.js';
import { EventsOn } from '../../../wailsjs/runtime/runtime.js';
import { extractQuickCommandParams } from '../../utils/quickCommandParams.ts';
import { buildWrappedMultiLineCommand, createGatedLineSender, getTextareaAutocompletePopupPosition, isInteractivePromptText } from '../../utils/terminalHelpers.ts';
import { warnDev } from '../../utils/devLog';
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
} from '../../utils/terminalCommandAutocomplete.ts';
import type { I18nKey } from '../../i18n.ts';

type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string;

// 底部命令输入栏逻辑：命令文本与高度自适应、多行包裹开关、cwd 跟踪、
// 命令自动补全（静态候选 + 远端路径 + 防抖加载）与提交执行。
// 从 Terminal.tsx 原样搬移，闭包变量同名传入。
export function useTerminalCommandInput(deps: {
  sessionId: string;
  serverId: string;
  historyServerId: string;
  showHistory: boolean;
  showCommands: boolean;
  isConnected: boolean;
  isClosed: boolean;
  isError: boolean;
  multiLineWrapEnabled: boolean;
  prepareScreenScrollbackRef: React.RefObject<(command: string) => void>;
  awaitingPasswordRef: React.RefObject<boolean>;
  awaitingCommandFinishRef: React.RefObject<boolean>;
  termRef: React.RefObject<XTerm | null>;
  openQuickCmdConfirm: (item: FlattenedQuickCommand) => void;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
  setHistoryPopupPos: React.Dispatch<React.SetStateAction<{ left: number; bottom: number } | null>>;
  t: LooseT;
}) {
  const {
    sessionId, serverId, historyServerId, showHistory, showCommands,
    isConnected, isClosed, isError, multiLineWrapEnabled,
    prepareScreenScrollbackRef, awaitingPasswordRef, awaitingCommandFinishRef, termRef,
    openQuickCmdConfirm, setShowHistory, setHistoryPopupPos, t,
  } = deps;

  const [cmdInput, setCmdInput]               = useState('');
  const cmdInputRef                           = useRef<HTMLTextAreaElement | null>(null);
  // 多行直接会话执行的逐行发送链取消句柄(新提交时取消,防陈旧分片后发)
  const cancelPacedPasteRef                   = useRef<() => void>(() => {});
  // 多行直接会话执行：逐行 + 提示符回归门控发送器(单例，重渲染不重建)
  const gatedLineSenderRef                    = useRef<((lines: string[]) => () => void) | null>(null);
  const gatedLineSender = (() => {
    if (!gatedLineSenderRef.current) {
      gatedLineSenderRef.current = createGatedLineSender({
        send: (chunk) => {
          AppGo.WriteTerminal(sessionId, chunk).catch((err) => {
            warnDev('WriteTerminal failed:', err);
          });
          return true;
        },
        armCommandFinish: () => { awaitingCommandFinishRef.current = true; },
      });
    }
    return gatedLineSenderRef.current;
  })();
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
  // 上一次广播出去的输入框高度（连同会话）：仅在高度真正变化时才通知终端重排，
  // 避免每次按键都扰动 xterm；会话切换时也要重新广播，防止终端侧「撑高」状态残留。
  const cmdInputHeightRef = useRef<{ sessionId: string; height: number }>({ sessionId: '', height: 36 });

  const syncCommandInputHeight = useCallback(() => {
    const element = cmdInputRef.current
    if (!element) return
    element.style.height = '36px'
    element.style.overflowY = 'hidden'
    element.scrollTop = 0
    let nextHeight = 36
    if (element.value) {
      const scrollHeight = Math.max(element.scrollHeight, 36)
      nextHeight = Math.min(scrollHeight, 132)
      element.style.height = `${nextHeight}px`
      if (scrollHeight > 132) {
        element.style.overflowY = 'auto'
      }
    }
    // 输入栏高度变化会通过 flex 挤压上方 xterm 可视区，必须在绘制前（本函数在
    // useLayoutEffect 里调用）让终端重排行列，否则容器已收缩、xterm 还停在旧行数，
    // 底部几行会被裁掉。终端侧只重排视觉，不会把缩小的行数发给 PTY
    // （见 useTerminalSession 的 inputBarTallRef：撑高是纯本地 UI，不能触发远端 SIGWINCH）。
    const last = cmdInputHeightRef.current
    if (last.sessionId !== sessionId || last.height !== nextHeight) {
      cmdInputHeightRef.current = { sessionId, height: nextHeight }
      window.dispatchEvent(new CustomEvent('terminal-command-input-resized', { detail: { sessionId, height: nextHeight } }))
    }
  }, [sessionId])

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
    prepareScreenScrollbackRef.current(text);
    if (isBlankSubmit) {
      AppGo.WriteTerminal(sessionId, '\r').catch((err) => {
        warnDev('WriteTerminal failed:', err);
      });
    } else if (multiLineWrapEnabled && lineCount > 1) {
      AppGo.WriteTerminal(sessionId, buildWrappedMultiLineCommand(normalizedText)).catch((err) => {
        warnDev('WriteTerminal failed:', err);
      });
    } else if (lineCount > 1) {
      // 多行直接会话执行：逐行 + 提示符回归门控，与远端时序无关
      cancelPacedPasteRef.current?.();
      cancelPacedPasteRef.current = gatedLineSender(text.split('\n'));
    } else {
      AppGo.WriteTerminal(sessionId, text + '\r').catch((err) => {
        warnDev('WriteTerminal failed:', err);
      });
    }
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
    if (!(cmdInput.trim())) return;
    navigator.clipboard.writeText(cmdInput).catch(() => {});
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
      confirmed = Boolean(await window.lumeDialog?.confirm(detail, t('提示')));
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

  return {
    cmdInput,
    setCmdInput,
    cmdInputRef,
    commandAutocomplete,
    setCommandAutocomplete,
    commandAutocompletePopupPos,
    commandAutocompleteListRef,
    commandAutocompleteFocusedRef,
    commandAutocompleteKeyboardNavigationRef,
    commandAutocompleteBlurTimerRef,
    cmdInputHintsHidden,
    toggleCommandInputHints,
    closeCommandAutocomplete,
    scheduleCommandAutocompleteSuggestions,
    loadCommandAutocompleteSuggestions,
    applyCommandAutocompleteItem,
    updateCommandAutocompletePopupPosition,
    clearCommandAutocompleteBlurTimer,
    syncCommandInputHeight,
    executeCommand,
    copyCommand,
  };
}
