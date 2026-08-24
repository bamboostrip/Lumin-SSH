import React from 'react';
import { ChevronLeft, ChevronRight, Folder, Pin, Plus, X } from 'lucide-react';
import { renderFileManagerTabTitle } from '../../utils/fileManagerHelpers.tsx';
import type { FileManagerWorkspaceState } from '../../utils/fileWorkbench.ts';
import type { LooseT } from './fileManagerTypes.ts';

// 双面板布局左侧的标签侧栏（展开/收起 + 历史标签列表）。
// props 与 FileManager 主组件中的同名闭包变量一一对应，渲染逻辑从主组件原样搬移。
interface FileManagerSidebarProps {
  fileManagerWorkspace: FileManagerWorkspaceState
  currentPaneTabId: string
  fileManagerSidebarOpen: boolean
  setFileManagerSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
  showFileManagerTabIcons: boolean
  hideFileManagerTabCloseButton: boolean
  activateFileManagerTab: (tabId: string) => Promise<void>
  handleCloseFileManagerTab: (tabId: string, event: React.MouseEvent | undefined) => Promise<void>
  handleCreateFileManagerTab: () => Promise<void>
  t: LooseT
}

export function FileManagerSidebar({
  fileManagerWorkspace,
  currentPaneTabId,
  fileManagerSidebarOpen,
  setFileManagerSidebarOpen,
  showFileManagerTabIcons,
  hideFileManagerTabCloseButton,
  activateFileManagerTab,
  handleCloseFileManagerTab,
  handleCreateFileManagerTab,
  t,
}: FileManagerSidebarProps) {
  return (
    <div style={{ display: 'flex', flexShrink: 0, alignItems: 'stretch', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          aria-label={fileManagerSidebarOpen ? t('收起标签侧栏') : t('展开标签侧栏')}
          title={fileManagerSidebarOpen ? t('收起标签侧栏') : t('展开标签侧栏')}
          onClick={() => setFileManagerSidebarOpen((current) => !current)}
        >
          {fileManagerSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          aria-label={t('新建标签')}
          title={t('新建标签')}
          onClick={() => { void handleCreateFileManagerTab(); }}
        >
          <Plus size={14} />
        </button>
      </div>
      {fileManagerSidebarOpen && (
        <div style={{ width: 220, minWidth: 220, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-raised)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t('历史标签')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, overflowY: 'auto' }}>
            {fileManagerWorkspace.tabs.map((tab) => {
              const isSidebarActive = tab.id === currentPaneTabId;
              const isPinnedTab = tab.pinned === true;
              const isSystemPinnedTab = tab.systemPinned === true;
              return (
                <button
                  key={`sidebar-tab-${tab.id}`}
                  type="button"
                  onClick={() => { void activateFileManagerTab(tab.id); }}
                  onDoubleClick={(event) => { void handleCloseFileManagerTab(tab.id, event); }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void activateFileManagerTab(tab.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isPinnedTab ? 6 : 8,
                    width: '100%',
                    padding: isPinnedTab ? '8px 10px 8px 8px' : '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: isSidebarActive ? 'var(--accent)' : 'var(--border)',
                    background: isSidebarActive ? 'var(--surface-overlay)' : 'transparent',
                    color: isSidebarActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {showFileManagerTabIcons && !isSystemPinnedTab && <Folder size={12} />}
                  {isPinnedTab && !isSystemPinnedTab && <Pin size={10} style={{ opacity: 0.78, marginLeft: -1, marginRight: -2 }} />}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{renderFileManagerTabTitle(tab, t)}</span>
                  {!hideFileManagerTabCloseButton && fileManagerWorkspace.tabs.length > 1 && !isPinnedTab && (
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCloseFileManagerTab(tab.id, event);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                      <X size={11} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
