import React from 'react'
import { Archive, ArchiveRestore, Bot, CheckSquare, FolderOpen, FolderPlus, Pencil, Scissors, Search, Trash2 } from 'lucide-react'
import Tiptop from '../Tiptop.tsx'
import { getLanguage } from '../../i18n.ts'
import { buildAIConversationDisplayList, type PanelState } from './aiChatLogic.ts'
import type { AIConversationMessageSearchResult } from './aiConversationBridge.ts'
import type { AIConversationOrganizerState } from '../../utils/aiConversationOrganizer.ts'
import { buildAIHistoryDisplayTimeParts, getAIHistoryRelativeTimeToneStyle } from './aiTimeFormat.ts'
import type { ConversationSummary } from './aiConversationSummary.ts'
import type { I18nKey } from '../../i18n.ts'

type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string

// AI 面板首页视图：全局搜索 / 分组 tab / 会话列表 / 多选批量操作条。
// 从 AIConversationTabPanel 的 renderedConversationList useMemo 原样搬移，
// props 与原闭包变量同名，渲染逻辑零改动。
interface AIHomeViewProps {
  t: LooseT
  conversationList: ConversationSummary[]
  conversationOrganizer: AIConversationOrganizerState
  conversationFilter: string
  conversationSelectionMode: boolean
  selectedConversationIds: Set<string>
  editingConversationGroupId: string
  editingConversationGroupName: string
  draggingConversationGroupId: string
  dragOverConversationGroupId: string
  moveToGroupOpen: boolean
  isDevilMode: boolean
  globalSearchOpen: boolean
  globalSearchQuery: string
  normalizedGlobalSearchQuery: string
  globalSearchLoading: boolean
  globalSearchResults: AIConversationMessageSearchResult[]
  panelState: PanelState
  globalSearchInputRef: React.RefObject<HTMLInputElement | null>
  conversationGroupRenameInputRef: React.RefObject<HTMLInputElement | null>
  setGlobalSearchQuery: React.Dispatch<React.SetStateAction<string>>
  setConversationFilter: React.Dispatch<React.SetStateAction<string>>
  setConversationSelectionMode: React.Dispatch<React.SetStateAction<boolean>>
  setEditingConversationGroupName: React.Dispatch<React.SetStateAction<string>>
  setDraggingConversationGroupId: React.Dispatch<React.SetStateAction<string>>
  setDragOverConversationGroupId: React.Dispatch<React.SetStateAction<string>>
  setMoveToGroupOpen: React.Dispatch<React.SetStateAction<boolean>>
  // 回调签名以面板内 useCallback 实现为准，此处宽签约（调用点仍受 props 校验）
  beginRenameConversationGroup: (...args: any[]) => any
  cancelRenameConversationGroup: (...args: any[]) => any
  clearConversationSelection: (...args: any[]) => any
  commitRenameConversationGroup: (...args: any[]) => any
  reorderConversationGroup: (...args: any[]) => any
  showSystemGroupRenameUnsupported: (...args: any[]) => any
  resetGlobalSearchState: (...args: any[]) => any
  handleOpenGlobalSearch: (...args: any[]) => any
  handleSelectGlobalSearchResult: (...args: any[]) => any
  handleOpenConversation: (...args: any[]) => any
  handleOpenConversationFolder: (...args: any[]) => any
  handleMakeConversationPermanent: (...args: any[]) => any
  handleRenameConversationTitle: (...args: any[]) => any
  handleDeleteConversation: (...args: any[]) => any
  handleCreateConversationGroup: (...args: any[]) => any
  handleDeleteConversationGroup: (...args: any[]) => any
  toggleConversationSelection: (...args: any[]) => any
  handleMoveSelectedConversations: (...args: any[]) => any
  handleSetSelectedArchived: (...args: any[]) => any
  handleDeleteSelectedConversations: (...args: any[]) => any
}

export function AIHomeView({
  t,
  conversationList,
  conversationOrganizer,
  conversationFilter,
  conversationSelectionMode,
  selectedConversationIds,
  editingConversationGroupId,
  editingConversationGroupName,
  draggingConversationGroupId,
  dragOverConversationGroupId,
  moveToGroupOpen,
  isDevilMode,
  globalSearchOpen,
  globalSearchQuery,
  normalizedGlobalSearchQuery,
  globalSearchLoading,
  globalSearchResults,
  panelState,
  globalSearchInputRef,
  conversationGroupRenameInputRef,
  setGlobalSearchQuery,
  setConversationFilter,
  setConversationSelectionMode,
  setEditingConversationGroupName,
  setDraggingConversationGroupId,
  setDragOverConversationGroupId,
  setMoveToGroupOpen,
  beginRenameConversationGroup,
  cancelRenameConversationGroup,
  clearConversationSelection,
  commitRenameConversationGroup,
  reorderConversationGroup,
  showSystemGroupRenameUnsupported,
  resetGlobalSearchState,
  handleOpenGlobalSearch,
  handleSelectGlobalSearchResult,
  handleOpenConversation,
  handleOpenConversationFolder,
  handleMakeConversationPermanent,
  handleRenameConversationTitle,
  handleDeleteConversation,
  handleCreateConversationGroup,
  handleDeleteConversationGroup,
  toggleConversationSelection,
  handleMoveSelectedConversations,
  handleSetSelectedArchived,
  handleDeleteSelectedConversations,
}: AIHomeViewProps) {
  let content = null
  const getConversationGroupId = (item: ConversationSummary) => {
    const ownerId = item.rootConversationId || item.parentConversationId || item.id
    return conversationOrganizer.assignments[item.id] || conversationOrganizer.assignments[ownerId] || ''
  }
  const visibleConversationList = conversationList.filter((item) => {
    if (conversationFilter === 'archived') return item.archived === true
    if (item.archived === true) return false
    if (conversationFilter === 'all') return true
    const groupId = getConversationGroupId(item)
    return conversationFilter === 'ungrouped' ? !groupId : groupId === conversationFilter
  })
  const displayConversationList = buildAIConversationDisplayList(visibleConversationList)

  if (globalSearchOpen) {
    content = (
      <div style={{ display: 'grid', minHeight: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-base)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
            <input
              id="ai-panel-main-global-search"
              name="ai-panel-main-global-search"
              autoComplete="off"
              ref={globalSearchInputRef}
              value={globalSearchQuery}
              onChange={(event) => setGlobalSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  resetGlobalSearchState()
                }
              }}
              placeholder={t('输入关键词搜索全部对话')}
              style={{
                height: 34,
                width: '100%',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-sunken)',
                color: 'var(--text-primary)',
                padding: '0 10px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <button
              type="button"
              title={t('关闭搜索')}
              aria-label={t('关闭搜索')}
              onClick={resetGlobalSearchState}
              style={{
                width: 34,
                height: 34,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-base)',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>
        {normalizedGlobalSearchQuery ? (
          globalSearchLoading ? (
            <div style={{ minHeight: 'calc(100% - 101px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.8 }}>
              {t('加载中...')}
            </div>
          ) : globalSearchResults.length === 0 ? (
            <div style={{ minHeight: 'calc(100% - 101px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.8 }}>
              {t('没有找到匹配内容')}
            </div>
          ) : (
            <div style={{ display: 'grid' }}>
              {globalSearchResults.map((result) => {
                const historyTimeParts = buildAIHistoryDisplayTimeParts(result.updatedAt || 0, getLanguage() || 'zh-CN')
                const historyRelativeToneStyle = getAIHistoryRelativeTimeToneStyle(result.updatedAt || 0)
                return (
                <button
                  key={`${result.conversationId}:${result.messageId}`}
                  type="button"
                  onClick={() => {
                    void handleSelectGlobalSearchResult(result)
                  }}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gap: 8,
                    padding: '12px 14px',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.conversationTitle}</div>
                    <div style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>{result.role === 'user' ? t('用户') : t('AI')}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
                    <span>{historyTimeParts.absoluteText}</span>
                    {historyTimeParts.relativeText ? (
                      <span style={historyRelativeToneStyle}>({historyTimeParts.relativeText})</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.snippet}</div>
                </button>
                )
              })}
            </div>
          )
        ) : (
          <div style={{ minHeight: 'calc(100% - 101px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.8 }}>
            {t('搜索全部对话中的消息')}
          </div>
        )}
      </div>
    )
  } else if (displayConversationList.length === 0) {
    content = (
      <div style={{ minHeight: 'calc(100% - 53px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.8 }}>
        <div style={{ maxWidth: '80%', display: 'grid', gap: 2 }}>
          <div>{conversationFilter === 'archived' ? t('当前没有已归档会话') : t('当前分组没有会话')}</div>
        </div>
      </div>
    )
  } else {
    content = displayConversationList.map((item) => {
      const isAgentSubtask = item.relationType === 'agent'
      const isArchivedAgentSubtask = isAgentSubtask && item.archived === true
      const isSummarySubtask = item.relationType === 'phase' && item.relationSource === 'summary_condense'
      const historyTimeParts = buildAIHistoryDisplayTimeParts(item.updatedAt, getLanguage() || 'zh-CN')
      const historyRelativeToneStyle = getAIHistoryRelativeTimeToneStyle(item.updatedAt)
      const displayTitle = typeof item.title === 'string'
        ? item.title.replace(/\s*·\s*摘要子任务\s*$/u, '').replace(/\s*·\s*子代理任务\s*$/u, '').trim()
        : ''
      const selected = selectedConversationIds.has(item.id)
      return (
        <div
          key={item.id}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            background: selected ? 'rgba(var(--accent-rgb), 0.12)' : panelState.activeConversationId === item.id ? 'rgba(var(--accent-rgb), 0.08)' : 'transparent',
            borderLeft: panelState.activeConversationId === item.id ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'var(--transition)',
            opacity: item.archived === true ? 0.72 : 1,
            contentVisibility: 'auto',
            containIntrinsicSize: '56px',
            contain: 'layout paint style',
          }}
        >
          {conversationSelectionMode ? (
            <button
              type="button"
              className="ai-conversation-row-action"
              aria-label={selected ? t('取消选择') : t('选择')}
              aria-pressed={selected}
              onClick={() => toggleConversationSelection(item.id)}
              style={{ width: 34, alignSelf: 'stretch', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: selected ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--accent)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{selected ? '✓' : ''}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => conversationSelectionMode ? toggleConversationSelection(item.id) : void handleOpenConversation(item.id)}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2, paddingLeft: item.depth > 0 ? `${item.depth * 12}px` : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {isAgentSubtask ? (
                  <Tiptop text={t('子代理任务')} placement="top">
                    <span
                      aria-label={t('子代理任务')}
                      style={{
                        width: 18,
                        height: 18,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        border: isArchivedAgentSubtask ? '1px solid var(--border)' : '1px solid rgba(var(--accent-rgb), 0.22)',
                        background: isArchivedAgentSubtask ? 'var(--surface-sunken)' : 'rgba(var(--accent-rgb), 0.10)',
                        color: isArchivedAgentSubtask ? 'var(--text-tertiary)' : 'var(--accent)',
                        flexShrink: 0,
                      }}
                    >
                      <Bot size={11} />
                    </span>
                  </Tiptop>
                ) : null}
                {isSummarySubtask ? (
                  <Tiptop text={t('摘要子任务')} placement="top">
                    <span
                      aria-label={t('摘要子任务')}
                      style={{
                        width: 18,
                        height: 18,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        border: '1px solid rgba(var(--accent-rgb), 0.22)',
                        background: 'rgba(var(--accent-rgb), 0.10)',
                        color: 'var(--accent)',
                        flexShrink: 0,
                      }}
                    >
                      <Scissors size={11} />
                    </span>
                  </Tiptop>
                ) : null}
                {item.transient === true ? (
                  <span title={t('临时会话')} style={{ flexShrink: 0, padding: '1px 5px', borderRadius: 4, background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent)', fontSize: 10, fontWeight: 600 }}>
                    {t('临时会话')}
                  </span>
                ) : null}
                <div style={{ minWidth: 0, fontSize: 13, fontWeight: panelState.activeConversationId === item.id ? 600 : 500, color: isArchivedAgentSubtask ? 'var(--text-secondary)' : 'var(--text-primary)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayTitle || item.title}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                  <span>{historyTimeParts.absoluteText}</span>
                  {historyTimeParts.relativeText ? (
                    <span style={historyRelativeToneStyle}>({historyTimeParts.relativeText})</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>·{item.messageCount}</div>
              </div>
            </div>
          </button>
          {!conversationSelectionMode ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 10, flexShrink: 0 }}>
            {item.transient === true ? (
              <button
                type="button"
                className="ai-conversation-row-action"
                title={`${t('临时会话')} → ${t('保存')}`}
                aria-label={`${t('临时会话')} → ${t('保存')}`}
                onClick={() => void handleMakeConversationPermanent(item.id)}
                style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: 'var(--accent)', background: 'transparent', border: '1px solid transparent', boxShadow: 'none', flexShrink: 0, cursor: 'pointer', transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease' }}
              >
                <ArchiveRestore size={13} />
              </button>
            ) : null}
            {item.transient !== true ? (
            <button
              type="button"
              className="ai-conversation-row-action"
              title={t('打开任务所在文件夹')}
              aria-label={t('打开任务所在文件夹')}
              onClick={() => void handleOpenConversationFolder(item.id)}
              style={{
                width: 26,
                height: 26,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: '1px solid transparent',
                boxShadow: 'none',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
              }}
            >
              <FolderOpen size={13} />
            </button>
            ) : null}
            {item.transient !== true ? (
            <button
              type="button"
              className="ai-conversation-row-action"
              title={t('编辑任务标题')}
              aria-label={t('编辑任务标题')}
              onClick={() => void handleRenameConversationTitle(item.id)}
              style={{
                width: 26,
                height: 26,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: '1px solid transparent',
                boxShadow: 'none',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
              }}
            >
              <Pencil size={13} />
            </button>
            ) : null}
            <button
              type="button"
              className="ai-conversation-row-action ai-conversation-row-action-danger"
              title={t('删除')}
              aria-label={t('删除')}
              onClick={() => {
                void handleDeleteConversation(item.id)
              }}
              style={{
                width: 26,
                height: 26,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: '1px solid transparent',
                boxShadow: 'none',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
              }}
            >
              ×
            </button>
          </div> : null}
        </div>
      )
    })
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--surface-base)' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-raised)', position: 'sticky', top: 0, zIndex: 2, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{conversationSelectionMode ? t('已选择 {count} 项').replace('{count}', String(selectedConversationIds.size)) : t('对话历史')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" title={conversationSelectionMode ? t('退出多选') : t('多选')} aria-label={conversationSelectionMode ? t('退出多选') : t('多选')} onClick={() => conversationSelectionMode ? clearConversationSelection() : setConversationSelectionMode(true)} style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: conversationSelectionMode ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)', background: conversationSelectionMode ? 'rgba(var(--accent-rgb), 0.10)' : 'var(--surface-sunken)', color: conversationSelectionMode ? 'var(--accent)' : 'var(--text-tertiary)', cursor: 'pointer' }}><CheckSquare size={14} /></button>
        <button type="button" title={t('新建分组')} aria-label={t('新建分组')} onClick={() => void handleCreateConversationGroup()} style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)', color: 'var(--text-tertiary)', cursor: 'pointer' }}><FolderPlus size={14} /></button>
        <button
          type="button"
          title={t('全局搜索对话')}
          aria-label={t('全局搜索对话')}
          onClick={handleOpenGlobalSearch}
          style={{
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: globalSearchOpen ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
            background: globalSearchOpen ? 'rgba(var(--accent-rgb), 0.10)' : 'var(--surface-sunken)',
            color: globalSearchOpen ? 'var(--accent)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'var(--transition-fast)',
            flexShrink: 0,
          }}
        >
          <Search size={14} />
        </button>
        </div>
        </div>
        <div role="tablist" aria-label={t('分组')} style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 1 }}>
          <button role="tab" aria-selected={conversationFilter === 'all'} type="button" onClick={() => { setConversationFilter('all'); clearConversationSelection(); cancelRenameConversationGroup() }} onDoubleClick={showSystemGroupRenameUnsupported} style={{ height: 26, padding: '0 9px', borderRadius: 7, border: conversationFilter === 'all' ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)', background: conversationFilter === 'all' ? 'rgba(var(--accent-rgb), 0.10)' : 'transparent', color: conversationFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }}>{t('全部')}</button>
          {conversationOrganizer.groups.map((group) => {
            const selected = conversationFilter === group.id
            const editing = editingConversationGroupId === group.id
            const dragging = draggingConversationGroupId === group.id
            const dragOver = dragOverConversationGroupId === group.id && !dragging
            return editing ? (
              <input
                key={group.id}
                ref={conversationGroupRenameInputRef}
                aria-label={t('重命名分组')}
                value={editingConversationGroupName}
                onChange={(event) => setEditingConversationGroupName(event.target.value)}
                onBlur={commitRenameConversationGroup}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); commitRenameConversationGroup() }
                  if (event.key === 'Escape') { event.preventDefault(); cancelRenameConversationGroup() }
                }}
                style={{ width: Math.max(72, Math.min(150, editingConversationGroupName.length * 12 + 24)), height: 26, padding: '0 8px', borderRadius: 7, border: '1px solid var(--accent-border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)', fontSize: 11, outline: '2px solid rgba(var(--accent-rgb), 0.16)', flexShrink: 0 }}
              />
            ) : (
              <button
                key={group.id}
                role="tab"
                aria-selected={selected}
                draggable
                type="button"
                onClick={() => { setConversationFilter(group.id); clearConversationSelection() }}
                onDoubleClick={() => beginRenameConversationGroup(group.id)}
                onContextMenu={(event) => { event.preventDefault(); void handleDeleteConversationGroup(group.id) }}
                onDragStart={(event) => { setDraggingConversationGroupId(group.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', group.id) }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverConversationGroupId(group.id) }}
                onDrop={(event) => { event.preventDefault(); reorderConversationGroup(draggingConversationGroupId || event.dataTransfer.getData('text/plain'), group.id); setDraggingConversationGroupId(''); setDragOverConversationGroupId('') }}
                onDragEnd={() => { setDraggingConversationGroupId(''); setDragOverConversationGroupId('') }}
                style={{ height: 26, padding: '0 9px', borderRadius: 7, border: dragOver ? '1px solid var(--accent)' : selected ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)', background: selected ? 'rgba(var(--accent-rgb), 0.10)' : 'transparent', color: selected ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap', cursor: dragging ? 'grabbing' : 'grab', flexShrink: 0, opacity: dragging ? 0.5 : 1, transform: dragOver ? 'translateX(2px)' : 'none', transition: 'var(--transition-fast)' }}>
                {group.name}
              </button>
            )
          })}
          <button role="tab" aria-selected={conversationFilter === 'archived'} type="button" onClick={() => { setConversationFilter('archived'); clearConversationSelection(); cancelRenameConversationGroup() }} onDoubleClick={showSystemGroupRenameUnsupported} style={{ height: 26, padding: '0 9px', borderRadius: 7, border: conversationFilter === 'archived' ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)', background: conversationFilter === 'archived' ? 'rgba(var(--accent-rgb), 0.10)' : 'transparent', color: conversationFilter === 'archived' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }}>{t('已归档')}</button>
        </div>
      </div>
      {content}
      {conversationSelectionMode && selectedConversationIds.size > 0 ? (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 3, display: 'grid', gap: 6, padding: 8, borderTop: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
          {moveToGroupOpen ? (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
              <button type="button" onClick={() => handleMoveSelectedConversations('')} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>{t('移出分组')}</button>
              {conversationOrganizer.groups.map((group) => <button key={group.id} type="button" onClick={() => handleMoveSelectedConversations(group.id)} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>{group.name}</button>)}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoveToGroupOpen((current) => !current)} style={{ flex: 1 }}>{t('移动到分组')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleSetSelectedArchived(conversationFilter !== 'archived')} style={{ flex: 1, display: 'inline-flex', gap: 5, alignItems: 'center', justifyContent: 'center' }}>{conversationFilter === 'archived' ? <ArchiveRestore size={13} /> : <Archive size={13} />}{conversationFilter === 'archived' ? t('恢复') : t('归档')}</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void handleDeleteSelectedConversations()} aria-label={t('删除')} style={{ width: 34, padding: 0 }}><Trash2 size={13} /></button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
