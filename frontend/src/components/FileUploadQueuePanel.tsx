import React, { useEffect, useMemo, useRef } from 'react';
import { Upload, Download, FolderOpen, X, CheckCircle2, AlertCircle, Clock3, ClipboardList, type LucideIcon } from 'lucide-react';
import { useTranslation, type I18nKey } from '../i18n.ts';
import Tiptop from './Tiptop.tsx';
import { Button } from './ui';
import { cn } from '../utils/cn.ts';
import { type TransferChunk, type TransferQueueItem } from '../utils/fileWorkbench.ts';

const MAX_RENDER_UPLOAD_CARDS = 1000;

const ACTION_BTN_BASE = 'rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer whitespace-nowrap';
const ACTION_BTN_NORMAL = `${ACTION_BTN_BASE} border border-line bg-canvas text-secondary`;
const ACTION_BTN_DANGER = `${ACTION_BTN_BASE} border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger-dim)_72%,var(--surface-base))] text-danger`;

const PROGRESS_FILL_COLOR: Record<string, string> = {
  failed: 'bg-danger',
  completed: 'bg-success',
};

/** helper 的 t 参数使用严格 I18nKey 签名（与 useTranslation 返回值一致） */
type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string;

function fmtSize(bytes: number | undefined) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function getStatusMeta(status: string, direction: string, t: LooseT) {
  if (status === 'uploading') {
    return { label: direction === 'download' ? t('下载中') : t('上传中'), color: 'var(--accent)', bg: 'var(--accent-dim)', Icon: direction === 'download' ? Download : Upload };
  }
  if (status === 'completed') {
    return { label: t('已完成'), color: 'var(--success)', bg: 'var(--success-dim)', Icon: CheckCircle2 };
  }
  if (status === 'failed') {
    return { label: t('失败'), color: 'var(--danger)', bg: 'var(--danger-dim)', Icon: AlertCircle };
  }
  return { label: t('排队中'), color: 'var(--text-tertiary)', bg: 'var(--surface-sunken)', Icon: Clock3 };
}

function getChunkColor(status: string) {
  if (status === 'completed') return 'var(--success)';
  if (status === 'failed') return 'var(--danger)';
  if (status === 'retrying') return 'var(--warning)';
  if (status === 'uploading') return 'var(--accent)';
  if (status === 'reading') return 'color-mix(in srgb, var(--accent) 58%, var(--warning))';
  return 'var(--border)';
}

function getChunkLabel(chunk: TransferChunk, t: LooseT) {
  if (chunk.status === 'completed') return t('已完成');
  if (chunk.status === 'failed') return t('失败');
  if (chunk.status === 'retrying') return t('重试中');
  if (chunk.status === 'uploading') return t('上传中');
  if (chunk.status === 'reading') return t('读取中');
  return t('排队中');
}

function getUploadPhaseLabel(phase: string | undefined, direction: string, t: LooseT) {
  if (phase === 'preparing') return t('准备中');
  if (phase === 'scanning') return t('扫描中');
  if (phase === 'compressing') return direction === 'download' ? t('远端压缩中') : t('压缩中');
  if (phase === 'uploading') return direction === 'download' ? t('下载压缩包') : t('上传压缩包');
  if (phase === 'uploading-file') return t('上传文件');
  if (phase === 'uploading-file-completed') return t('已完成');
  if (phase === 'downloading') return t('下载中');
  if (phase === 'verifying') return t('修复中');
  if (phase === 'extracting') return direction === 'download' ? t('本地解压中') : t('远端解压中');
  if (phase === 'cleanup-local' || phase === 'cleanup-remote') return t('清理中');
  if (phase === 'completed') return t('已完成');
  if (phase === 'failed') return t('失败');
  return t('排队中');
}

function formatCompressedPhaseBytes(item: TransferQueueItem, t: LooseT) {
  const bytesDone = Number(item.bytesUploaded) || 0;
  const bytesTotal = Number(item.bytesTotal) || 0;
  if (bytesTotal <= 0) {
    return t('当前阶段无字节指标');
  }
  return `${fmtSize(bytesDone)} / ${fmtSize(bytesTotal)}`;
}

function getCompressedPhaseDetail(item: TransferQueueItem, t: LooseT) {
  const direction = item.direction || 'upload';
  if (item.phase === 'scanning') return item.phaseDetail || t('正在扫描待压缩项目');
  if (item.phase === 'compressing') return item.phaseDetail || (direction === 'download' ? t('正在远端打包压缩包') : t('正在构建本机 tar.gz 压缩包'));
  if (item.phase === 'uploading') return item.phaseDetail || (direction === 'download' ? t('正在下载压缩包到本地') : t('正在上传压缩包到远端'));
  if (item.phase === 'uploading-file') return item.phaseDetail || '';
  if (item.phase === 'uploading-file-completed') return item.phaseDetail || t('已完成');
  if (item.phase === 'downloading') return item.phaseDetail || t('下载中');
  if (item.phase === 'verifying') return item.phaseDetail || t('正在自动修复远端目录和已有文件权限');
  if (item.phase === 'cleanup-local') return t('正在删除本机临时压缩包');
  if (item.phase === 'extracting') return direction === 'download' ? t('正在解压到本地目录') : t('正在远端解压压缩包');
  if (item.phase === 'cleanup-remote') return t('正在清理远端压缩包');
  if (item.phase === 'completed') return direction === 'download' ? t('下载传输已完成') : t('压缩传输已完成');
  if (item.phase === 'failed') return item.error || (direction === 'download' ? t('下载传输失败') : t('压缩传输失败'));
  return item.phaseDetail || '';
}

interface CompressedPhaseChunks {
  chunks: TransferChunk[];
  chunkSizeBytes: number;
  chunksDone: number;
  chunksFailed: number;
  chunksActive: number;
}

function buildCompressedPhaseChunks(item: TransferQueueItem): CompressedPhaseChunks {
  const bytesTotal = Math.max(0, Number(item.bytesTotal) || 0);
  if (bytesTotal <= 0) {
    return { chunks: [], chunkSizeBytes: 0, chunksDone: 0, chunksFailed: 0, chunksActive: 0 };
  }

  const chunkSizeBytes = Math.max(1, Number(item.chunkSizeBytes) || 256 * 1024);
  const bytesUploaded = Math.max(0, Number(item.bytesUploaded) || 0);
  const totalChunks = Math.max(1, Math.ceil(bytesTotal / chunkSizeBytes));
  const completedChunks = bytesUploaded >= bytesTotal
    ? totalChunks
    : Math.min(totalChunks, Math.floor(bytesUploaded / chunkSizeBytes));
  const hasPartialChunk = bytesUploaded > completedChunks * chunkSizeBytes && completedChunks < totalChunks;
  const failedChunkIndex = item.status === 'failed'
    ? Math.min(totalChunks - 1, completedChunks)
    : -1;
  const activeChunkIndex = item.status === 'uploading' && hasPartialChunk ? completedChunks : -1;

  const chunks: TransferChunk[] = Array.from({ length: totalChunks }, (_, index) => {
    if (index < completedChunks) {
      return { index, status: 'completed', attempt: 0, error: '' };
    }
    if (index === failedChunkIndex && item.status === 'failed') {
      return { index, status: 'failed', attempt: 0, error: item.error || '' };
    }
    if (index === activeChunkIndex) {
      return { index, status: 'uploading', attempt: 0, error: '' };
    }
    return { index, status: 'queued', attempt: 0, error: '' };
  });

  return {
    chunks,
    chunkSizeBytes,
    chunksDone: chunks.filter((chunk) => chunk.status === 'completed').length,
    chunksFailed: chunks.filter((chunk) => chunk.status === 'failed').length,
    chunksActive: chunks.filter((chunk) => chunk.status === 'uploading').length,
  };
}

function getTransferErrorSummary(message: string, t: LooseT) {
  const normalized = String(message || '').trim();
  if (!normalized) {
    return t('查看详情');
  }
  const firstLine = normalized.split(/\r?\n/)[0] || '';
  return firstLine.trim() || t('查看详情');
}

interface AutoFollowChunkGridProps {
  chunks: TransferChunk[];
  titleBuilder: (chunk: TransferChunk) => string;
}

function AutoFollowChunkGrid({ chunks, titleBuilder }: AutoFollowChunkGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoFollowRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !shouldAutoFollowRef.current) {
      return undefined;
    }
    const rafId = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [chunks]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoFollowRef.current = distanceToBottom <= 12;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="grid grid-cols-[repeat(auto-fill,minmax(8px,1fr))] gap-[3px] max-h-[88px] overflow-y-auto"
    >
      {chunks.map((chunk) => (
        <Tiptop key={chunk.index} text={titleBuilder(chunk)} style={{ display: 'block' }}>
          <div
            className="h-2 min-w-2 rounded-full"
            style={{
              background: getChunkColor(chunk.status),
              opacity: chunk.status === 'queued' ? 0.42 : 1,
              boxShadow: chunk.status === 'uploading' || chunk.status === 'retrying' ? `0 0 8px ${getChunkColor(chunk.status)}` : 'none',
              transition: 'background 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
            }}
          />
        </Tiptop>
      ))}
    </div>
  );
}

function isPriorityVisibleItem(item: TransferQueueItem, isAbortable?: (item: TransferQueueItem) => boolean) {
  return Boolean(isAbortable?.(item));
}

interface VisibleQueue {
  visibleItems: TransferQueueItem[];
  hiddenItems: TransferQueueItem[];
}

function buildVisibleQueue(items: TransferQueueItem[], isAbortable?: (item: TransferQueueItem) => boolean): VisibleQueue {
  if (items.length <= MAX_RENDER_UPLOAD_CARDS) {
    return { visibleItems: items, hiddenItems: [] };
  }

  const visibleLimit = MAX_RENDER_UPLOAD_CARDS - 1;
  const activeItems = items.filter((item) => isPriorityVisibleItem(item, isAbortable));
  const visibleIds = new Set<string>();
  let visibleItems: TransferQueueItem[] = [];

  if (activeItems.length >= visibleLimit) {
    visibleItems = activeItems.slice(-visibleLimit);
    visibleItems.forEach((item) => visibleIds.add(item.id));
  } else {
    visibleItems = [...activeItems];
    activeItems.forEach((item) => visibleIds.add(item.id));
    for (let index = items.length - 1; index >= 0 && visibleItems.length < visibleLimit; index -= 1) {
      const item = items[index];
      if (visibleIds.has(item.id)) continue;
      visibleItems.push(item);
      visibleIds.add(item.id);
    }
    visibleItems.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  return {
    visibleItems,
    hiddenItems: items.filter((item) => !visibleIds.has(item.id)),
  };
}

function renderActionButton(label: string, danger: boolean, onClick: () => void) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={danger ? ACTION_BTN_DANGER : ACTION_BTN_NORMAL}
    >
      {label}
    </button>
  );
}

export interface FileUploadQueuePanelProps {
  items: TransferQueueItem[];
  closing?: boolean;
  onClose: () => void;
  isAbortable?: (item: TransferQueueItem) => boolean;
  onAbortItem?: (item: TransferQueueItem) => void;
  onAbortItems?: (items: TransferQueueItem[]) => void;
  onRemoveItems?: (ids: string[]) => void;
}

export default function FileUploadQueuePanel({
  items,
  closing = false,
  onClose,
  isAbortable,
  onAbortItem,
  onAbortItems,
  onRemoveItems,
}: FileUploadQueuePanelProps) {
  const { t } = useTranslation();

  const handleOpenCompletedDownload = async (item: TransferQueueItem) => {
    const localPath = String(item?.localPath || '').trim();
    if (!localPath) {
      return;
    }
    try {
      await window?.go?.wailsapp?.App?.OpenLocalPathInExplorer?.(localPath, item.mode !== 'download-file');
    } catch (err) {
      window.luminDialog?.alert?.(`${t('打开所在目录失败')}: ${err}`);
    }
  };

  const openTransferErrorDetails = async (item: TransferQueueItem, explicitMessage = '') => {
    const message = String(explicitMessage || item?.error || '').trim();
    if (!message) {
      return;
    }
    const title = item?.direction === 'download' ? t('下载失败详情') : t('上传失败详情');
    if (window?.luminDialog?.alert) {
      await window.luminDialog.alert(message, title, { copyable: true });
      return;
    }
    window.alert(message);
  };

  const orderedItems = useMemo(
    () => [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [items],
  );
  const removableItems = useMemo(
    () => orderedItems.filter((item) => !isAbortable?.(item)),
    [orderedItems, isAbortable],
  );
  const removableIds = useMemo(
    () => removableItems.map((item) => item.id),
    [removableItems],
  );
  const { visibleItems, hiddenItems } = useMemo(
    () => buildVisibleQueue(orderedItems, isAbortable),
    [orderedItems, isAbortable],
  );
  const hiddenActiveItems = useMemo(
    () => hiddenItems.filter((item) => isAbortable?.(item)),
    [hiddenItems, isAbortable],
  );

  const hiddenRepresentative = hiddenActiveItems[hiddenActiveItems.length - 1] || hiddenItems[hiddenItems.length - 1] || null;
  const hiddenMeta = hiddenRepresentative ? getStatusMeta(hiddenActiveItems.length > 0 ? 'uploading' : hiddenRepresentative.status, hiddenRepresentative.direction || 'upload', t) : null;
  const hiddenPhaseLabel = hiddenRepresentative
    ? ((hiddenRepresentative.mode === 'compressed' || hiddenRepresentative.mode === 'download-compressed')
      ? getUploadPhaseLabel(hiddenRepresentative.phase, hiddenRepresentative.direction || 'upload', t)
      : hiddenMeta?.label || t('排队中'))
    : t('排队中');

  return (
    <div
      className="w-full h-full flex flex-col bg-raised"
      style={{
        opacity: closing ? 0 : 1,
        transform: closing ? 'translateX(100%)' : 'translateX(0)',
        transformOrigin: 'right center',
        transition: 'opacity 100ms ease, transform 100ms ease-in-out',
        willChange: 'opacity, transform',
        pointerEvents: closing ? 'none' : 'auto',
      }}
    >
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-line">
        <div className="flex items-center gap-2 text-md font-semibold text-primary">
          <ClipboardList size={14} className="shrink-0" />
          {t('传输队列')}
        </div>
        <div className="flex items-center gap-2">
          {removableIds.length > 0 ? renderActionButton(t('清空'), false, () => onRemoveItems?.(removableIds)) : null}
          <Tiptop text={t('关闭')} placement="bottom">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('关闭')}>
              <X size={14} />
            </Button>
          </Tiptop>
        </div>
      </div>
      <div className="px-3.5 py-2 text-xs text-tertiary border-b border-line-subtle">
        {t('当前会话中的所有路径传输任务都会显示在这里')}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
        {visibleItems.length === 0 && hiddenItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-muted">
            <div className="leading-none text-tertiary opacity-80"><ClipboardList size={40} strokeWidth={1.5} /></div>
            <div className="text-base">{t('当前会话暂无传输任务')}</div>
          </div>
        ) : (
          <>
            {visibleItems.map((item) => {
              const direction = item.direction || 'upload';
              const meta = getStatusMeta(item.status, direction, t);
              const progress = item.status === 'completed'
                ? 100
                : Math.max(0, Math.min(100, typeof item.progress === 'number' && Number.isFinite(item.progress) ? item.progress : 0));
              const Icon = meta.Icon;
              const chunks = Array.isArray(item.chunks) ? item.chunks : [];
              const chunksDone = item.chunksCompleted || chunks.filter((chunk) => chunk.status === 'completed').length;
              const chunksFailed = item.chunksFailed || chunks.filter((chunk) => chunk.status === 'failed').length;
              const chunksActive = chunks.filter((chunk) => chunk.status === 'reading' || chunk.status === 'uploading' || chunk.status === 'retrying').length;
              const isCompressed = item.mode === 'compressed' || item.mode === 'download-compressed';
              const phaseLabel = getUploadPhaseLabel(item.phase, direction, t);
              const phaseProgress = Math.max(0, Math.min(100, typeof item.phaseProgress === 'number' && Number.isFinite(item.phaseProgress) ? item.phaseProgress : 0));
              const phaseDetail = getCompressedPhaseDetail(item, t);
              const compressedPhaseChunks = isCompressed ? buildCompressedPhaseChunks(item) : null;
              const statusLabel = isCompressed ? phaseLabel : meta.label;
              const abortable = isAbortable?.(item);
              const displayPath = direction === 'download' ? (item.localPath || item.remotePath) : item.remotePath;
              const showOpenCompletedDownload = direction === 'download' && item.status === 'completed' && item.localPath;

              return (
                <div key={item.id} className="rounded-lg border border-line bg-canvas p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color }}>
                      <Icon size={14} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="text-primary text-base font-semibold truncate">{item.name}</div>
                      <div className="text-tertiary text-xs font-mono truncate">{displayPath}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {showOpenCompletedDownload ? (
                        <Tiptop text={t('打开所在目录')} placement="bottom">
                          <button
                            type="button"
                            aria-label={t('打开所在目录')}
                            onClick={() => handleOpenCompletedDownload(item)}
                            className="w-[30px] h-6 inline-flex items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--success)_44%,var(--border))] bg-success-dim text-success cursor-pointer"
                          >
                            <FolderOpen size={14} />
                          </button>
                        </Tiptop>
                      ) : (
                        <div className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: meta.bg, color: meta.color }}>
                          {statusLabel}
                        </div>
                      )}
                      {abortable
                        ? renderActionButton(t('强制终止'), true, () => onAbortItem?.(item))
                        : renderActionButton(t('从列表中移除'), false, () => onRemoveItems?.([item.id]))}
                    </div>
                  </div>

                  {isCompressed ? (
                    <>
                      <div className="rounded-lg border border-line-subtle bg-sunken p-2 flex flex-col gap-[7px]">
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 text-xs text-tertiary">
                          <span>{t('当前阶段')}: <span className={cn(item.status === 'failed' && 'text-danger', item.status === 'completed' && 'text-success', item.status !== 'failed' && item.status !== 'completed' && 'text-accent')}>{phaseLabel}</span></span>
                          <span className="text-center font-mono truncate">
                            {formatCompressedPhaseBytes(item, t)}
                          </span>
                          <span>{t('当前阶段进度')}: {phaseProgress.toFixed(0)}%</span>
                        </div>
                        <div className="h-1 bg-hover rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-[width] duration-300', PROGRESS_FILL_COLOR[item.status === 'failed' || item.status === 'completed' ? item.status : ''] ?? 'bg-accent')}
                            style={{ width: `${phaseProgress}%` }}
                          />
                        </div>
                        {item.phaseCurrent ? (
                          <div className="text-xs text-tertiary leading-[1.45] truncate">
                            {t('当前文件')}: {item.phaseCurrent}
                          </div>
                        ) : null}
                        {phaseDetail ? (
                          item.status === 'failed' ? (
                            <button
                              type="button"
                              onClick={() => { void openTransferErrorDetails(item, phaseDetail); }}
                              title={phaseDetail}
                              className="border-none bg-transparent p-0 text-left text-xs text-danger leading-[1.45] cursor-pointer underline decoration-dotted truncate"
                            >
                              {getTransferErrorSummary(phaseDetail, t)}
                            </button>
                          ) : (
                            <div className="text-xs text-tertiary leading-[1.45] truncate">
                              {phaseDetail}
                            </div>
                          )
                        ) : null}
                        {compressedPhaseChunks && compressedPhaseChunks.chunks.length > 0 ? (
                          <div className="rounded-lg border border-line-subtle bg-[color-mix(in_srgb,var(--surface-sunken)_72%,transparent)] p-2 flex flex-col gap-[7px]">
                            <div className="flex justify-between gap-2.5 text-xs text-tertiary">
                              <span>{t('分块进度')}: {compressedPhaseChunks.chunksDone}/{compressedPhaseChunks.chunks.length}</span>
                              <span>{compressedPhaseChunks.chunksFailed > 0 ? `${compressedPhaseChunks.chunksFailed} ${t('失败')}` : `${fmtSize(compressedPhaseChunks.chunkSizeBytes || 0)} / ${t('块')}`}</span>
                            </div>
                            <AutoFollowChunkGrid
                              chunks={compressedPhaseChunks.chunks}
                              titleBuilder={(chunk) => `${t('分块')} ${chunk.index + 1}: ${getChunkLabel(chunk, t)}${chunk.error ? ` · ${chunk.error}` : ''}`}
                            />
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-1 bg-hover rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-[width] duration-300', PROGRESS_FILL_COLOR[item.status === 'failed' || item.status === 'completed' ? item.status : ''] ?? 'bg-accent')}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-tertiary font-mono">
                        <span>{fmtSize(item.bytesUploaded || 0)} / {fmtSize(item.bytesTotal || 0)}</span>
                        <span className={chunksActive > 0 ? 'text-accent' : undefined}>{t('块并发')}: {chunksActive}</span>
                        <span className="text-right">{progress.toFixed(0)}%</span>
                      </div>
                      {chunks.length > 0 ? (
                        <div className="rounded-lg border border-line-subtle bg-sunken p-2 flex flex-col gap-[7px]">
                          <div className="flex justify-between gap-2.5 text-xs text-tertiary">
                            <span>{t('分块进度')}: {chunksDone}/{chunks.length}</span>
                            <span>{chunksFailed > 0 ? `${chunksFailed} ${t('失败')}` : `${fmtSize(item.chunkSizeBytes || 0)} / ${t('块')}`}</span>
                          </div>
                          <AutoFollowChunkGrid
                            chunks={chunks}
                            titleBuilder={(chunk) => `${t('分块')} ${chunk.index + 1}: ${getChunkLabel(chunk, t)}${chunk.attempt ? ` · ${t('重试')} ${chunk.attempt}/5` : ''}${chunk.error ? ` · ${chunk.error}` : ''}`}
                          />
                        </div>
                      ) : null}
                    </>
                  )}

                  {item.error && (!isCompressed || String(item.error).trim() !== String(phaseDetail || '').trim()) ? (
                    <button
                      type="button"
                      onClick={() => { void openTransferErrorDetails(item); }}
                      title={item.error}
                      className="border-none bg-transparent p-0 text-left text-xs text-danger leading-normal cursor-pointer underline decoration-dotted break-all"
                    >
                      {getTransferErrorSummary(item.error, t)}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {hiddenItems.length > 0 && hiddenMeta && (
              <div className="rounded-lg border border-dashed border-line bg-canvas p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0" style={{ background: hiddenMeta.bg, color: hiddenMeta.color }}>
                    <hiddenMeta.Icon size={14} />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="text-primary text-base font-semibold truncate">
                      + {hiddenItems.length} {t('项')}
                    </div>
                    <div className="text-tertiary text-xs leading-[1.45]">
                      {t('已折叠显示，避免传输队列卡片总数超过 {count}', { count: MAX_RENDER_UPLOAD_CARDS })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: hiddenMeta.bg, color: hiddenMeta.color }}>
                      {hiddenPhaseLabel}
                    </div>
                    {hiddenActiveItems.length > 0
                      ? renderActionButton(t('强制终止'), true, () => onAbortItems?.(hiddenActiveItems))
                      : renderActionButton(t('从列表中移除'), false, () => onRemoveItems?.(hiddenItems.map((item) => item.id)))}
                  </div>
                </div>
                <div className="text-xs text-tertiary leading-[1.45]">
                  {hiddenActiveItems.length > 0
                    ? t('当前有 {count} 项活跃任务被折叠隐藏，仅保留最基本的阶段与终止操作。', { count: hiddenActiveItems.length })
                    : t('这些折叠项均已结束，仅保留从列表中移除操作。')}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}