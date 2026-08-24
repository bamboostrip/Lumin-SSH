import React from 'react';
import { ClipboardList, ClipboardPaste, ChevronDown, ChevronUp, FilePlus, FolderPlus, FolderUp, RefreshCw, Upload, X } from 'lucide-react';
import Tiptop from '../Tiptop.tsx';
import { t as tKey } from '../../i18n.ts';
import type { FileManagerVirtualRow } from '../../utils/fileManagerHelpers.tsx';
import type { UploadPanelState } from '../../utils/fileWorkbench.ts';
import type { LoadDirOptions, LooseT } from './fileManagerTypes.ts';

// 文件管理器顶部工具栏：路径输入、剪贴板、文件定位器、常用操作按钮。
// props 与 FileManager 主组件中的同名闭包变量一一对应，渲染逻辑从主组件原样搬移。
interface FileManagerToolbarProps {
  editingPath: string | null
  setEditingPath: React.Dispatch<React.SetStateAction<string | null>>
  currentPath: string
  sessionId: string
  normalizePath: (value: unknown) => string
  loadDir: (path: unknown, options?: LoadDirOptions | boolean) => Promise<boolean>
  clipboard: { paths: string[]; mode: 'copy' | 'cut'; srcDir: string } | null
  operationInProgressRef: React.RefObject<boolean>
  addToast?: (message: string | Error, type?: string, duration?: number, actions?: unknown[]) => number
  handlePaste: (targetDirPath?: string) => Promise<boolean>
  updateClipboard: (newClipboard: unknown) => void
  fileLocatorInputRef: React.RefObject<HTMLInputElement | null>
  fileLocatorQuery: string
  setFileLocatorQuery: React.Dispatch<React.SetStateAction<string>>
  fileLocatorActiveIndex: number
  setFileLocatorActiveIndex: React.Dispatch<React.SetStateAction<number>>
  setFileLocatorActiveRowKey: React.Dispatch<React.SetStateAction<string>>
  fileListRef: React.RefObject<HTMLDivElement | null>
  clearFileListTypeahead: () => void
  navigateFileLocatorMatch: (step: number) => void
  fileLocatorMatches: FileManagerVirtualRow[]
  handleNewFile: (targetDirPath?: string) => Promise<void>
  handleMkdir: (targetDirPath?: string) => Promise<void>
  handleUpload: () => Promise<void>
  handleUploadFolder: () => Promise<void>
  uploadPanelState: UploadPanelState
  toggleUploadPanel: () => void
  activeUploadCount: number
  t: LooseT
}

export function FileManagerToolbar({
  editingPath,
  setEditingPath,
  currentPath,
  sessionId,
  normalizePath,
  loadDir,
  clipboard,
  operationInProgressRef,
  addToast,
  handlePaste,
  updateClipboard,
  fileLocatorInputRef,
  fileLocatorQuery,
  setFileLocatorQuery,
  fileLocatorActiveIndex,
  setFileLocatorActiveIndex,
  setFileLocatorActiveRowKey,
  fileListRef,
  clearFileListTypeahead,
  navigateFileLocatorMatch,
  fileLocatorMatches,
  handleNewFile,
  handleMkdir,
  handleUpload,
  handleUploadFolder,
  uploadPanelState,
  toggleUploadPanel,
  activeUploadCount,
  t,
}: FileManagerToolbarProps) {
  return (
    <div className="file-toolbar">
      {/* Editable path input */}
      <input
        className="path-input"
        type="text"
        name="directoryPath"
        aria-label={t('当前目录路径')}
        value={editingPath !== null ? editingPath : currentPath}
        onChange={(e) => setEditingPath(e.target.value)}
        onFocus={() => setEditingPath(currentPath)}
        onBlur={async () => {
          if (editingPath !== null) {
            const p = editingPath.trim();
            const normalizedTargetPath = normalizePath(p);
            if (normalizedTargetPath && normalizedTargetPath !== currentPath) {
              const resolveDirectoryPath = window?.go?.wailsapp?.App?.ResolveDirectoryPath;
              let resolvedDirectoryPath = normalizedTargetPath;
              if (typeof resolveDirectoryPath === 'function') {
                try {
                  resolvedDirectoryPath = normalizePath(await resolveDirectoryPath(sessionId, normalizedTargetPath)) || normalizedTargetPath;
                } catch (_) {}
              }
              if (resolvedDirectoryPath) {
                void loadDir(resolvedDirectoryPath, {
                  preserveView: false,
                  trackDiff: false,
                  showLoading: true,
                });
              }
            }
            setEditingPath(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setEditingPath(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={{ flex: 1, minWidth: 0 }}
      />

      {clipboard && (
        <>
          <Tiptop text={t('粘贴')} placement="bottom">
            <button
              className={`btn file-toolbar-outline-btn has-count ${clipboard.mode === 'cut' ? 'clipboard-cut' : 'clipboard-copy'}`}
              aria-label={t('粘贴')}
              onClick={() => {
                if (operationInProgressRef.current) {
                  addToast?.(t('有操作正在进行，请稍候'), 'warning');
                } else {
                  void handlePaste();
                }
              }}
            >
              <ClipboardPaste size={14} />
              <span className={`clipboard-count-badge ${clipboard.mode === 'cut' ? 'clipboard-cut' : 'clipboard-copy'}`}>{clipboard.paths.length}</span>
            </button>
          </Tiptop>
          <Tiptop text={t('取消')} placement="bottom">
            <button
              className="btn file-toolbar-outline-btn"
              aria-label={t('取消')}
              onClick={() => updateClipboard(null)}
            >
              <X size={14} />
            </button>
          </Tiptop>
        </>
      )}

      <div className="file-toolbar-locator">
        <div className="file-locator-input-wrap">
          <input
            ref={fileLocatorInputRef}
            className="file-locator-input"
            type="text"
            name="fileLocator"
            value={fileLocatorQuery}
            onFocus={() => {
              clearFileListTypeahead();
            }}
            onChange={(e) => {
              clearFileListTypeahead();
              setFileLocatorQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateFileLocatorMatch(1);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateFileLocatorMatch(-1);
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                navigateFileLocatorMatch(e.shiftKey ? -1 : 1);
                return;
              }
              if (e.key === 'Escape') {
                setFileLocatorQuery('');
                setFileLocatorActiveIndex(0);
                setFileLocatorActiveRowKey('');
                fileListRef.current?.focus();
              }
            }}
            placeholder={t('定位文件')}
            aria-label={t('定位文件')}
            spellCheck={false}
          />
          {fileLocatorQuery.trim() ? (
            <button
              type="button"
              className="file-locator-clear-btn"
              aria-label={t('清空输入')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setFileLocatorQuery('');
                setFileLocatorActiveIndex(0);
                setFileLocatorActiveRowKey('');
                fileLocatorInputRef.current?.focus();
              }}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
        {fileLocatorQuery.trim() ? (
          <span className="file-locator-status">
            {fileLocatorMatches.length > 0 ? `${fileLocatorActiveIndex + 1}/${fileLocatorMatches.length}` : '0'}
          </span>
        ) : null}
        {fileLocatorQuery.trim() ? (
          <>
            <Tiptop text={t('上一个命中')} placement="bottom">
              <button
                className="btn file-toolbar-outline-btn"
                aria-label={t('上一个命中')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigateFileLocatorMatch(-1)}
                disabled={fileLocatorMatches.length === 0}
              >
                <ChevronUp size={14} />
              </button>
            </Tiptop>
            <Tiptop text={t('下一个命中')} placement="bottom">
              <button
                className="btn file-toolbar-outline-btn"
                aria-label={t('下一个命中')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigateFileLocatorMatch(1)}
                disabled={fileLocatorMatches.length === 0}
              >
                <ChevronDown size={14} />
              </button>
            </Tiptop>
          </>
        ) : null}
      </div>

      <div className="file-toolbar-actions">
        <Tiptop text={t('新建文件')} placement="bottom">
          <button
            className="btn file-toolbar-outline-btn"
            aria-label={t('新建文件')}
            onClick={() => { void handleNewFile(); }}
          >
            <FilePlus size={14} />
          </button>
        </Tiptop>
        <Tiptop text={t('新建文件夹')} placement="bottom">
          <button
            className="btn file-toolbar-outline-btn"
            aria-label={t('新建文件夹')}
            onClick={() => { void handleMkdir(); }}
          >
            <FolderPlus size={14} />
          </button>
        </Tiptop>
        <Tiptop text={t('上传文件或右键上传文件夹')} placement="bottom">
          <button
            className="btn file-toolbar-outline-btn"
            aria-label={t('上传文件或右键上传文件夹')}
            onClick={handleUpload}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleUploadFolder();
            }}
          >
            <Upload size={14} />
          </button>
        </Tiptop>
        <Tiptop text={t('传输队列')} placement="bottom">
          <button
            className={`btn btn-ghost btn-sm btn-icon${uploadPanelState.uploadOpen ? ' active' : ''}`}
            aria-label={t('传输队列')}
            onClick={toggleUploadPanel}
            style={{ position: 'relative' }}
          >
            <ClipboardList size={14} />
            {activeUploadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 15,
                  height: 15,
                  padding: '0 4px',
                  borderRadius: 999,
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: '15px',
                  textAlign: 'center',
                }}
              >
                {activeUploadCount > 99 ? '99+' : activeUploadCount}
              </span>
            )}
          </button>
        </Tiptop>
        {currentPath !== '/' && (
          <Tiptop text={tKey('返回上级')} placement="bottom">
            <button
              className="btn btn-ghost btn-sm btn-icon"
              aria-label={tKey('返回上级')}
              onClick={() => {
                const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
                void loadDir(parent, {
                  preserveView: false,
                  trackDiff: false,
                  showLoading: true,
                });
              }}
            >
              <FolderUp size={14} />
            </button>
          </Tiptop>
        )}
        <Tiptop text={t('刷新')} placement="bottom">
          <button
            className="btn btn-ghost btn-sm btn-icon"
            aria-label={t('刷新')}
            onClick={() => { void loadDir(currentPath); }}
          >
            <RefreshCw size={14} />
          </button>
        </Tiptop>
      </div>
    </div>
  );
}
