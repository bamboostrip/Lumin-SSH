import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { EventsOn } from '../../../wailsjs/runtime/runtime.js';
import * as AppGo from '../../../wailsjs/go/wailsapp/App.js';
import type { TransferChunk, TransferQueueItem } from '../../utils/fileWorkbench.ts';
import {
  getSessionCachedFileManagerPathItems,
  getSessionUploadPanelState,
  getSessionUploadQueue,
  getSessionWorkbenchState,
  setSessionCachedFileManagerPathItems,
  setSessionFileManagerWorkspace,
  setSessionUploadPanelState,
  setSessionWorkbenchState,
  subscribeSessionUploadPanelState,
  subscribeSessionUploadQueue,
  subscribeSessionWorkbenchState,
  updateSessionUploadQueue,
} from '../../utils/fileWorkbench.ts';
import {
  DEFAULT_FILE_MANAGER_DOWNLOAD_DIR,
  DOWNLOAD_CONFLICT_STRATEGY_AUTO_RENAME,
  DOWNLOAD_CONFLICT_STRATEGY_DIFF_OVERWRITE,
  DOWNLOAD_CONFLICT_STRATEGY_FORCE_OVERWRITE,
  DOWNLOAD_CONFLICT_STRATEGY_PROMPT,
  MAX_CHUNK_UPLOAD_RETRIES,
  UPLOAD_ABORT_SENTINEL,
  UPLOAD_PANEL_CLOSE_ANIMATION_MS,
  buildDownloadConflictOptionsPayload,
  computeCompressedOverallProgress,
  createLimiter,
  createLocalItemShell,
  downloadConflictKindLabel,
  fmtDate,
  fmtSize,
  getDownloadConflictSettingsFromStorage,
  isCompressedTransferEnabled,
  isHiddenFile,
  parsePositiveInt,
  readBlobAsBase64,
  runWithLimitSettled,
  shouldAutoOpenTransferQueue,
  uploadChunkWithRetry,
  upsertLocalItem,
} from '../../utils/fileManagerHelpers.tsx';
import type { FileManagerDownloadConflictSettings } from '../../utils/fileManagerHelpers.tsx';
import type { FileManagerDownloadConflict, FileManagerFileItem, LoadDirOptions, LooseT } from './fileManagerTypes.ts';

// 文件传输引擎 hook：上传（分块/压缩）、下载（文件/文件夹/压缩）、跨面板传输、
// 传输队列与上传面板状态、进度事件订阅。从 FileManager 主组件原样搬移，
// 依赖（目录刷新、视图保持、撤销栈等）经 deps 注入。
interface UseFileManagerTransfersDeps {
  sessionId: string
  sessionGroupId: string
  isActive: boolean
  addToast?: (message: string | Error, type?: string, duration?: number, actions?: unknown[]) => number
  t: LooseT
  currentPath: string
  currentPathRef: React.RefObject<string>
  mountedRef: React.RefObject<boolean>
  items: FileManagerFileItem[]
  normalizePath: (value: unknown) => string
  joinPath: (base: string, name: string) => string
  loadDir: (path: unknown, options?: LoadDirOptions | boolean) => Promise<boolean>
  refreshDirectoryAfterTransfer: (targetPath: unknown) => Promise<void>
  operationInProgressRef: React.RefObject<boolean>
  setOperationProgress: React.Dispatch<React.SetStateAction<{ message: string; current?: number; total?: number } | null>>
  updateItemsPreservingView: (updater: FileManagerFileItem[] | ((current: FileManagerFileItem[]) => FileManagerFileItem[])) => void
  queueRowEffectForMatchingPanes: (directoryPath: unknown, logicalKey: string, rowKey: string, effect: string) => void
  updateClipboard: (newClipboard: unknown) => void
  setSelectedPaths: React.Dispatch<React.SetStateAction<string[]>>
  lastClickedPathRef: React.RefObject<string | null>
  pushFileManagerUndoEntry: (entry: unknown) => void
}

export function useFileManagerTransfers({
  sessionId,
  sessionGroupId,
  isActive,
  addToast,
  t,
  currentPath,
  currentPathRef,
  mountedRef,
  items,
  normalizePath,
  joinPath,
  loadDir,
  refreshDirectoryAfterTransfer,
  operationInProgressRef,
  setOperationProgress,
  updateItemsPreservingView,
  queueRowEffectForMatchingPanes,
  updateClipboard,
  setSelectedPaths,
  lastClickedPathRef,
  pushFileManagerUndoEntry,
}: UseFileManagerTransfersDeps) {
  const abortedUploadIdsRef = useRef<Set<string>>(new Set());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement | null>(null);
  const setTransferInfo = useCallback((info: unknown) => {}, []);
  const [workbenchState, setWorkbenchStateState] = useState(() => getSessionWorkbenchState(sessionGroupId));
  const [uploadPanelState, setUploadPanelState] = useState(() => getSessionUploadPanelState(sessionGroupId, sessionId));
  const [uploadQueueItems, setUploadQueueItems] = useState<TransferQueueItem[]>(() => getSessionUploadQueue(sessionGroupId));
  const activeUploadCount = useMemo(() => uploadQueueItems.filter((item) => item.status === 'queued' || item.status === 'uploading').length, [uploadQueueItems]);
  const uploadPanelCloseTimerRef = useRef(0);
  const [uploadPanelClosing, setUploadPanelClosing] = useState(false);

  const clearUploadPanelCloseTimer = useCallback(() => {
    if (uploadPanelCloseTimerRef.current) {
      window.clearTimeout(uploadPanelCloseTimerRef.current);
      uploadPanelCloseTimerRef.current = 0;
    }
  }, []);

  useEffect(() => () => {
    clearUploadPanelCloseTimer();
  }, [clearUploadPanelCloseTimer]);

  useEffect(() => {
    if (!sessionGroupId) return undefined;
    return subscribeSessionWorkbenchState(sessionGroupId, setWorkbenchStateState);
  }, [sessionGroupId]);

  useEffect(() => {
    if (!sessionGroupId || !sessionId) return undefined;
    return subscribeSessionUploadPanelState(sessionGroupId, sessionId, setUploadPanelState);
  }, [sessionGroupId, sessionId]);

  useEffect(() => {
    if (!sessionGroupId) return undefined;
    return subscribeSessionUploadQueue(sessionGroupId, setUploadQueueItems);
  }, [sessionGroupId]);

  useEffect(() => {
    if (isActive || !sessionGroupId || !sessionId) return;
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(false);
    if (uploadPanelState.uploadOpen) {
      setSessionUploadPanelState(sessionGroupId, sessionId, { uploadOpen: false });
    }
  }, [clearUploadPanelCloseTimer, isActive, sessionGroupId, sessionId, uploadPanelState.uploadOpen]);

  const openUploadPanel = useCallback(() => {
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(false);
    setSessionUploadPanelState(sessionGroupId, sessionId, {
      uploadOpen: true,
    });
    setSessionWorkbenchState(sessionGroupId, {
      activeTab: 'upload',
    });
  }, [clearUploadPanelCloseTimer, sessionGroupId, sessionId]);

  const finishUploadPanelClose = useCallback(() => {
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(false);
    const current = getSessionWorkbenchState(sessionGroupId);
    setSessionUploadPanelState(sessionGroupId, sessionId, {
      uploadOpen: false,
    });
    setSessionWorkbenchState(sessionGroupId, {
      activeTab: current.editorSplitOpen ? 'editor' : current.activeTab,
    });
  }, [clearUploadPanelCloseTimer, sessionGroupId, sessionId]);

  const closeUploadPanel = useCallback(() => {
    const current = getSessionUploadPanelState(sessionGroupId, sessionId);
    if (!current.uploadOpen && !uploadPanelClosing) {
      return;
    }
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(true);
    uploadPanelCloseTimerRef.current = window.setTimeout(() => {
      finishUploadPanelClose();
    }, UPLOAD_PANEL_CLOSE_ANIMATION_MS);
  }, [clearUploadPanelCloseTimer, finishUploadPanelClose, sessionGroupId, uploadPanelClosing]);

  const setUploadPanelOpen = useCallback((open: boolean) => {
    if (open) {
      openUploadPanel();
      return;
    }
    closeUploadPanel();
  }, [closeUploadPanel, openUploadPanel]);

  const openTransferQueueIfNeeded = useCallback(() => {
    if (shouldAutoOpenTransferQueue()) {
      setUploadPanelOpen(true);
    }
  }, [setUploadPanelOpen]);

  const transferTaskLimiterRef = useRef<{ limit: number; run: ((fn: () => unknown) => Promise<unknown>) | null }>({ limit: 0, run: null });
  const uploadChunkLimiterRef = useRef<{ limit: number; run: ((fn: () => unknown) => Promise<unknown>) | null }>({ limit: 0, run: null });

  const getTransferTaskRunner = useCallback((limit: number): (fn: () => unknown) => Promise<unknown> => {
    const normalizedLimit = Math.max(1, limit);
    const currentLimiter = transferTaskLimiterRef.current;
    if (!currentLimiter.run || currentLimiter.limit !== normalizedLimit) {
      transferTaskLimiterRef.current = {
        limit: normalizedLimit,
        run: createLimiter(normalizedLimit),
      };
    }
    return transferTaskLimiterRef.current.run as (fn: () => unknown) => Promise<unknown>;
  }, []);

  const getUploadChunkRunner = useCallback((limit: number): (fn: () => unknown) => Promise<unknown> => {
    const normalizedLimit = Math.max(1, limit);
    const currentLimiter = uploadChunkLimiterRef.current;
    if (!currentLimiter.run || currentLimiter.limit !== normalizedLimit) {
      uploadChunkLimiterRef.current = {
        limit: normalizedLimit,
        run: createLimiter(normalizedLimit),
      };
    }
    return uploadChunkLimiterRef.current.run as (fn: () => unknown) => Promise<unknown>;
  }, []);

  const toggleUploadPanel = useCallback(() => {
    if (uploadPanelClosing) {
      openUploadPanel();
      return;
    }
    const current = getSessionUploadPanelState(sessionGroupId, sessionId);
    if (current.uploadOpen) {
      closeUploadPanel();
      return;
    }
    openUploadPanel();
  }, [closeUploadPanel, openUploadPanel, sessionGroupId, sessionId, uploadPanelClosing]);

  useEffect(() => {
    const host = document.getElementById('editor-split-host');
    const container = document.getElementById('session-editor-container');
    const resizer = document.getElementById('editor-split-resizer');
    const mainContent = document.getElementById('editor-main-content');
    if (!host || !container) return undefined;

    const resetLayout = () => {
      if (resizer) resizer.style.display = 'none';
      if (mainContent) mainContent.style.order = '1';
      container.style.flexDirection = 'row';
      host.style.width = '0px';
      host.style.height = '100%';
      host.style.minWidth = '0px';
      host.style.maxWidth = '0px';
      host.style.minHeight = '0px';
      host.style.maxHeight = '0px';
      host.style.borderLeft = 'none';
      host.style.borderRight = 'none';
      host.style.borderTop = 'none';
      host.style.order = '2';
    };

    if (!isActive || !uploadPanelState.uploadOpen || workbenchState.editorSplitOpen) {
      if (!workbenchState.editorSplitOpen) resetLayout();
      return undefined;
    }

    if (mainContent) mainContent.style.order = '0';
    if (resizer) {
      resizer.style.display = '';
      resizer.style.order = '1';
      // 上传面板在右侧：热区偏右，避免终端划词误触
      resizer.classList.remove('hotzone-left', 'hotzone-right');
      resizer.classList.add('hotzone-right');
    }
    container.style.flexDirection = 'row';
    host.style.width = '42%';
    host.style.height = '100%';
    host.style.minWidth = '320px';
    host.style.maxWidth = '70%';
    host.style.minHeight = '0px';
    host.style.maxHeight = 'none';
    host.style.borderLeft = '1px solid var(--border)';
    host.style.borderRight = 'none';
    host.style.borderTop = 'none';
    host.style.order = '2';

    return () => {
      const latestWorkbench = getSessionWorkbenchState(sessionGroupId);
      const latestUploadPanel = getSessionUploadPanelState(sessionGroupId, sessionId);
      if (!latestUploadPanel.uploadOpen && !latestWorkbench.editorSplitOpen) {
        resetLayout();
      }
    };
  }, [isActive, sessionGroupId, sessionId, workbenchState.editorSplitOpen, uploadPanelState.uploadOpen]);

  useEffect(() => {
    const offCompressed = EventsOn(`compressed-upload-progress-${sessionId}`, (payload = {}) => {
      const uploadId = typeof payload.uploadId === 'string' ? payload.uploadId.trim() : '';
      if (!uploadId) return;
      if (abortedUploadIdsRef.current.has(uploadId)) return;
      updateSessionUploadQueue(sessionGroupId, (current) => current.map((item) => {
        if (item.id !== uploadId) return item;
        const nextPhase = payload.phase || item.phase || 'preparing';
        const nextPhaseProgress = Math.max(0, Math.min(100, Number(payload.phaseProgress) || 0));
        const hasBytesDone = payload.bytesDone !== undefined && payload.bytesDone !== null && Number.isFinite(Number(payload.bytesDone));
        const hasBytesTotal = payload.bytesTotal !== undefined && payload.bytesTotal !== null && Number.isFinite(Number(payload.bytesTotal));
        return {
          ...item,
          phase: nextPhase,
          phaseProgress: nextPhaseProgress,
          progress: computeCompressedOverallProgress(nextPhase, nextPhaseProgress, item.progress),
          bytesUploaded: hasBytesDone ? Number(payload.bytesDone) : item.bytesUploaded,
          bytesTotal: hasBytesTotal ? Number(payload.bytesTotal) : item.bytesTotal,
          phaseCurrent: payload.current || '',
          phaseDetail: payload.detail || '',
          updatedAt: Date.now(),
        };
      }));
    });
    return () => {
      offCompressed?.();
    };
  }, [sessionId, sessionGroupId]);

  useEffect(() => {
    const offDownload = EventsOn(`download-transfer-progress-${sessionId}`, (payload = {}) => {
      const downloadId = typeof payload.downloadId === 'string' ? payload.downloadId.trim() : '';
      if (!downloadId) return;
      if (abortedUploadIdsRef.current.has(downloadId)) return;
      updateSessionUploadQueue(sessionGroupId, (current) => current.map((item: TransferQueueItem) => {
        if (item.id !== downloadId) return item;
        const nextStatus = payload.status || item.status || 'uploading';
        const nextPhase = payload.phase || item.phase || '';
        const nextProgress = Math.max(0, Math.min(100, Number.isFinite(Number(payload.progress)) ? Number(payload.progress) : (nextStatus === 'completed' ? 100 : (item.progress || 0))));
        const hasBytesDone = payload.bytesDone !== undefined && payload.bytesDone !== null && Number.isFinite(Number(payload.bytesDone));
        const hasBytesTotal = payload.bytesTotal !== undefined && payload.bytesTotal !== null && Number.isFinite(Number(payload.bytesTotal));
        return {
          ...item,
          direction: 'download',
          mode: payload.mode || item.mode || 'download-file',
          status: nextStatus,
          phase: nextPhase,
          progress: nextProgress,
          bytesUploaded: hasBytesDone ? Number(payload.bytesDone) : item.bytesUploaded,
          bytesTotal: hasBytesTotal ? Number(payload.bytesTotal) : item.bytesTotal,
          phaseCurrent: payload.current || item.phaseCurrent || '',
          phaseDetail: payload.detail || item.phaseDetail || '',
          updatedAt: Date.now(),
        };
      }));
    });
    return () => {
      offDownload?.();
    };
  }, [sessionId, sessionGroupId]);

  const getUploadSettings = useCallback(() => ({
    chunkSizeKiB: parsePositiveInt(localStorage.getItem('fileManagerUploadChunkSizeKiB'), 256),
    maxTransferTasks: parsePositiveInt(localStorage.getItem('fileManagerUploadMaxFiles'), 6),
    maxChunksPerFile: parsePositiveInt(localStorage.getItem('fileManagerUploadMaxChunksPerFile'), 8),
    globalInflightLimit: parsePositiveInt(localStorage.getItem('fileManagerUploadGlobalInflightLimit'), 24),
  }), []);
  const getDefaultDownloadDir = useCallback(() => (
    localStorage.getItem('fileManagerDownloadDefaultDir') || DEFAULT_FILE_MANAGER_DOWNLOAD_DIR
  ).trim() || DEFAULT_FILE_MANAGER_DOWNLOAD_DIR, []);
  const getDownloadConflictSettings = useCallback(() => getDownloadConflictSettingsFromStorage(), []);
  const buildDownloadConflictMessage = useCallback((conflict: FileManagerDownloadConflict, fallbackName: unknown) => {
    const relativePath = String(conflict?.relativePath || '').trim() || fallbackName || t('当前文件');
    const localSize = conflict?.localSize === undefined || conflict?.localSize === null ? '-' : fmtSize(Number(conflict.localSize) || 0);
    const remoteSize = conflict?.remoteSize === undefined || conflict?.remoteSize === null ? '-' : fmtSize(Number(conflict.remoteSize) || 0);
    const localModifyTime = conflict?.localModifyTime === undefined || conflict?.localModifyTime === null ? '-' : fmtDate(Number(conflict.localModifyTime));
    const remoteModifyTime = conflict?.remoteModifyTime === undefined || conflict?.remoteModifyTime === null ? '-' : fmtDate(Number(conflict.remoteModifyTime));
    const lines = [
      `${t('冲突项')}: ${relativePath}`,
      `${t('本地路径')}: ${conflict?.localPath || '-'}`,
      `${t('本地类型')}: ${downloadConflictKindLabel(conflict?.localKind, t)}`,
      `${t('远端类型')}: ${downloadConflictKindLabel(conflict?.remoteKind, t)}`,
    ];
    if (conflict?.localKind === 'file' || conflict?.remoteKind === 'file') {
      lines.push(`${t('本地大小')}: ${localSize}`);
      lines.push(`${t('远端大小')}: ${remoteSize}`);
      lines.push(`${t('本地修改时间')}: ${localModifyTime}`);
      lines.push(`${t('远端修改时间')}: ${remoteModifyTime}`);
    }
    lines.push('');
    lines.push(t('请选择本次冲突的处理方式'));
    return lines.join('\n');
  }, [t]);
  const resolvePromptDownloadConflict = useCallback(async (item: FileManagerFileItem, remotePath: unknown, localPath: string, settings: FileManagerDownloadConflictSettings) => {
    const previewDownloadConflicts = window?.go?.wailsapp?.App?.PreviewDownloadConflicts;
    const resolveDownloadLocalPath = window?.go?.wailsapp?.App?.ResolveDownloadLocalPath;
    if (typeof previewDownloadConflicts !== 'function') {
      throw new Error(t('当前环境不支持下载冲突处理'));
    }
    const conflicts = await previewDownloadConflicts(sessionId, String(remotePath || ''), String(localPath || ''), item.isDirectory);
    if (!Array.isArray(conflicts) || conflicts.length === 0) {
      return {
        localPath,
        optionsJSON: buildDownloadConflictOptionsPayload(settings, {
          strategy: DOWNLOAD_CONFLICT_STRATEGY_FORCE_OVERWRITE,
          pathStrategies: {},
        }),
      };
    }
    const buttons = [
      { label: t('差异覆盖'), value: DOWNLOAD_CONFLICT_STRATEGY_DIFF_OVERWRITE, primary: true },
      { label: t('强制覆盖'), value: DOWNLOAD_CONFLICT_STRATEGY_FORCE_OVERWRITE },
      { label: t('自动重命名'), value: DOWNLOAD_CONFLICT_STRATEGY_AUTO_RENAME },
      { label: t('取消'), value: 'cancel', secondary: true },
    ];
    const autoRenameOptionsJSON = buildDownloadConflictOptionsPayload(settings, {
      strategy: DOWNLOAD_CONFLICT_STRATEGY_AUTO_RENAME,
      pathStrategies: {},
    });
    for (const conflict of conflicts) {
      const choice = await window.luminDialog?.choice(
        buildDownloadConflictMessage(conflict, item.name),
        t('下载同名冲突'),
        buttons,
        t('应用到本次剩余冲突'),
      );
      const choiceValue = choice && typeof choice === 'object' ? (choice as { value?: string; checked?: boolean }).value : undefined;
      const choiceChecked = choice && typeof choice === 'object' ? (choice as { value?: string; checked?: boolean }).checked : false;
      if (!choiceValue || choiceValue === 'cancel') {
        return null;
      }
      if (choiceChecked) {
        if (choiceValue === DOWNLOAD_CONFLICT_STRATEGY_AUTO_RENAME) {
          const renamedPath = typeof resolveDownloadLocalPath === 'function'
            ? await resolveDownloadLocalPath(localPath, item.isDirectory, autoRenameOptionsJSON)
            : localPath;
          return {
            localPath: renamedPath || localPath,
            optionsJSON: autoRenameOptionsJSON,
          };
        }
        return {
          localPath,
          optionsJSON: buildDownloadConflictOptionsPayload(settings, {
            strategy: choiceValue,
            pathStrategies: {},
          }),
        };
      }
      const conflictKey = String(conflict?.key || '.').trim() || '.';
      if (conflictKey === '.' && choiceValue === DOWNLOAD_CONFLICT_STRATEGY_AUTO_RENAME) {
        const renamedPath = typeof resolveDownloadLocalPath === 'function'
          ? await resolveDownloadLocalPath(localPath, item.isDirectory, autoRenameOptionsJSON)
          : localPath;
        return {
          localPath: renamedPath || localPath,
          optionsJSON: autoRenameOptionsJSON,
        };
      }
      settings = {
        ...settings,
        pathStrategies: {
          ...(settings.pathStrategies || {}),
          [conflictKey]: choiceValue,
        },
      };
    }
    return {
      localPath,
      optionsJSON: buildDownloadConflictOptionsPayload(settings, {
        strategy: DOWNLOAD_CONFLICT_STRATEGY_FORCE_OVERWRITE,
        pathStrategies: settings.pathStrategies || {},
      }),
    };
  }, [buildDownloadConflictMessage, sessionId, t]);

  const isUploadAbortable = useCallback((item: TransferQueueItem) => {
    if (!item) return false;
    if (item.direction === 'download') {
      if (item.mode === 'download-compressed') {
        return ['preparing', 'compressing', 'downloading', 'extracting'].includes(item.phase ?? '');
      }
      return item.status === 'queued' || item.status === 'uploading';
    }
    if (item.mode === 'compressed') {
      return ['preparing', 'scanning', 'compressing', 'uploading', 'uploading-file', 'verifying', 'extracting'].includes(item.phase ?? '');
    }
    return item.status === 'queued' || item.status === 'uploading';
  }, []);

  const markUploadAborted = useCallback((queueId: unknown, detail: string = t('已终止')) => {
    if (!queueId) return;
    abortedUploadIdsRef.current.add(String(queueId));
    updateSessionUploadQueue(sessionGroupId, (current) => current.map((item) => (
      item.id === queueId
        ? {
            ...item,
            status: 'failed',
            phase: item.mode === 'compressed' ? 'failed' : item.phase,
            phaseDetail: detail,
            error: detail,
            updatedAt: Date.now(),
          }
        : item
    )));
  }, [sessionGroupId, t]);

  const abortUploadItem = useCallback(async (item: TransferQueueItem, detail: string = t('已终止')) => {
    if (!item) return;
    markUploadAborted(item.id, detail);
    try {
      if (item.direction === 'download') {
        await window?.go?.wailsapp?.App?.AbortDownloadTransfer?.(item.id);
        return;
      }
      if (item.mode === 'compressed') {
        await window?.go?.wailsapp?.App?.AbortCompressedUpload?.(item.id);
        return;
      }
      if (item.taskId && item.fileId) {
        await AppGo.AbortChunkedUploadFile(String(item.taskId), String(item.fileId)).catch(() => {});
      }
    } catch (_) {}
  }, [markUploadAborted, t]);

  const removeUploadItems = useCallback((ids: unknown) => {
    const normalizedIds = new Set(
      Array.from((ids || []) as unknown[])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    );
    if (normalizedIds.size === 0) {
      return;
    }
    normalizedIds.forEach((id) => abortedUploadIdsRef.current.delete(id));
    let shouldClosePanel = false;
    updateSessionUploadQueue(sessionGroupId, (current) => {
      const next = current.filter((item) => !normalizedIds.has(item.id));
      shouldClosePanel = next.length === 0;
      return next;
    });
    if (shouldClosePanel) {
      closeUploadPanel();
    }
  }, [closeUploadPanel, sessionGroupId]);

  const abortUploadItems = useCallback((items: TransferQueueItem[], detail: string = t('已终止')) => {
    (items || []).forEach((item) => {
      if (item) {
        void abortUploadItem(item, detail);
      }
    });
  }, [abortUploadItem, t]);

  const abortActiveUploadsForSession = useCallback((disconnectedSessionId: unknown, detail: string = t('已终止')) => {
    if (!disconnectedSessionId || disconnectedSessionId !== sessionId) return;
    const queue = getSessionUploadQueue(sessionGroupId)
      .filter((item) => item?.sourceTerminalId === disconnectedSessionId)
      .filter((item) => isUploadAbortable(item));
    queue.forEach((item) => {
      void abortUploadItem(item, detail);
    });
  }, [abortUploadItem, isUploadAbortable, sessionGroupId, sessionId, t]);

  useEffect(() => () => {
    abortActiveUploadsForSession(sessionId, t('已终止'));
  }, [abortActiveUploadsForSession, sessionId, t]);

  const uploadNativePaths = useCallback(async (paths: unknown) => {
    const localPaths = Array.from((paths || []) as unknown[]).map((path) => String(path || '').trim()).filter(Boolean);
    if (localPaths.length === 0) {
      return;
    }
    const uploadTargetPath = normalizePath(currentPathRef.current || currentPath) || '/';
    openTransferQueueIfNeeded();
    const settings = getUploadSettings();
    const createdAt = Date.now();
    const queueSeed: TransferQueueItem[] = localPaths.map((localPath, index) => {
      const name = localPath.split(/[\\/]/).filter(Boolean).pop() || t('文件');
      return {
        id: `native-upload-${createdAt}-${index}`,
        name,
        relativePath: name,
        remotePath: joinPath(uploadTargetPath, name),
        status: 'queued',
        progress: 0,
        bytesUploaded: 0,
        bytesTotal: 0,
        chunkSizeBytes: Math.max(1, settings.chunkSizeKiB * 1024),
        chunksTotal: 0,
        chunksCompleted: 0,
        chunksFailed: 0,
        chunks: [],
        error: '',
        sourceTerminalId: sessionId,
        mode: 'compressed',
        phase: 'preparing',
        phaseProgress: 0,
        phaseCurrent: '',
        phaseDetail: t('准备上传'),
        localPathCount: 1,
        createdAt: createdAt + index,
        updatedAt: createdAt + index,
      };
    });
    updateSessionUploadQueue(sessionGroupId, (current) => [...queueSeed, ...current]);
    const patchQueueItem = (queueId: unknown, patch: Record<string, unknown> | ((item: TransferQueueItem) => TransferQueueItem)) => {
      updateSessionUploadQueue(sessionGroupId, (current) => current.map((item: TransferQueueItem) => (
        item.id === queueId
          ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) }
          : item
      )));
    };
    const transferTaskRunner = getTransferTaskRunner(settings.maxTransferTasks);
    let successCount = 0;
    const failures: string[] = [];
    await Promise.all(localPaths.map((localPath, index) => transferTaskRunner(async () => {
      const queueId = queueSeed[index]?.id;
      const name = queueSeed[index]?.name || localPath.split(/[\\/]/).filter(Boolean).pop() || t('文件');
      if (!queueId || abortedUploadIdsRef.current.has(queueId)) {
        return;
      }
      patchQueueItem(queueId, { status: 'uploading', updatedAt: Date.now() });
      try {
        await window?.go?.wailsapp?.App?.UploadLocalPathsCompressed?.(
          sessionId,
          queueId,
          Math.max(1, settings.maxChunksPerFile),
          [localPath],
          uploadTargetPath,
        );
        patchQueueItem(queueId, {
          status: 'completed',
          phase: 'completed',
          phaseProgress: 100,
          progress: 100,
          error: '',
          phaseDetail: t('已完成'),
          updatedAt: Date.now(),
        });
        successCount += 1;
      } catch (err) {
        const isAborted = abortedUploadIdsRef.current.has(queueId) || String(err).toLowerCase().includes('context canceled');
        patchQueueItem(queueId, {
          status: 'failed',
          phase: 'failed',
          phaseDetail: isAborted ? t('已终止') : String(err),
          error: isAborted ? t('已终止') : String(err),
          updatedAt: Date.now(),
        });
        if (!isAborted) {
          failures.push(`${name}: ${err}`);
        }
      }
    })));
    if (failures.length > 0) {
      addToast?.(`${successCount > 0 ? t('上传完成') : t('上传失败')}: ${successCount}${t('项成功')}, ${failures.length}${t('项失败')} (${failures.slice(0, 3).join(', ')})`, 'error');
    } else if (successCount > 0) {
      addToast?.(`${t('上传成功')}: ${successCount}${t('项')}`, 'success');
    }
    if (successCount > 0) {
      await refreshDirectoryAfterTransfer(uploadTargetPath);
    }
  }, [sessionId, sessionGroupId, currentPath, addToast, t, getTransferTaskRunner, getUploadSettings, openTransferQueueIfNeeded, normalizePath, refreshDirectoryAfterTransfer]);

  const uploadEntries = useCallback(async (entries: Array<Record<string, unknown>>) => {
    const uploadEntriesList = entries
      .filter((entry) => entry?.file && entry?.relativePath)
      .map((entry) => ({
        file: entry.file as File,
        relativePath: String(entry.relativePath).replace(/^\/+/, '').replace(/\\/g, '/'),
      }))
      .filter((entry) => entry.relativePath !== '');
    if (uploadEntriesList.length === 0) {
      return;
    }

    const uploadTargetPath = normalizePath(currentPathRef.current || currentPath) || '/';
    openTransferQueueIfNeeded();
    const settings = getUploadSettings();
    const chunkSizeBytes = Math.max(1, settings.chunkSizeKiB * 1024);
    const maxChunksPerFile = Math.max(1, settings.maxChunksPerFile);
    const globalInflightLimit = Math.max(1, settings.globalInflightLimit);
    const transferTaskRunner = getTransferTaskRunner(settings.maxTransferTasks);
    const globalChunkLimiter = getUploadChunkRunner(globalInflightLimit);
    const totalFiles = uploadEntriesList.length;
    const totalBytes = uploadEntriesList.reduce((sum, entry) => sum + entry.file.size, 0);
    const createdAt = Date.now();
    const queueSeed = uploadEntriesList.map((entry, index) => {
      const totalChunks = entry.file.size > 0 ? Math.ceil(entry.file.size / chunkSizeBytes) : 0;
      return {
        id: `upload-${createdAt}-${index}`,
        name: entry.file.name,
        relativePath: entry.relativePath,
        remotePath: joinPath(uploadTargetPath, entry.relativePath),
        status: 'queued',
        progress: 0,
        bytesUploaded: 0,
        bytesTotal: entry.file.size,
        chunkSizeBytes,
        chunksTotal: totalChunks,
        chunksCompleted: 0,
        chunksFailed: 0,
        chunks: Array.from({ length: totalChunks }, (_, chunkIndex) => {
          const start = chunkIndex * chunkSizeBytes;
          const end = Math.min(entry.file.size, start + chunkSizeBytes);
          return {
            index: chunkIndex,
            start,
            end,
            size: end - start,
            status: 'queued',
            attempt: 0,
            error: '',
            updatedAt: createdAt + index,
          };
        }),
        error: '',
        sourceTerminalId: sessionId,
        createdAt: createdAt + index,
        updatedAt: createdAt + index,
      };
    });
    updateSessionUploadQueue(sessionGroupId, (current) => [...queueSeed, ...current]);

    let uploadedBytes = 0;
    let completedFiles = 0;
    const failures: string[] = [];
    const patchQueueItem = (queueId: unknown, patch: Record<string, unknown> | ((item: TransferQueueItem) => TransferQueueItem)) => {
      updateSessionUploadQueue(sessionGroupId, (current) => current.map((item: TransferQueueItem) => (
        item.id === queueId
          ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) }
          : item
      )));
    };
    const patchQueueChunk = (queueId: unknown, chunkIndex: number, patch: Record<string, unknown> | ((chunk: TransferChunk) => TransferChunk)) => {
      updateSessionUploadQueue(sessionGroupId, (current) => current.map((item: TransferQueueItem) => {
        if (item.id !== queueId) return item;
        const chunks = Array.isArray(item.chunks) ? item.chunks.map((chunk) => (
          chunk.index === chunkIndex ? { ...chunk, ...(typeof patch === 'function' ? patch(chunk) : patch) } : chunk
        )) : [];
        return {
          ...item,
          chunks,
          chunksCompleted: chunks.filter((chunk) => chunk.status === 'completed').length,
          chunksFailed: chunks.filter((chunk) => chunk.status === 'failed').length,
          updatedAt: Date.now(),
        };
      }));
    };
    const updateTransfer = (activeName = '') => {
      const progress = totalBytes > 0
        ? Math.min(100, (uploadedBytes / totalBytes) * 100)
        : (completedFiles / totalFiles) * 100;
      setTransferInfo({
        name: activeName ? `${completedFiles}/${totalFiles} · ${activeName}` : `${completedFiles}/${totalFiles}`,
        progress,
        direction: 'upload',
      });
    };

    try {
      setTransferInfo({ name: `0/${totalFiles}`, progress: 0, direction: 'upload' });
      await Promise.all(uploadEntriesList.map(({ file, relativePath }, fileIndex) => transferTaskRunner(async () => {
        const queueId = queueSeed[fileIndex]?.id;
        if (!queueId || abortedUploadIdsRef.current.has(queueId)) {
          return;
        }
        let taskId = '';
        let fileId = '';
        let fileUploadedBytes = 0;
        try {
          patchQueueItem(queueId, { status: 'uploading', updatedAt: Date.now() });
          taskId = await AppGo.BeginChunkedUploadTask(sessionId, uploadTargetPath, Math.max(1, Math.min(maxChunksPerFile, globalInflightLimit)));
          patchQueueItem(queueId, { taskId, updatedAt: Date.now() });
          const totalChunks = file.size > 0 ? Math.ceil(file.size / chunkSizeBytes) : 0;
          fileId = await AppGo.BeginChunkedUploadFile(taskId, relativePath, file.size, totalChunks);
          patchQueueItem(queueId, { fileId, updatedAt: Date.now() });
          const chunkIndexes = Array.from({ length: totalChunks }, (_, index) => index);
          const chunkResults = await runWithLimitSettled(chunkIndexes, maxChunksPerFile, async (chunkIndex) => {
            const start = chunkIndex * chunkSizeBytes;
            const end = Math.min(file.size, start + chunkSizeBytes);
            const chunkLabel = `${file.name} 分块 ${chunkIndex + 1}/${Math.max(totalChunks, 1)} [${start}-${end})`;
            await globalChunkLimiter(async () => {
              if (abortedUploadIdsRef.current.has(queueId)) {
                throw new Error(UPLOAD_ABORT_SENTINEL);
              }
              patchQueueChunk(queueId, chunkIndex, { status: 'reading', attempt: 0, error: '', updatedAt: Date.now() });
              const content = await readBlobAsBase64(file.slice(start, end));
              await uploadChunkWithRetry(chunkLabel, () => AppGo.UploadChunkBase64(taskId, fileId, chunkIndex, start, content), (attempt, error) => {
                patchQueueChunk(queueId, chunkIndex, {
                  status: error ? 'retrying' : 'uploading',
                  attempt,
                  error: error ? String(error) : '',
                  updatedAt: Date.now(),
                });
              }, () => abortedUploadIdsRef.current.has(queueId));
              patchQueueChunk(queueId, chunkIndex, { status: 'completed', error: '', updatedAt: Date.now() });
              const delta = end - start;
              uploadedBytes += delta;
              fileUploadedBytes += delta;
              patchQueueItem(queueId, {
                status: 'uploading',
                bytesUploaded: fileUploadedBytes,
                progress: file.size > 0 ? Math.min(100, (fileUploadedBytes / file.size) * 100) : 100,
                updatedAt: Date.now(),
              });
              updateTransfer(file.name);
            });
          });
          const failedChunks = chunkResults
            .map((result, index) => ({ result, index }))
            .filter(({ result }) => result.status === 'rejected');
          if (failedChunks.length > 0) {
            failedChunks.forEach(({ result, index }) => {
              patchQueueChunk(queueId, index, {
                status: 'failed',
                attempt: MAX_CHUNK_UPLOAD_RETRIES,
                error: String(result.status === 'rejected' ? result.reason : ''),
                updatedAt: Date.now(),
              });
            });
            throw new Error(failedChunks.map(({ result }) => String(result.status === 'rejected' ? result.reason : '')).slice(0, 3).join('；'));
          }
          await AppGo.CompleteChunkedUploadFile(taskId, fileId);
          completedFiles++;
          patchQueueItem(queueId, {
            status: 'completed',
            bytesUploaded: file.size,
            progress: 100,
            error: '',
            updatedAt: Date.now(),
          });
          updateTransfer(file.name);
        } catch (err) {
          const isAborted = abortedUploadIdsRef.current.has(queueId) || String(err).includes(UPLOAD_ABORT_SENTINEL);
          if (!isAborted) {
            failures.push(`${relativePath}: ${err}`);
          }
          patchQueueItem(queueId, {
            status: 'failed',
            error: isAborted ? t('已终止') : String(err),
            updatedAt: Date.now(),
          });
          if (fileId && taskId) {
            await AppGo.AbortChunkedUploadFile(taskId, fileId).catch(() => {});
          } else if (taskId) {
            await AppGo.AbortChunkedUploadTask(taskId).catch(() => {});
          } else if (isAborted) {
            markUploadAborted(queueId);
          }
        } finally {
          if (taskId) {
            await AppGo.FinishChunkedUploadTask(taskId).catch(() => {});
          }
        }
      })));

      if (failures.length > 0) {
        addToast?.(`${completedFiles > 0 ? t('上传完成') : t('上传失败')}: ${completedFiles}${t('项成功')}, ${failures.length}${t('项失败')} (${failures.slice(0, 3).join(', ')})`, 'error');
      } else if (completedFiles > 0) {
        addToast?.(`${t('上传成功')}: ${completedFiles}${t('项')}`, 'success');
      }
      if (completedFiles > 0) {
        await refreshDirectoryAfterTransfer(uploadTargetPath);
      }
    } catch (err) {
      if (err) addToast?.(`${t('上传失败')}: ${err}`, 'error');
    } finally {
      if (mountedRef.current) setTransferInfo(null);
    }
  }, [sessionId, sessionGroupId, currentPath, getTransferTaskRunner, getUploadChunkRunner, getUploadSettings, addToast, t, markUploadAborted, openTransferQueueIfNeeded, normalizePath, refreshDirectoryAfterTransfer]);

  useEffect(() => {
    const off = EventsOn('ssh-disconnected', (payload) => {
      const data = (payload && typeof payload === 'object')
        ? payload
        : { sessionId: payload, terminalIds: payload ? [payload] : [] };
      const ids = new Set<string>();
      if (data.sessionId) ids.add(data.sessionId);
      if (data.parentSessionId) ids.add(data.parentSessionId);
      if (Array.isArray(data.terminalIds)) {
        const rawTerminalIds = data.terminalIds
        rawTerminalIds.forEach((id: unknown) => id && ids.add(String(id)));
      }
      ids.forEach((id) => abortActiveUploadsForSession(id, t('已终止')));
    });
    return () => {
      off?.();
    };
  }, [abortActiveUploadsForSession, t]);

  const handleSelectedFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawSelectedFiles = Array.from(e.target.files || []);
    const selectedFiles = rawSelectedFiles
      .filter((file) => !isHiddenFile(file.name))
      .map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
      }));
    e.target.value = '';
    if (selectedFiles.length === 0) {
      return;
    }
    await uploadEntries(selectedFiles);
  }, [uploadEntries]);

  const handleUpload = async () => {
    if (!isCompressedTransferEnabled()) {
      uploadInputRef.current?.click();
      return;
    }
    try {
      const paths = await AppGo.SelectUploadFiles();
      await uploadNativePaths(paths || []);
    } catch (err) {
      if (err) addToast?.(`${t('上传失败')}: ${err}`, 'error');
    }
  };

  const handleUploadFolder = useCallback(async () => {
    if (!isCompressedTransferEnabled()) {
      uploadFolderInputRef.current?.click();
      return;
    }
    try {
      const dirPath = await AppGo.SelectUploadDirectory();
      if (!dirPath) {
        return;
      }

      await uploadNativePaths([dirPath]);
    } catch (err) {
      if (err) addToast?.(`${t('上传失败')}: ${err}`, 'error');
    }
  }, [uploadNativePaths, addToast, t]);

  const transferFileManagerItems = useCallback(async ({
    paths,
    mode,
    sourceDir,
    targetDirPath,
    clearClipboardOnSuccess = false,
  }: { paths: unknown; mode: string; sourceDir: unknown; targetDirPath: unknown; clearClipboardOnSuccess?: boolean }) => {
    if (operationInProgressRef.current) return false;
    const normalizedPaths = Array.isArray(paths)
      ? paths.map((path) => String(path || '').trim()).filter(Boolean)
      : [];
    if (normalizedPaths.length === 0) return false;
    const normalizedSourcePath = normalizePath(sourceDir) || '/';
    const normalizedTargetPath = normalizePath(targetDirPath) || '/';
    const visibleCurrentPath = normalizePath(currentPathRef.current || currentPath) || '/';
    const isCurrentTargetPath = normalizedTargetPath === visibleCurrentPath;
    const isCurrentSourcePath = normalizedSourcePath === visibleCurrentPath;
    if (normalizedSourcePath === normalizedTargetPath && mode === 'cut') {
      addToast?.(t('源目录与目标目录相同，无需移动'), 'warning');
      return false;
    }
    operationInProgressRef.current = true;
    let count = 0;
    let targetItems: FileManagerFileItem[] = isCurrentTargetPath ? items : [];
    try {
      if (!isCurrentTargetPath) {
        targetItems = (await AppGo.ListDir(sessionId, normalizedTargetPath) || []) as FileManagerFileItem[];
      }
    } catch (err) {
      operationInProgressRef.current = false;
      addToast?.(`${t('读取目录失败')}: ${err}`, 'error');
      return false;
    }
    const existing = new Set((Array.isArray(targetItems) ? targetItems : []).map((item) => item.name));
    const localPatchedItems: FileManagerFileItem[] = [];
    const successfulOperations = [];
    let shouldFallbackRefresh = !isCurrentTargetPath;
    const total = normalizedPaths.length;
    setOperationProgress({ message: t('正在粘贴中...'), current: 0, total });
    try {
      for (let i = 0; i < total; i++) {
        const srcPath = normalizedPaths[i];
        const name = srcPath.split('/').pop() || '';
        const sourceItem = normalizedSourcePath === normalizedTargetPath && isCurrentTargetPath
          ? items.find((entry) => entry.name === name)
          : null;
        let destPath = joinPath(normalizedTargetPath, name);
        let destName = name;
        let overwroteExisting = false;
        if (mode === 'copy' && normalizedSourcePath === normalizedTargetPath) {
          const base = name.replace(/(\.[^.]+)$/, '');
          const ext = name !== base ? name.slice(base.length) : '';
          let copyName = `${base}_copy${ext}`;
          let idx = 1;
          while (existing.has(copyName)) {
            idx++;
            copyName = `${base}_copy${idx}${ext}`;
          }
          destName = copyName;
          destPath = joinPath(normalizedTargetPath, copyName);
        } else if (existing.has(name)) {
          if (typeof window.luminDialog?.confirm !== 'function') {
            addToast?.(`${t('无法确认覆盖操作，已跳过')} ${name}`, 'error');
            continue;
          }
          const ok = await window.luminDialog.confirm(
            `${t('目标已存在同名项目')} "${name}"${t('，是否覆盖？')}`
          );
          if (!ok) continue;
          overwroteExisting = true;
        }
        setOperationProgress({
          message: `${mode === 'copy' ? t('正在复制') : t('正在移动')} ${name}`,
          current: i + 1,
          total,
        });
        try {
          if (mode === 'copy') {
            await AppGo.CopyItem(sessionId, srcPath, destPath);
          } else {
            await AppGo.MoveItem(sessionId, srcPath, destPath);
          }
          existing.add(destName);
          count++;
          successfulOperations.push({
            mode,
            srcPath,
            destPath,
            sourceDirPath: normalizedSourcePath,
            targetDirPath: normalizedTargetPath,
            overwroteExisting,
          });
          if (mode === 'copy' && sourceItem && isCurrentTargetPath) {
            localPatchedItems.push(createLocalItemShell(destName, sourceItem.isDirectory, {
              ...sourceItem,
              name: destName,
            }));
          } else {
            shouldFallbackRefresh = true;
          }
        } catch (err) {
          addToast?.(`${t('操作失败')}: ${name} - ${err}`, 'error');
        }
      }
    } finally {
      setOperationProgress(null);
      operationInProgressRef.current = false;
    }
    if (count > 0) {
      if (successfulOperations.length > 0 && successfulOperations.every((operation) => operation.overwroteExisting !== true)) {
        const undoOperations = [...successfulOperations];
        pushFileManagerUndoEntry({
          undo: async () => {
            for (let index = undoOperations.length - 1; index >= 0; index--) {
              const operation = undoOperations[index];
              if (operation.mode === 'copy') {
                await AppGo.DeleteItemShell(sessionId, operation.destPath);
              } else {
                await AppGo.MoveItem(sessionId, operation.destPath, operation.srcPath);
              }
            }
            const refreshTargets = new Set();
            undoOperations.forEach((operation) => {
              refreshTargets.add(operation.targetDirPath);
              if (operation.mode === 'cut') {
                refreshTargets.add(operation.sourceDirPath);
              }
            });
            for (const refreshPath of refreshTargets) {
              await refreshDirectoryAfterTransfer(refreshPath);
            }
          },
        });
      }
      addToast?.(`${t('操作完成')}: ${count} ${t('项')}`, 'success');
      if (clearClipboardOnSuccess && mode === 'cut') {
        updateClipboard(null);
      }
      if (!shouldFallbackRefresh && localPatchedItems.length === count) {
        localPatchedItems.forEach((localItem) => {
          const logicalPath = joinPath(normalizedTargetPath, localItem.name);
          queueRowEffectForMatchingPanes(normalizedTargetPath, logicalPath, logicalPath, 'added');
        });
        updateItemsPreservingView((prev) => localPatchedItems.reduce(
          (next, localItem) => upsertLocalItem(next, localItem),
          prev,
        ));
      } else {
        await refreshDirectoryAfterTransfer(normalizedTargetPath);
      }
      if (mode === 'cut' && normalizedSourcePath !== normalizedTargetPath) {
        if (isCurrentSourcePath) {
          setSelectedPaths((currentSelectedPaths) => currentSelectedPaths.filter((path) => !normalizedPaths.includes(path)));
          if (lastClickedPathRef.current && normalizedPaths.includes(lastClickedPathRef.current)) {
            lastClickedPathRef.current = null;
          }
        }
        await refreshDirectoryAfterTransfer(normalizedSourcePath);
      }
      return true;
    }
    return false;
  }, [addToast, currentPath, items, normalizePath, queueRowEffectForMatchingPanes, refreshDirectoryAfterTransfer, sessionId, t, updateItemsPreservingView]);

  // Download file via Wails native file dialog
  const handleDownload = useCallback(async (item: FileManagerFileItem, options: Record<string, unknown> = {}) => {
    const basePath = typeof options.basePath === 'string' ? options.basePath : currentPath;
    const remotePath = joinPath(basePath, item.name);
    const defaultDownloadDir = getDefaultDownloadDir();
    const askDownloadEveryTime = localStorage.getItem('fileManagerAskDownloadEveryTime') === 'true';
    const resolveDownloadPath = window?.go?.wailsapp?.App?.ResolveDownloadPath;
    const resolveDownloadLocalPath = window?.go?.wailsapp?.App?.ResolveDownloadLocalPath;
    const selectDownloadFilePath = window?.go?.wailsapp?.App?.SelectDownloadFilePath;
    const selectDownloadDirectory = window?.go?.wailsapp?.App?.SelectDownloadDirectory;
    const downloadFileToLocal = window?.go?.wailsapp?.App?.DownloadFileToLocal;
    const downloadDirectoryToLocal = window?.go?.wailsapp?.App?.DownloadDirectoryToLocal;
    const downloadDirectoryCompressed = window?.go?.wailsapp?.App?.DownloadDirectoryCompressed;
    const createdAt = Date.now();
    let queueId = '';

    const patchQueueItem = (id: unknown, patch: Record<string, unknown> | ((queueItem: TransferQueueItem) => TransferQueueItem)) => {
      if (!id) return;
      updateSessionUploadQueue(sessionGroupId, (current) => current.map((queueItem) => (
        queueItem.id === id
          ? { ...queueItem, ...(typeof patch === 'function' ? patch(queueItem) : patch) }
          : queueItem
      )));
    };

    try {
      const conflictSettings = getDownloadConflictSettings();
      const initialPathOptionsJSON = buildDownloadConflictOptionsPayload(conflictSettings, {
        strategy: conflictSettings.strategy === DOWNLOAD_CONFLICT_STRATEGY_PROMPT
          ? DOWNLOAD_CONFLICT_STRATEGY_FORCE_OVERWRITE
          : conflictSettings.strategy,
        pathStrategies: {},
      });
      let localPath = '';

      if (askDownloadEveryTime) {
        if (item.isDirectory) {
          const selectedDir = await selectDownloadDirectory?.(defaultDownloadDir);
          if (!selectedDir) return;
          const separator = selectedDir.includes('\\') ? '\\' : '/';
          const rawLocalPath = `${selectedDir}${selectedDir.endsWith('\\') || selectedDir.endsWith('/') ? '' : separator}${item.name}`;
          localPath = typeof resolveDownloadLocalPath === 'function'
            ? await resolveDownloadLocalPath(rawLocalPath, true, initialPathOptionsJSON)
            : rawLocalPath;
        } else {
          const selectedFilePath = await selectDownloadFilePath?.(remotePath, defaultDownloadDir);
          if (!selectedFilePath) return;
          localPath = typeof resolveDownloadLocalPath === 'function'
            ? await resolveDownloadLocalPath(selectedFilePath, false, initialPathOptionsJSON)
            : selectedFilePath;
        }
      } else {
        if (typeof resolveDownloadPath !== 'function') {
          throw new Error(item.isDirectory ? t('当前环境不支持下载文件夹') : t('下载失败'));
        }
        localPath = await resolveDownloadPath(remotePath, defaultDownloadDir, item.isDirectory, initialPathOptionsJSON);
      }

      if (!localPath) return;

      let optionsJSON = buildDownloadConflictOptionsPayload(conflictSettings, { pathStrategies: {} });
      if (conflictSettings.strategy === DOWNLOAD_CONFLICT_STRATEGY_PROMPT) {
        const resolvedConflict = await resolvePromptDownloadConflict(item, remotePath, localPath, {
          ...conflictSettings,
          pathStrategies: {},
        });
        if (!resolvedConflict) return;
        localPath = resolvedConflict.localPath;
        optionsJSON = resolvedConflict.optionsJSON;
      }

      const compressedEnabled = item.isDirectory && isCompressedTransferEnabled();
      queueId = !item.isDirectory
        ? `download-file-${createdAt}`
        : `${compressedEnabled ? 'download-dir-compressed' : 'download-dir'}-${createdAt}`;
      openTransferQueueIfNeeded();
      updateSessionUploadQueue(sessionGroupId, (current) => [{
        id: queueId,
        name: item.name,
        relativePath: item.name,
        remotePath,
        localPath,
        direction: 'download',
        mode: !item.isDirectory ? 'download-file' : (compressedEnabled ? 'download-compressed' : 'download-directory'),
        status: 'queued',
        progress: 0,
        bytesUploaded: 0,
        bytesTotal: item.isDirectory ? 0 : (item.size || 0),
        phase: compressedEnabled ? 'preparing' : '',
        phaseProgress: 0,
        phaseCurrent: '',
        phaseDetail: compressedEnabled ? t('准备下载') : '',
        error: '',
        sourceTerminalId: sessionId,
        createdAt,
        updatedAt: createdAt,
      }, ...current]);
      const transferTaskRunner = getTransferTaskRunner(getUploadSettings().maxTransferTasks);
      await transferTaskRunner(async () => {
        if (abortedUploadIdsRef.current.has(queueId)) {
          return;
        }
        try {
          patchQueueItem(queueId, { status: 'uploading', updatedAt: Date.now() });
          if (!item.isDirectory) {
            if (typeof downloadFileToLocal !== 'function') {
              throw new Error(t('下载失败'));
            }
            await downloadFileToLocal(sessionId, queueId, remotePath, localPath, optionsJSON);
            patchQueueItem(queueId, {
              status: 'completed',
              progress: 100,
              bytesUploaded: item.size || 0,
              bytesTotal: item.size || 0,
              error: '',
              updatedAt: Date.now(),
            });
            addToast?.(`${t('下载成功')}: ${item.name}`, 'success');
            return;
          }

          if (compressedEnabled) {
            if (typeof downloadDirectoryCompressed !== 'function') {
              throw new Error(t('当前环境不支持下载文件夹'));
            }
            await downloadDirectoryCompressed(sessionId, queueId, remotePath, localPath, optionsJSON);
          } else {
            if (typeof downloadDirectoryToLocal !== 'function') {
              throw new Error(t('当前环境不支持下载文件夹'));
            }
            await downloadDirectoryToLocal(sessionId, queueId, remotePath, localPath, optionsJSON);
          }
          patchQueueItem(queueId, {
            status: 'completed',
            phase: 'completed',
            progress: 100,
            error: '',
            updatedAt: Date.now(),
          });
          addToast?.(`${t('下载成功')}: ${item.name}`, 'success');
        } catch (err) {
          const isAborted = abortedUploadIdsRef.current.has(queueId) || String(err).toLowerCase().includes('context canceled');
          patchQueueItem(queueId, {
            status: 'failed',
            phase: 'failed',
            phaseDetail: isAborted ? t('已终止') : String(err),
            error: isAborted ? t('已终止') : String(err),
            updatedAt: Date.now(),
          });
          if (!isAborted && err) addToast?.(`${t('下载失败')}: ${err}`, 'error');
        }
      });
    } catch (err) {
      const isAborted = abortedUploadIdsRef.current.has(queueId) || String(err).toLowerCase().includes('context canceled');
      patchQueueItem(queueId, {
        status: 'failed',
        phase: 'failed',
        phaseDetail: isAborted ? t('已终止') : String(err),
        error: isAborted ? t('已终止') : String(err),
        updatedAt: Date.now(),
      });
      if (!isAborted && err) addToast?.(`${t('下载失败')}: ${err}`, 'error');
    }
  }, [sessionId, sessionGroupId, currentPath, addToast, t, getDefaultDownloadDir, getDownloadConflictSettings, getTransferTaskRunner, getUploadSettings, resolvePromptDownloadConflict, openTransferQueueIfNeeded]);

  return {
    workbenchState,
    uploadPanelState,
    uploadQueueItems,
    activeUploadCount,
    uploadPanelClosing,
    uploadInputRef,
    uploadFolderInputRef,
    setUploadPanelOpen,
    toggleUploadPanel,
    isUploadAbortable,
    abortUploadItem,
    abortUploadItems,
    removeUploadItems,
    uploadNativePaths,
    uploadEntries,
    handleSelectedFiles,
    handleUpload,
    handleUploadFolder,
    transferFileManagerItems,
    handleDownload,
  };
}
