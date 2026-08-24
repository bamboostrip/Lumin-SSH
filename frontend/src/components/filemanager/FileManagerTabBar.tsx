import React from 'react';
import { ChevronLeft, ChevronRight, Folder, Pin, Plus, X } from 'lucide-react';
import Tiptop from '../Tiptop.tsx';
import { FILE_MANAGER_SYSTEM_TAB_KIND_CWD, buildDirectoryItemFromPath, getParentPath, renderFileManagerTabTitle } from '../../utils/fileManagerHelpers.tsx';
import type { FileManagerTab, FileManagerTabLike, FileManagerWorkspaceState } from '../../utils/fileWorkbench.ts';
import type { ContextMenuState, FileManagerTabDropIndicator, LooseT } from './fileManagerTypes.ts';

// 文件管理器标签栏（单面板布局）。
// props 与 FileManager 主组件中的同名闭包变量一一对应，渲染逻辑从主组件原样搬移。
interface FileManagerTabBarProps {
  fileManagerWorkspace: FileManagerWorkspaceState
  activeFileManagerTab: FileManagerTab | null
  cwdSystemTabHighlight: { tabId: string; token: number }
  fileManagerTabOverflow: boolean
  fileManagerTabCanScrollLeft: boolean
  fileManagerTabCanScrollRight: boolean
  showFileManagerTabIcons: boolean
  hideFileManagerTabCloseButton: boolean
  draggingFileManagerTabId: string
  setDraggingFileManagerTabId: React.Dispatch<React.SetStateAction<string>>
  draggingFileManagerTabIdRef: React.RefObject<string>
  fileManagerTabScrollRef: React.RefObject<HTMLDivElement | null>
  fileManagerTabDropIndicator: FileManagerTabDropIndicator | null
  setFileManagerTabDropIndicator: React.Dispatch<React.SetStateAction<FileManagerTabDropIndicator | null>>
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  scrollFileManagerTabs: (direction: number) => void
  handleFileManagerTabWheel: (event: React.WheelEvent<HTMLDivElement>) => void
  handleFileManagerTabScroll: (event: React.UIEvent<HTMLDivElement>) => void
  resolveFileManagerTabAppendTarget: () => { id: string } | null
  resolveFileManagerTabDropSide: (event: React.MouseEvent<HTMLDivElement>, tab: FileManagerTabLike) => string
  getFileManagerTabDropPreviewText: (draggedTabId: string, targetTab: FileManagerTabLike, side?: string) => string
  clearFileManagerTabDragState: () => void
  reorderFileManagerTabs: (draggedTabId: string, targetTabId: string, side?: string) => void
  activateFileManagerTab: (tabId: string) => Promise<void>
  handleCloseFileManagerTab: (tabId: string, event: React.MouseEvent | undefined) => Promise<void>
  handleCreateFileManagerTab: () => Promise<void>
  normalizePath: (value: unknown) => string
  t: LooseT
}

export function FileManagerTabBar({
  fileManagerWorkspace,
  activeFileManagerTab,
  cwdSystemTabHighlight,
  fileManagerTabOverflow,
  fileManagerTabCanScrollLeft,
  fileManagerTabCanScrollRight,
  showFileManagerTabIcons,
  hideFileManagerTabCloseButton,
  draggingFileManagerTabId,
  setDraggingFileManagerTabId,
  draggingFileManagerTabIdRef,
  fileManagerTabScrollRef,
  fileManagerTabDropIndicator,
  setFileManagerTabDropIndicator,
  setContextMenu,
  scrollFileManagerTabs,
  handleFileManagerTabWheel,
  handleFileManagerTabScroll,
  resolveFileManagerTabAppendTarget,
  resolveFileManagerTabDropSide,
  getFileManagerTabDropPreviewText,
  clearFileManagerTabDragState,
  reorderFileManagerTabs,
  activateFileManagerTab,
  handleCloseFileManagerTab,
  handleCreateFileManagerTab,
  normalizePath,
  t,
}: FileManagerTabBarProps) {
  return (
    <div className="terminal-sub-tab-bar">
      {fileManagerTabOverflow && (
        <button
          type="button"
          className={`terminal-sub-tab-nav terminal-sub-tab-nav-left${fileManagerTabCanScrollLeft ? '' : ' disabled'}`}
          onClick={() => scrollFileManagerTabs(-1)}
          aria-label={t('向左滚动标签')}
          title={t('向左滚动标签')}
          disabled={!fileManagerTabCanScrollLeft}
        >
          <ChevronLeft size={14} />
        </button>
      )}
      <div
        ref={fileManagerTabScrollRef}
        className="terminal-sub-tab-scroll"
        onWheel={handleFileManagerTabWheel}
        onScroll={handleFileManagerTabScroll}
        onDragOver={(event) => {
          const draggedTabId = draggingFileManagerTabIdRef.current || draggingFileManagerTabId;
          if (!draggedTabId) {
            return;
          }
          if ((event.target as HTMLElement | null)?.closest?.('.terminal-sub-tab')) {
            return;
          }
          const appendTarget = resolveFileManagerTabAppendTarget();
          if (!appendTarget || appendTarget.id === draggedTabId) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          setFileManagerTabDropIndicator((current: FileManagerTabDropIndicator | null) => (
            current?.tabId === appendTarget.id && current?.side === 'after'
              ? current
              : { tabId: appendTarget.id, side: 'after' }
          ));
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) {
            return;
          }
          setFileManagerTabDropIndicator((current: FileManagerTabDropIndicator | null) => (
            current?.side === 'after' ? null : current
          ));
        }}
        onDrop={(event) => {
          const draggedTabId = event.dataTransfer.getData('text/plain') || draggingFileManagerTabIdRef.current || draggingFileManagerTabId;
          if (!draggedTabId) {
            clearFileManagerTabDragState();
            return;
          }
          if ((event.target as HTMLElement | null)?.closest?.('.terminal-sub-tab')) {
            return;
          }
          const appendTarget = resolveFileManagerTabAppendTarget();
          if (!appendTarget || appendTarget.id === draggedTabId) {
            clearFileManagerTabDragState();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          reorderFileManagerTabs(draggedTabId, appendTarget.id, 'after');
          clearFileManagerTabDragState();
        }}
      >
        {fileManagerWorkspace.tabs.map((tab) => {
          const isActiveTab = activeFileManagerTab?.id === tab.id;
          const isPinnedTab = tab.pinned === true;
          const isSystemPinnedTab = tab.systemPinned === true;
          const isCwdSystemPinnedTab = String(tab.systemPinnedType || '').trim() === FILE_MANAGER_SYSTEM_TAB_KIND_CWD;
          const isCwdSystemTabHighlightVisible = isCwdSystemPinnedTab && cwdSystemTabHighlight.tabId === tab.id;
          const isDraggingTab = draggingFileManagerTabId === tab.id;
          const showDropIndicator = fileManagerTabDropIndicator?.tabId === tab.id;
          const dropIndicatorSide = typeof fileManagerTabDropIndicator?.side === 'string' ? fileManagerTabDropIndicator.side : 'after';
          const tabDropPreviewText = showDropIndicator
            ? getFileManagerTabDropPreviewText(draggingFileManagerTabIdRef.current || draggingFileManagerTabId, tab, dropIndicatorSide)
            : '';
          const tabDefaultTiptopText = draggingFileManagerTabId
            ? null
            : (
              <>
                <div>{tab.path || '/'}</div>
                <div style={{ marginTop: 2, opacity: 0.78, fontSize: 11 }}>{t('双击关闭标签,长按拖拽调整')}</div>
              </>
            );
          return (
            <div
              key={tab.id}
              className={`terminal-sub-tab ${isActiveTab ? 'active' : ''}${isCwdSystemPinnedTab ? ' terminal-sub-tab-cwd' : ''}`}
              draggable={!isSystemPinnedTab}
              onDragStart={(event) => {
                if (isSystemPinnedTab) {
                  return;
                }
                event.stopPropagation();
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tab.id);
                draggingFileManagerTabIdRef.current = tab.id;
                setDraggingFileManagerTabId(tab.id);
                setFileManagerTabDropIndicator(null);
              }}
              onDragOver={(event) => {
                const draggedTabId = draggingFileManagerTabIdRef.current || draggingFileManagerTabId;
                if (!draggedTabId || draggedTabId === tab.id) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                const side = resolveFileManagerTabDropSide(event, tab);
                setFileManagerTabDropIndicator((current: FileManagerTabDropIndicator | null) => (
                  current?.tabId === tab.id && current?.side === side
                    ? current
                    : { tabId: tab.id, side }
                ));
              }}
              onDragLeave={(event) => {
                event.stopPropagation();
                setFileManagerTabDropIndicator((current: FileManagerTabDropIndicator | null) => (current?.tabId === tab.id ? null : current));
              }}
              onDrop={(event) => {
                const draggedTabId = event.dataTransfer.getData('text/plain') || draggingFileManagerTabIdRef.current || draggingFileManagerTabId;
                if (!draggedTabId || draggedTabId === tab.id) {
                  clearFileManagerTabDragState();
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                const side = resolveFileManagerTabDropSide(event, tab);
                reorderFileManagerTabs(draggedTabId, tab.id, side);
                clearFileManagerTabDragState();
              }}
              onDragEnd={() => {
                clearFileManagerTabDragState();
              }}
              onClick={() => { void activateFileManagerTab(tab.id); }}
              onDoubleClick={(event) => { void handleCloseFileManagerTab(tab.id, event); }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const tabPath = normalizePath(tab.path) || '/';
                setContextMenu({
                  pos: { x: event.clientX, y: event.clientY },
                  item: buildDirectoryItemFromPath(tabPath),
                  mode: 'tab',
                  tabId: tab.id,
                  tabPath,
                  tabPinned: isPinnedTab,
                  tabSystemPinned: isSystemPinnedTab,
                  itemBasePath: getParentPath(tabPath),
                  createBasePath: tabPath,
                  showCreateActions: true,
                });
              }}
              style={{
                position: 'relative',
                opacity: isDraggingTab ? 0.45 : 1,
                gap: isPinnedTab ? 4 : undefined,
                paddingLeft: isPinnedTab ? 9 : undefined,
                paddingRight: isPinnedTab ? 10 : undefined,
              }}
            >
              {isCwdSystemTabHighlightVisible && (
                <span
                  key={`cwd-system-tab-highlight-${cwdSystemTabHighlight.token}`}
                  className="terminal-sub-tab-change-ring"
                  aria-hidden="true"
                />
              )}
              {showDropIndicator && (
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    bottom: 4,
                    [dropIndicatorSide === 'before' ? 'left' : 'right']: -1,
                    width: 2,
                    borderRadius: 999,
                    background: 'var(--accent)',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {showFileManagerTabIcons && !isSystemPinnedTab && <Folder size={11} />}
              {isPinnedTab && !isSystemPinnedTab && <Pin size={9} style={{ opacity: 0.78, marginLeft: -1, marginRight: -2 }} />}
              <Tiptop
                text={tabDropPreviewText || tabDefaultTiptopText}
                placement="bottom"
                forceVisible={showDropIndicator && Boolean(tabDropPreviewText)}
              >
                {renderFileManagerTabTitle(tab, t)}
              </Tiptop>
              {!hideFileManagerTabCloseButton && fileManagerWorkspace.tabs.length > 1 && !isPinnedTab && (
                <span
                  className="terminal-sub-tab-close"
                  onClick={(event) => { void handleCloseFileManagerTab(tab.id, event); }}
                >
                  <X size={10} />
                </span>
              )}
            </div>
          );
        })}
        {draggingFileManagerTabId && (
          <div
            onDragOver={(event) => {
              const draggedTabId = draggingFileManagerTabIdRef.current || draggingFileManagerTabId;
              const appendTarget = resolveFileManagerTabAppendTarget();
              if (!draggedTabId || !appendTarget || appendTarget.id === draggedTabId) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              setFileManagerTabDropIndicator((current: FileManagerTabDropIndicator | null) => (
                current?.tabId === appendTarget.id && current?.side === 'after'
                  ? current
                  : { tabId: appendTarget.id, side: 'after' }
              ));
            }}
            onDrop={(event) => {
              const draggedTabId = event.dataTransfer.getData('text/plain') || draggingFileManagerTabIdRef.current || draggingFileManagerTabId;
              const appendTarget = resolveFileManagerTabAppendTarget();
              if (!draggedTabId || !appendTarget || appendTarget.id === draggedTabId) {
                clearFileManagerTabDragState();
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              reorderFileManagerTabs(draggedTabId, appendTarget.id, 'after');
              clearFileManagerTabDragState();
            }}
            style={{ flex: '1 0 24px', minWidth: 24, alignSelf: 'stretch' }}
          />
        )}
      </div>
      {fileManagerTabOverflow && (
        <button
          type="button"
          className={`terminal-sub-tab-nav terminal-sub-tab-nav-right${fileManagerTabCanScrollRight ? '' : ' disabled'}`}
          onClick={() => scrollFileManagerTabs(1)}
          aria-label={t('向右滚动标签')}
          title={t('向右滚动标签')}
          disabled={!fileManagerTabCanScrollRight}
        >
          <ChevronRight size={14} />
        </button>
      )}
      <div className="terminal-sub-tab-actions">
        <button
          className="btn btn-ghost btn-sm terminal-create-btn"
          onClick={() => { void handleCreateFileManagerTab(); }}
          aria-label={t('新建标签')}
          title={t('新建标签')}
        >
          <Plus size={14} />
          {t('新建标签')}
        </button>
      </div>
    </div>
  );
}
