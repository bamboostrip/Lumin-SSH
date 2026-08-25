import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Bot, CheckSquare, ChevronLeft, ChevronRight, FolderOpen, FolderPlus, Loader2, Pencil, Scissors, Search, Trash2 } from 'lucide-react'
import { EventsOn } from '../../wailsjs/runtime/runtime.js'
import * as AppGo from '../../wailsjs/go/wailsapp/App.js'
import { useTranslation, t as translate, getLanguage, type I18nKey } from '../i18n.ts'
import { Z } from '../constants/zIndex'
import { Button } from './ui'
import { cn } from '../utils/cn.ts'
import AIPanelHeader from './ai/AIPanelHeader.tsx'
import AIConversationBackupSettings from './ai/AIConversationBackupSettings.tsx'
import AIPanelSettingsOverlay from './ai/AIPanelSettingsOverlay.tsx'
import AIComposer from './ai/AIComposer.tsx'
import { approveAIChatTools, assignAIChatToolTerminal, cancelAIChat, continueAIChatTool, disableAIChatCollaboration, listAIChatCommandTerminalCandidates, previewAIChatToolDiff, previewAIChatToolRestore, rejectAIChatTools, rejectAIChatToolsForQueuedSubmission, resolveAIChatFollowup, restoreAIChatTool, setAIChatSkipNextAutomaticRequest, startAIChat, startAIChatCollaboration, terminateAIChatTool } from './ai/aiChatBridge.ts'
import { buildAIConversationTokenLedger, condenseAIConversationContext, countAIConversationAPIMessageRawTokens, createAIConversation, createAIConversationSummarySubtask, deleteAIConversation, deleteTemporaryAIConversation, getAIAssistantFirstReply, getAIConversation, getTemporaryAIConversation, listAIConversations, listTemporaryAIConversations as listTemporaryAIConversationsFromDisk, normalizeAIConversationMessageSearchResult, normalizeAIConversationSnapshot, normalizeAIConversationTaskSettings, openAIConversationFolder, preprocessAIConversationLongText, readAIConversationWrappedFile, saveAIConversation, saveTemporaryAIConversation, searchAIConversationMessages, subscribeAIConversationChanges, type AIConversationMessageSearchResult } from './ai/aiConversationBridge.ts'
import { buildExecutionContextDetails, getExecutionContextSnapshot } from './ai/aiExecutionContext.ts'
import { getAIGlobalSettings, normalizeAIGlobalSettings, saveAIGlobalSettings, type AIGlobalSettings } from './ai/aiGlobalSettingsBridge.ts'
import { getAIProviderState, getAIProviderTokenGroup, type AIProviderState } from './ai/aiProviderBridge.ts'
import type { AIProviderLike } from './ai/AIProviderSelector.tsx'
import { clearThemeToolPreviewPackage, loadThemePackages, setThemeToolPreviewPackage } from '../utils/theme.ts'
import { getMCPSettingsState, saveMCPGlobalServer, reloadMCPGlobalServers, deleteMCPGlobalServer, restartMCPClientServer, toggleMCPClientServer, toggleMCPClientServerDisabledForPrompts, updateMCPClientServerTimeout } from './ai/mcpClientBridge.ts'
import { processRemoteFileMentions } from './ai/aiMentions.ts'
import { expandFirstSlashCommandForPrompt } from './ai/aiSlashCommands.ts'
import { useAIChatStreamEvents } from './ai/useAIChatStreamEvents.ts'
import { useAIPanelCoreState } from './ai/useAIPanelCoreState.ts'
import { useAIPanelSettingsState } from './ai/useAIPanelSettingsState.ts'
import { useAIGlobalSearch } from './ai/useAIGlobalSearch.ts'
import { useAIConversationSearch } from './ai/useAIConversationSearch.ts'
import { useAIConversationOrganizer } from './ai/useAIConversationOrganizer.ts'
import { useAIConversationHome } from './ai/useAIConversationHome.ts'
import { useAIAutoApprovalSettings } from './ai/useAIAutoApprovalSettings.ts'
import { useAIChatRequests } from './ai/useAIChatRequests.ts'
import { useAIChatActions } from './ai/useAIChatActions.ts'
import AIChatConversation from './ai/chat/AIChatConversation.tsx'
import { getConversationBranchAnchor } from './ai/chat/aiChatMessageTopology.ts'
import { isCallMyVipProviderHost } from './ai/providerSpecialHosts.ts'
import { getAIProviderDefinition } from './ai/providers/index.ts'
import {
  clearAIWorkspaceTabPendingLocation,
  createAIWorkspaceTabId,
  findAIWorkspaceConversationTab,
  getAIWorkspaceTabGroup,
  getAIWorkspaceTabPendingLocation,
  setAIWorkspaceTabGroup,
  setAIWorkspaceTabPendingLocation,
  subscribeAIWorkspaceTabGroup,
  type AIWorkspaceTab,
  type AIWorkspaceTabGroup,
} from '../utils/aiWorkspaceTabs.ts'
import { AIWorkspaceTabProvider } from './ai/aiWorkspaceTabContext.ts'
import { openGlobalContextMenu } from '../utils/contextMenu.ts'
import assistantThinkingActiveImg from '../assets/assistant-thinking-active.webm'
import Tiptop from './Tiptop.tsx'
import { createAIConversationGroup, loadAIConversationOrganizer, saveAIConversationOrganizer, type AIConversationOrganizerState } from '../utils/aiConversationOrganizer.ts'
import { AI_COLLABORATION_COMPRESSION_PREFIX, AI_COLLABORATION_CONTINUE_PREFIX, AI_COLLABORATION_DONE_PREFIX, AI_COLLABORATION_RETRY_PREFIX, AI_CONVERSATION_DIFF_SUCCESS_STATUSES, AI_CONVERSATION_DIFF_TOOL_NAMES, AI_FOLLOWUP_COMPLETED_STATUS_KEY, AI_FOLLOWUP_PENDING_STATUS_KEY, AI_WORKSPACE_TAB_CLOSE_QUIET_MS, AIPanelProps, buildAIConversationDisplayList, buildAIConversationSearchSnippet, buildAIFollowupAnswerPayload, buildAIQueuedSubmission, buildAIRequestModelMeta, buildMetrics, buildReasoningDuration, buildRequestMessages, cloneAIConversationCacheObjects, collectTurnUiMessageIds, computeAILastAssistantTurnState, createAPIHistoryMessage, createEmptyPanelState, extractAIConversationDiffPrimaryPath, extractAIConversationSearchText, findApiAnchorIndexByUiMessageId, findLatestAIFollowupMessageByRequestId, getAIBridge, insertMessageBeforeAssistant, isAIBusinessTurnMessageKind, isAIQueueBlocked, normalizeAICollaborationDecision, normalizeAICollaborationMode, normalizeAIContextTokensValue, normalizeAIConversationSearchQuery, normalizeAIMessageStatus, normalizeAIRuntimePhase, normalizeMessageImages, parseAICollaborationStreamBuffer, resolveAIEventSound, shouldUseAssistantFirstReplyForConversation, trimLatestAssistantAPIHistoryMessage, truncateConversationTitle, updateAILastAssistantTurnState, upsertAPIHistoryMessage, upsertMessageBeforeAssistant } from './ai/aiChatLogic.ts';
import type { AIAPIHistoryMessageLike, AIConversationSnapshot, AIEventPayloadShape, AIMessage, AIMetricsPayload, AIPanelSettings, AIQueuedSubmission, AIRequestMessage, AIToolExecution, APIHistoryMessage, ComposerEditState, DisplayConversationItem, McpInfoState, PanelState, PerfRecord, TokenLedger } from './ai/aiChatLogic.ts';
import { compressTerminalOutputForPrompt } from './ai/aiTerminalScreen.ts'
import { buildAIHistoryDisplayTimeParts, buildAIConversationSummarySubtaskContinuePrompt, formatMessageTime, getAIHistoryRelativeTimeToneStyle } from './ai/aiTimeFormat.ts'
import { upsertConversationSummary, type ConversationSummary } from './ai/aiConversationSummary.ts'
import { getTemporaryAIConversationSummary, listTemporaryAIConversations as listInMemoryTemporaryAIConversations, removeTemporaryAIConversation, seedTemporaryAIConversations, upsertTemporaryAIConversation, TEMPORARY_AI_CONVERSATIONS_CHANGED_EVENT } from './ai/aiTemporaryConversations.ts'

// ============================================================
// AIPanel 类型契约（props 见 AIPanelProps；内部数据模型见下）
// ============================================================

const AI_ROW_ACTION_BASE =
  'w-[26px] h-[26px] inline-flex items-center justify-center rounded-md shadow-none shrink-0 cursor-pointer transition-colors duration-[120ms]';
const AI_ROW_ACTION_HOVER_ACCENT =
  'hover:text-accent hover:bg-[rgba(var(--accent-rgb),0.10)] focus-visible:text-accent focus-visible:bg-[rgba(var(--accent-rgb),0.10)]';
const AI_ROW_ACTION_HOVER_DANGER =
  'hover:text-danger hover:bg-danger-dim focus-visible:text-danger focus-visible:bg-danger-dim';

function AIConversationTabPanel({ width, side, terminalId = 'global', sessionId = '', sessionTerminals = [], workspaceTabId = '', isHomeView = false, isWorkspaceTabActive = true, showComposer = true, initialConversationId = '', tabBar = null, onDevilModeChange, onGoHomeRequested, onOpenConversationRequested, onWorkspaceTabStateChange, addToast }: AIPanelProps) {
  const { t } = useTranslation()
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([])


  const {
    panelInstanceKey, terminalPanels, setTerminalPanels, terminalPanelsRef, deletedConversationIdsRef,
    isReturningHomeRef, conversationLoadRequestRef, panelMountedRef, tokenLedgerRef, sendPerfMetricsRef,
    pendingConversationId, setPendingConversationId, composerInputValue, setComposerInputValue,
    composerImages, setComposerImages, composerEditState, setComposerEditState, resetComposerEditState,
    conversationScrollSignal, requestConversationSmoothScrollToBottom, clearRestorePreview, panelState,
    activeConversation, normalizedInitialConversationId, isConversationLoading, activeConversationRelationType,
    activeConversationArchived, isThemeTuningConversation, runtimePhase, isStreaming, isAwaitingToolApproval,
    isToolRunning, isAwaitingCommandAction, isAwaitingTerminalAssignment, isQueueBlocked, setPanelState,
    getMessageApiLengthBefore, truncateConversationAfterMessage, rebuildAIConversationTokenLedger,
    refreshAIConversationContextTokens, saveConversationSnapshot,
  } = useAIPanelCoreState({ terminalId, sessionId, workspaceTabId, initialConversationId, isWorkspaceTabActive, onWorkspaceTabStateChange, setConversationList })

  const {
    globalSearchOpen, setGlobalSearchOpen, globalSearchQuery, setGlobalSearchQuery, globalSearchLoading,
    setGlobalSearchLoading, globalSearchResults, setGlobalSearchResults, globalSearchRequestRef,
    globalSearchInputRef, resetGlobalSearchState, normalizedGlobalSearchQuery, handleOpenGlobalSearch,
  } = useAIGlobalSearch({ panelMountedRef })

  const {
    conversationSearchOpen, setConversationSearchOpen, conversationSearchQuery, setConversationSearchQuery,
    conversationSearchIndex, setConversationSearchIndex, conversationSearchInputRef,
    resetConversationSearchState, normalizedConversationSearchQuery, conversationSearchResults,
    locateConversationMessage, handleOpenConversationSearch, handleCycleConversationSearchResult,
  } = useAIConversationSearch({ sessionId, terminalId, workspaceTabId, panelState, activeConversation })

  const {
    mcpInfo, setMcpInfo, mcpClientServers, mcpClientGlobalConfigPath, mcpClientGlobalConfigText,
    showSettingsPanel, setShowSettingsPanel, popupDismissVersion, setPopupDismissVersion, activeSettingsTab,
    setActiveSettingsTab, tasksDirMigrating, setTasksDirMigrating, temporarySessionEnabled,
    setTemporarySessionEnabled, themeToolPreview, setThemeToolPreview, globalAISettings, setGlobalAISettings,
    terminalOutputLineLimit, terminalOutputCharacterLimit, providerBalanceRefreshSignal,
    setProviderBalanceRefreshSignal, applyMCPInfo, applyMCPSettingsState, refreshMCPServerInfo,
    refreshMCPOutputCompressionSettings, showAlert, playAISound, requestDeleteConfirmation,
    normalizedGlobalAISettings, handleSaveAIPanelGlobalSettings, handleSaveMCPGlobalServer,
    handleReloadMCPGlobalServers, handleDeleteMCPGlobalServer, handleRestartMCPClientServer,
    handleToggleMCPClientServer, handleToggleMCPClientServerDisabledForPrompts,
    handleUpdateMCPClientServerTimeout, saveMCPOutputCompressionSettings, handleToggleAiTerminalIsolation,
    handleToggleConfirmDelete, handleToggleSettingsPanel, handleTerminalOutputLineLimitChange,
    handleTerminalOutputCharacterLimitChange,
  } = useAIPanelSettingsState({ t, isWorkspaceTabActive, panelMountedRef, activeConversation, resetGlobalSearchState, resetConversationSearchState })
  const {
    aiProviderState, setAIProviderState, isDevilMode, setIsDevilMode,
    refreshAIHomeData, terminalLabelMap, enrichAIChatCommandMessage, selectedAIProvider,
    availableAIProviders, canToggleAIMode, handleToggleDevilMode, resolveFirstAvailableProviderId,
    resolveAvailableProviderId, buildConversationWithProviderId, effectiveProviderId,
    resolveAIRequestModelMeta, conversationDiffItems, handleOpenConversationDiff, handleGoHome,
    handleOpenConversation, handleRestoreConversationBackup, handleOpenConversationFolder,
    handleRenameConversationTitle, handleSelectGlobalSearchResult, handleDeleteConversation,
    refreshConversationList, handleProviderChange,
  } = useAIConversationHome({ t, addToast, terminalId, sessionId, workspaceTabId, initialConversationId, isWorkspaceTabActive, sessionTerminals, onDevilModeChange, onGoHomeRequested, onOpenConversationRequested, panelInstanceKey, panelState, activeConversation, pendingConversationId, setPendingConversationId, setPanelState, setComposerEditState, terminalPanelsRef, deletedConversationIdsRef, isReturningHomeRef, conversationLoadRequestRef, panelMountedRef, tokenLedgerRef, rebuildAIConversationTokenLedger, saveConversationSnapshot, clearRestorePreview, resetComposerEditState, setThemeToolPreview, setShowSettingsPanel, setPopupDismissVersion, showAlert, refreshMCPServerInfo, refreshMCPOutputCompressionSettings, globalAISettings, setGlobalAISettings, conversationList, setConversationList, resetGlobalSearchState, resetConversationSearchState, locateConversationMessage, requestDeleteConfirmation })









  const effectiveAutoApprovalSettings = useMemo(() => {
    if (!activeConversation) {
      return normalizedGlobalAISettings
    }
    const normalizedTaskSettings = normalizeAIConversationTaskSettings(activeConversation.settings)
    return {
      ...normalizedTaskSettings,
      allowedCommands: normalizedGlobalAISettings.allowedCommands,
      deniedCommands: normalizedGlobalAISettings.deniedCommands,
    }
  }, [activeConversation, normalizedGlobalAISettings])
  const effectiveAutoApprovalEnabled = effectiveAutoApprovalSettings.autoApprovalEnabled
  const shouldPersistProviderSelection = !activeConversation
  const approvalButtonOrder = normalizedGlobalAISettings.approvalButtonOrder
  const commandActionButtonOrder = normalizedGlobalAISettings.commandActionButtonOrder
  const messageActionBarAtBottom = Boolean(normalizedGlobalAISettings.messageActionBarAtBottom)
  const messageNavEnabled = normalizedGlobalAISettings.messageNavEnabled !== false
  const shouldLockAssistantCollaboration = Boolean(effectiveAutoApprovalSettings.alwaysAllowFollowupQuestions)
  const collaborationLocked = Boolean(panelState.collaborationLocked) && Boolean(activeConversation)
  const collaborationActive = Boolean(panelState.collaborationActive)
  const isSummarySubtaskCollaborationActive = collaborationActive && panelState.collaborationMode === 'summary_subtask'
  const isArchivedAgentConversation = activeConversationArchived && activeConversationRelationType === 'agent'
  const canQuickCondenseConversation = Boolean(activeConversation) && runtimePhase === 'ready' && !panelState.isCondensingContext && !isArchivedAgentConversation
  const canSummaryCondenseConversation = Boolean(activeConversation) && runtimePhase === 'ready' && !panelState.isCondensingContext
  const composerInteractionLocked = isConversationLoading || (isArchivedAgentConversation && !isSummarySubtaskCollaborationActive)
  const composerInteractionLockedLabel = isConversationLoading
    ? t('加载中...')
    : t('当前子代理任务已归档,仅可摘要压缩创建新的子阶段任务')
  const collaborationFollowupInteractionLocked = collaborationLocked && collaborationActive && panelState.collaborationMode === 'followup'
  const showAssistantCollaborationActiveImage = !isConversationLoading && collaborationActive && Boolean(activeConversation)
  const toolResumeAvailable = Boolean(activeConversation)
    && !isArchivedAgentConversation
    && panelState.requestPhase === 'idle'
    && runtimePhase === 'ready'
    && !panelState.queuedSubmission
    && !panelState.isFlushingQueuedSubmission
    && !collaborationActive
    && !panelState.isCondensingContext
    && (!panelState.lastTurnBusinessMessageKind || (panelState.lastTurnBusinessMessageKind !== 'completion' && panelState.lastTurnBusinessMessageKind !== 'followup'))








































  const {
    conversationOrganizer, setConversationOrganizer, conversationFilter, setConversationFilter,
    conversationSelectionMode, setConversationSelectionMode, selectedConversationIds, setSelectedConversationIds,
    moveToGroupOpen, setMoveToGroupOpen, editingConversationGroupId, setEditingConversationGroupId,
    editingConversationGroupName, setEditingConversationGroupName, draggingConversationGroupId,
    setDraggingConversationGroupId, dragOverConversationGroupId, setDragOverConversationGroupId,
    conversationGroupRenameInputRef, conversationGroupRenameCancelledRef, persistConversationOrganizer,
    handleMakeConversationPermanent, handleCreateConversationGroup, beginRenameConversationGroup,
    cancelRenameConversationGroup, commitRenameConversationGroup, reorderConversationGroup,
    showSystemGroupRenameUnsupported, handleDeleteConversationGroup, toggleConversationSelection,
    clearConversationSelection, handleMoveSelectedConversations, handleSetSelectedArchived,
    handleDeleteSelectedConversations,
  } = useAIConversationOrganizer({ t, addToast, showAlert, requestDeleteConfirmation, isWorkspaceTabActive, refreshConversationList, handleOpenConversation, setConversationList })



  const {
    handlePatchAutoApprovalSettings, handleCollaborationExtraPromptChange,
    handleCollaborationPromptPresetsChange,
  } = useAIAutoApprovalSettings({ activeConversation, globalAISettings, normalizedGlobalAISettings, panelState, panelInstanceKey, saveConversationSnapshot, setPanelState, setGlobalAISettings, setComposerInputValue })

  const {
    handleSendMessage, handleFollowupResponse, handleConversationUserMessage, handleComposerSendMessage,
    handleRetryUserMessage, handleRetryAssistantMessage, handleEditUserMessage, handleDeleteMessage,
    handleCondenseContext, continueAIConversationSummarySubtask, runAIConversationSummarySubtaskFlow,
    handleCondenseContextFullSummary, resumeAIChatFromConversation,
  } = useAIChatRequests({ t, terminalId, sessionId, workspaceTabId, isWorkspaceTabActive, activeConversation, panelState, panelInstanceKey, terminalPanelsRef, sendPerfMetricsRef, setPanelState, setConversationList, setAIProviderState, setGlobalAISettings, setComposerEditState, setComposerInputValue, setComposerImages, resetComposerEditState, requestConversationSmoothScrollToBottom, clearRestorePreview, truncateConversationAfterMessage, saveConversationSnapshot, rebuildAIConversationTokenLedger, showAlert, requestDeleteConfirmation, resolveAvailableProviderId, buildConversationWithProviderId, resolveAIRequestModelMeta, setThemeToolPreview, globalAISettings, normalizedGlobalAISettings, aiProviderState, availableAIProviders, composerEditState, composerImages, temporarySessionEnabled, isDevilMode, isQueueBlocked, isArchivedAgentConversation, runtimePhase, effectiveProviderId, effectiveAutoApprovalEnabled, shouldLockAssistantCollaboration, collaborationFollowupInteractionLocked, terminalOutputLineLimit, terminalOutputCharacterLimit })



  useAIChatStreamEvents({
    terminalId,
    sessionId,
    workspaceTabId,
    panelInstanceKey,
    terminalPanelsRef,
    shouldLockAssistantCollaboration,
    activeConversation,
    panelState,
    setPanelState,
    enrichAIChatCommandMessage,
    playAISound,
    rebuildAIConversationTokenLedger,
    saveConversationSnapshot,
    resumeAIChatFromConversation,
    runAIConversationSummarySubtaskFlow,
    setThemeToolPreview,
    setConversationList,
    setComposerInputValue,
    setComposerImages,
    setProviderBalanceRefreshSignal,
  })


  const {
    handleCancelMessage, handleStopAndResumeMessage, handleResumeTask, handleApproveTools,
    handleRejectTools, handleContinueTool, handleTerminateTool, handlePreviewRestore,
    handlePreviewDiff, handleApplyRestore, handleListCommandTerminalCandidates,
    handleAssignToolTerminal, handleToggleSkipNextAutomaticRequest, handleInterruptCollaboration,
    handleCancelQueuedSubmission,
  } = useAIChatActions({ addToast, terminalId, workspaceTabId, activeConversation, panelState, panelInstanceKey, terminalPanelsRef, panelMountedRef, setPanelState, showAlert, clearRestorePreview, terminalLabelMap, isQueueBlocked, handleSendMessage, handleRetryAssistantMessage, resumeAIChatFromConversation, normalizedGlobalAISettings })


  // ponytail: mcpInfo.transport 是 MCP 协议层名称（streamable-http），
  // 客户端配置文件（如 ~/.claude.json）期望的 type 值为 "http"，这里做映射。
  // 仅 streamable-http 需要转换，其他值（如 sse、stdio）保持原样。
  const mcpConfigType = mcpInfo.transport === 'streamable-http' ? 'http' : (mcpInfo.transport || 'http')
  const configText = `"lumin-ssh": {
  "type": "${mcpConfigType}",
  "url": "${mcpInfo.url || ''}",
  "oauth": false,
  "alwaysAllow": [],
  "disabled": false,
  "timeout": 0,
  "disabledForPrompts": false
}`
  const configRows = Math.max(configText.split('\n').length, 1)

  const renderedConversationList = useMemo(() => {
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
        <div className="grid min-h-0">
          <div className="px-3.5 py-2.5 border-b border-line-subtle bg-canvas">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
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
                className="h-[34px] w-full rounded-lg border border-line bg-sunken text-primary px-2.5 box-border outline-none"
              />
              <button
                type="button"
                title={t('关闭搜索')}
                aria-label={t('关闭搜索')}
                onClick={resetGlobalSearchState}
                className="w-[34px] h-[34px] inline-flex items-center justify-center rounded-lg border border-line bg-canvas text-tertiary cursor-pointer"
              >
                ×
              </button>
            </div>
          </div>
          {normalizedGlobalSearchQuery ? (
            globalSearchLoading ? (
              <div className="min-h-[calc(100%-101px)] flex items-center justify-center p-5 text-center text-tertiary text-sm leading-[1.8]">
                {t('加载中...')}
              </div>
            ) : globalSearchResults.length === 0 ? (
              <div className="min-h-[calc(100%-101px)] flex items-center justify-center p-5 text-center text-tertiary text-sm leading-[1.8]">
                {t('没有找到匹配内容')}
              </div>
            ) : (
              <div className="grid">
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
                    className="w-full grid gap-2 py-3 px-3.5 border-0 border-b border-line bg-transparent text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-md font-bold text-primary whitespace-nowrap overflow-hidden text-ellipsis">{result.conversationTitle}</div>
                      <div className="shrink-0 text-xs text-tertiary">{result.role === 'user' ? t('用户') : t('AI')}</div>
                    </div>
                    <div className="text-xs text-muted flex items-center gap-0 flex-wrap">
                      <span>{historyTimeParts.absoluteText}</span>
                      {historyTimeParts.relativeText ? (
                        <span style={historyRelativeToneStyle}>({historyTimeParts.relativeText})</span>
                      ) : null}
                    </div>
                    <div className="text-sm text-secondary leading-[1.6] whitespace-pre-wrap break-words">{result.snippet}</div>
                  </button>
                  )
                })}
              </div>
            )
          ) : (
            <div className="min-h-[calc(100%-101px)] flex items-center justify-center p-5 text-center text-tertiary text-sm leading-[1.8]">
              {t('搜索全部对话中的消息')}
            </div>
          )}
        </div>
      )
    } else if (displayConversationList.length === 0) {
      content = (
        <div className="min-h-[calc(100%-53px)] flex items-center justify-center p-5 text-center text-tertiary text-sm leading-[1.8]">
          <div className="max-w-[80%] grid gap-0.5">
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
            className="w-full flex items-center border-b border-line transition-[color,background-color,border-color,opacity,box-shadow] duration-[120ms]"
            style={{
              background: selected ? 'rgba(var(--accent-rgb), 0.12)' : panelState.activeConversationId === item.id ? 'rgba(var(--accent-rgb), 0.08)' : 'transparent',
              borderLeft: panelState.activeConversationId === item.id ? '2px solid var(--accent)' : '2px solid transparent',
              opacity: item.archived === true ? 0.72 : 1,
              contentVisibility: 'auto',
              containIntrinsicSize: '56px',
              contain: 'layout paint style',
            }}
          >
            {conversationSelectionMode ? (
              <button
                type="button"
                aria-label={selected ? t('取消选择') : t('选择')}
                aria-pressed={selected}
                onClick={() => toggleConversationSelection(item.id)}
                className={cn(
                  'w-[34px] self-stretch inline-flex items-center justify-center border-0 bg-transparent cursor-pointer shrink-0',
                  'hover:text-accent hover:bg-[rgba(var(--accent-rgb),0.10)] focus-visible:text-accent focus-visible:bg-[rgba(var(--accent-rgb),0.10)]',
                  selected ? 'text-accent' : 'text-muted',
                )}>
                <span
                  className={cn(
                    'w-4 h-4 rounded-sm border inline-flex items-center justify-center text-xs text-white',
                  )}
                  style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)', background: selected ? 'var(--accent)' : 'transparent' }}
                >{selected ? '✓' : ''}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => conversationSelectionMode ? toggleConversationSelection(item.id) : void handleOpenConversation(item.id)}
              className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 border-0 bg-transparent text-left cursor-pointer"
            >
              <div className="flex-1 min-w-0 grid gap-0.5" style={{ paddingLeft: item.depth > 0 ? `${item.depth * 12}px` : 0 }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {isAgentSubtask ? (
                    <Tiptop text={t('子代理任务')} placement="top">
                      <span
                        aria-label={t('子代理任务')}
                        className={cn(
                          'w-[18px] h-[18px] inline-flex items-center justify-center rounded-full shrink-0 border',
                          isArchivedAgentSubtask
                            ? 'border-line bg-sunken text-tertiary'
                            : 'border-[rgba(var(--accent-rgb),0.22)] bg-[rgba(var(--accent-rgb),0.10)] text-accent',
                        )}
                      >
                        <Bot size={11} />
                      </span>
                    </Tiptop>
                  ) : null}
                  {isSummarySubtask ? (
                    <Tiptop text={t('摘要子任务')} placement="top">
                      <span
                        aria-label={t('摘要子任务')}
                        className="w-[18px] h-[18px] inline-flex items-center justify-center rounded-full border border-[rgba(var(--accent-rgb),0.22)] bg-[rgba(var(--accent-rgb),0.10)] text-accent shrink-0"
                      >
                        <Scissors size={11} />
                      </span>
                    </Tiptop>
                  ) : null}
                  {item.transient === true ? (
                    <span title={t('临时会话')} className="shrink-0 px-[5px] py-px rounded-sm bg-[rgba(var(--accent-rgb),0.12)] text-accent text-[10px] font-semibold">
                      {t('临时会话')}
                    </span>
                  ) : null}
                  <div className={cn(
                    'min-w-0 text-base leading-tight whitespace-nowrap overflow-hidden text-ellipsis',
                    isArchivedAgentSubtask ? 'text-secondary' : 'text-primary',
                    panelState.activeConversationId === item.id ? 'font-semibold' : 'font-medium',
                  )}>{displayTitle || item.title}</div>
                </div>
                <div className="flex items-center gap-0.5 min-w-0 flex-wrap">
                  <div className="text-xs text-tertiary whitespace-nowrap inline-flex items-center gap-0">
                    <span>{historyTimeParts.absoluteText}</span>
                    {historyTimeParts.relativeText ? (
                      <span style={historyRelativeToneStyle}>({historyTimeParts.relativeText})</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted whitespace-nowrap">·{item.messageCount}</div>
                </div>
              </div>
            </button>
            {!conversationSelectionMode ? <div className="flex items-center gap-1 mr-2.5 shrink-0">
              {item.transient === true ? (
                <button
                  type="button"
                  title={`${t('临时会话')} → ${t('保存')}`}
                  aria-label={`${t('临时会话')} → ${t('保存')}`}
                  onClick={() => void handleMakeConversationPermanent(item.id)}
                  className={cn(AI_ROW_ACTION_BASE, AI_ROW_ACTION_HOVER_ACCENT, 'text-accent')}
                >
                  <ArchiveRestore size={13} />
                </button>
              ) : null}
              {item.transient !== true ? (
              <button
                type="button"
                title={t('打开任务所在文件夹')}
                aria-label={t('打开任务所在文件夹')}
                onClick={() => void handleOpenConversationFolder(item.id)}
                className={cn(AI_ROW_ACTION_BASE, AI_ROW_ACTION_HOVER_ACCENT, 'text-muted')}
              >
                <FolderOpen size={13} />
              </button>
              ) : null}
              {item.transient !== true ? (
              <button
                type="button"
                title={t('编辑任务标题')}
                aria-label={t('编辑任务标题')}
                onClick={() => void handleRenameConversationTitle(item.id)}
                className={cn(AI_ROW_ACTION_BASE, AI_ROW_ACTION_HOVER_ACCENT, 'text-muted')}
              >
                <Pencil size={13} />
              </button>
              ) : null}
              <button
                type="button"
                title={t('删除')}
                aria-label={t('删除')}
                onClick={() => {
                  void handleDeleteConversation(item.id)
                }}
                className={cn(AI_ROW_ACTION_BASE, AI_ROW_ACTION_HOVER_DANGER, 'text-muted')}
              >
                ×
              </button>
            </div> : null}
          </div>
        )
      })
    }

    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-canvas">
        <div className="px-2.5 py-2 border-b border-line-subtle bg-raised sticky top-0 grid gap-2" style={{ zIndex: Z.STACK }}>
          <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-secondary">{conversationSelectionMode ? t('已选择 {count} 项').replace('{count}', String(selectedConversationIds.size)) : t('对话历史')}</div>
          <div className="flex items-center gap-1.5">
          <button type="button" title={conversationSelectionMode ? t('退出多选') : t('多选')} aria-label={conversationSelectionMode ? t('退出多选') : t('多选')} onClick={() => conversationSelectionMode ? clearConversationSelection() : setConversationSelectionMode(true)} className={cn(
            'w-7 h-7 inline-flex items-center justify-center rounded-md border cursor-pointer',
            conversationSelectionMode
              ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)] text-accent'
              : 'border-line-subtle bg-sunken text-tertiary',
          )}><CheckSquare size={14} /></button>
          <button type="button" title={t('新建分组')} aria-label={t('新建分组')} onClick={() => void handleCreateConversationGroup()} className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-line-subtle bg-sunken text-tertiary cursor-pointer"><FolderPlus size={14} /></button>
          <button
            type="button"
            title={t('全局搜索对话')}
            aria-label={t('全局搜索对话')}
            onClick={handleOpenGlobalSearch}
            className={cn(
              'w-7 h-7 inline-flex items-center justify-center rounded-md border cursor-pointer shrink-0 transition-[color,background-color,border-color,opacity] duration-[80ms]',
              globalSearchOpen
                ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)] text-accent'
                : 'border-line-subtle bg-sunken text-tertiary',
            )}
          >
            <Search size={14} />
          </button>
          </div>
          </div>
          <div role="tablist" aria-label={t('分组')} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] pb-px">
            <button role="tab" aria-selected={conversationFilter === 'all'} type="button" onClick={() => { setConversationFilter('all'); clearConversationSelection(); cancelRenameConversationGroup() }} onDoubleClick={showSystemGroupRenameUnsupported} className={cn(
              'h-[26px] px-[9px] rounded-md border text-xs whitespace-nowrap cursor-pointer shrink-0',
              conversationFilter === 'all'
                ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)] text-accent'
                : 'border-line-subtle bg-transparent text-secondary',
            )}>{t('全部')}</button>
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
                  className="h-[26px] px-2 rounded-md border border-accent-border bg-sunken text-primary text-xs outline-2 outline-[rgba(var(--accent-rgb),0.16)] shrink-0"
                  style={{ width: Math.max(72, Math.min(150, editingConversationGroupName.length * 12 + 24)) }}
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
                  className={cn(
                    'h-[26px] px-[9px] rounded-md border text-xs whitespace-nowrap shrink-0 transition-[color,background-color,border-color,opacity] duration-[80ms]',
                    dragOver
                      ? 'border-accent'
                      : selected
                        ? 'border-accent-border'
                        : 'border-line-subtle',
                    selected ? 'bg-[rgba(var(--accent-rgb),0.10)] text-accent' : 'bg-transparent text-secondary',
                  )}
                  style={{
                    cursor: dragging ? 'grabbing' : 'grab',
                    opacity: dragging ? 0.5 : 1,
                    transform: dragOver ? 'translateX(2px)' : 'none',
                  }}>
                  {group.name}
                </button>
              )
            })}
            <button role="tab" aria-selected={conversationFilter === 'archived'} type="button" onClick={() => { setConversationFilter('archived'); clearConversationSelection(); cancelRenameConversationGroup() }} onDoubleClick={showSystemGroupRenameUnsupported} className={cn(
              'h-[26px] px-[9px] rounded-md border text-xs whitespace-nowrap cursor-pointer shrink-0',
              conversationFilter === 'archived'
                ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)] text-accent'
                : 'border-line-subtle bg-transparent text-secondary',
            )}>{t('已归档')}</button>
          </div>
        </div>
        {content}
        {conversationSelectionMode && selectedConversationIds.size > 0 ? (
          <div className="sticky bottom-0 grid gap-1.5 p-2 border-t border-line bg-raised" style={{ zIndex: Z.STACK + 1 }}>
            {moveToGroupOpen ? (
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                <Button variant="ghost" size="sm" onClick={() => handleMoveSelectedConversations('')} className="shrink-0">{t('移出分组')}</Button>
                {conversationOrganizer.groups.map((group) => <Button key={group.id} variant="ghost" size="sm" onClick={() => handleMoveSelectedConversations(group.id)} className="shrink-0">{group.name}</Button>)}
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setMoveToGroupOpen((current) => !current)} className="flex-1">{t('移动到分组')}</Button>
              <Button variant="ghost" size="sm" onClick={() => void handleSetSelectedArchived(conversationFilter !== 'archived')} className="flex-1 gap-[5px]">{conversationFilter === 'archived' ? <ArchiveRestore size={13} /> : <Archive size={13} />}{conversationFilter === 'archived' ? t('恢复') : t('归档')}</Button>
              <Button variant="danger" size="sm" onClick={() => void handleDeleteSelectedConversations()} aria-label={t('删除')} className="w-[34px] p-0"><Trash2 size={13} /></Button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }, [beginRenameConversationGroup, cancelRenameConversationGroup, clearConversationSelection, commitRenameConversationGroup, conversationFilter, conversationList, conversationOrganizer, conversationSelectionMode, dragOverConversationGroupId, draggingConversationGroupId, editingConversationGroupId, editingConversationGroupName, getLanguage, globalSearchLoading, globalSearchOpen, globalSearchQuery, globalSearchResults, handleCreateConversationGroup, handleDeleteConversation, handleDeleteConversationGroup, handleDeleteSelectedConversations, handleMakeConversationPermanent, handleMoveSelectedConversations, handleOpenConversation, handleOpenConversationFolder, handleOpenGlobalSearch, handleSelectGlobalSearchResult, handleSetSelectedArchived, isDevilMode, moveToGroupOpen, normalizedGlobalSearchQuery, panelState.activeConversationId, reorderConversationGroup, resetGlobalSearchState, selectedConversationIds, showSystemGroupRenameUnsupported, t, toggleConversationSelection])

  return (
    <AIWorkspaceTabProvider value={{ sessionId: sessionId || '', terminalId: terminalId || '', tabId: workspaceTabId || '' }}>
      <div
        data-ai-panel-root="true"
      data-ai-devil-mode={isDevilMode ? 'true' : 'false'}
      style={{
        width,
        minWidth: width,
        height: '100%',
        minHeight: 0,
        background: isDevilMode ? 'rgba(10, 0, 2, 0.96)' : 'var(--surface-raised)',
        flexShrink: 0,
        borderRight: side === 'right' ? '1px solid var(--border)' : 'none',
        borderLeft: side === 'left' ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'var(--font-ai-panel)',
        ...(isDevilMode ? {
          '--surface-raised': 'rgba(17, 2, 4, 0.84)',
          '--surface-base': 'rgba(8, 1, 2, 0.90)',
          '--surface-overlay': 'rgba(18, 2, 4, 0.90)',
          '--surface-sunken': 'rgba(10, 1, 2, 0.96)',
          '--text-primary': '#fff5f5',
          '--text-secondary': 'rgba(255, 112, 112, 0.92)',
          '--text-tertiary': 'rgba(255, 82, 82, 0.72)',
          '--border': 'rgba(255, 68, 68, 0.22)',
          '--border-subtle': 'rgba(255, 56, 56, 0.16)',
          '--accent': '#ff3b3b',
          '--accent-rgb': '255, 59, 59',
          '--accent-border': 'rgba(255, 72, 72, 0.46)',
          backgroundImage: [
            'radial-gradient(circle at 50% 72%, rgba(140, 0, 20, 0.34) 0%, rgba(140, 0, 20, 0.12) 20%, transparent 46%)',
            'radial-gradient(circle at 50% 8%, rgba(255, 0, 51, 0.16) 0%, transparent 24%)',
            'radial-gradient(circle at 0% 0%, rgba(255, 0, 32, 0.12) 0%, transparent 18%)',
            'radial-gradient(circle at 100% 0%, rgba(255, 0, 32, 0.12) 0%, transparent 18%)',
            'repeating-linear-gradient(135deg, rgba(255, 0, 38, 0.035) 0 1px, transparent 1px 26px)',
            'linear-gradient(180deg, rgba(22, 0, 3, 0.96) 0%, rgba(8, 0, 1, 0.99) 100%)',
          ].join(', '),
          boxShadow: 'inset 0 0 0 1px rgba(255, 56, 56, 0.14), inset 0 0 60px rgba(255, 0, 38, 0.08)',
        } : {}),
      }}
    >
      {tasksDirMigrating ? (
        <div className="absolute inset-0 bg-[rgba(5,10,18,0.6)] backdrop-blur-[3px] flex flex-col items-center justify-center gap-3" style={{ zIndex: Z.SETTINGS }}>
          <Loader2 size={36} className="animate-[spin_1s_linear_infinite] text-accent" />
          <div className="text-md font-semibold text-primary">{t('正在迁移对话数据...')}</div>
          <div className="text-sm text-tertiary">{t('迁移期间请勿使用 AI 对话')}</div>
        </div>
      ) : null}
      <AIPanelHeader
        showSettingsPanel={showSettingsPanel}
        onToggleSettings={handleToggleSettingsPanel}
        onGoHome={handleGoHome}
        showModeToggle={canToggleAIMode}
        isDevilMode={isDevilMode}
        onToggleMode={handleToggleDevilMode}
        onOpenConversationSearch={handleOpenConversationSearch}
        onOpenConversationDiff={handleOpenConversationDiff}
        showConversationSearchButton={Boolean(activeConversation) && !isConversationLoading}
        showConversationDiffButton={Boolean(activeConversation) && !isConversationLoading}
        conversationSearchActive={conversationSearchOpen}
        showContextTokens={Boolean(activeConversation) && !isConversationLoading}
        contextTokens={panelState.contextTokens}
        apiMessageCount={Array.isArray(panelState.apiMessages) ? panelState.apiMessages.length : 0}
        isCondensingContext={Boolean(panelState.isCondensingContext)}
        canCondenseContext={canQuickCondenseConversation || canSummaryCondenseConversation}
        canQuickCondenseContext={canQuickCondenseConversation}
        canSummaryCondenseContext={canSummaryCondenseConversation}
        onCondenseContext={handleCondenseContext}
        onCondenseContextFullSummary={handleCondenseContextFullSummary}
        fullSummaryCondenseAvailable={true}
      />
      {tabBar}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div data-ai-chat-stage="true" className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
          {activeConversation || !isHomeView ? (
            <>
              {isThemeTuningConversation && !isConversationLoading ? (
                <div className="px-3 py-2 border-b border-accent-border bg-[rgba(var(--accent-rgb),0.08)] flex items-center justify-between gap-2.5">
                  <div className="text-sm text-secondary leading-normal">
                    {t('当前处于配色模式,对话记录不会保存')}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { void handleGoHome() }}
                    className="shrink-0"
                  >
                    {t('退出配色模式')}
                  </Button>
                </div>
              ) : null}
              {conversationSearchOpen ? (
                <div className="px-3 py-2 border-b border-line bg-raised grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
                  <input
                    id="ai-panel-main-conversation-search"
                    name="ai-panel-main-conversation-search"
                    autoComplete="off"
                    ref={conversationSearchInputRef}
                    value={conversationSearchQuery}
                    onChange={(event) => setConversationSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        resetConversationSearchState()
                        return
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleCycleConversationSearchResult(event.shiftKey ? -1 : 1)
                      }
                    }}
                    placeholder={t('输入关键词搜索当前对话')}
                    className="h-[34px] w-full rounded-lg border border-line bg-sunken text-primary px-2.5 box-border outline-none"
                  />
                  <div className="min-w-12 text-center text-sm text-tertiary tabular-nums">
                    {conversationSearchResults.length > 0 ? `${conversationSearchIndex + 1}/${conversationSearchResults.length}` : '0/0'}
                  </div>
                  <button
                    type="button"
                    title={t('上一个搜索结果')}
                    aria-label={t('上一个搜索结果')}
                    onClick={() => handleCycleConversationSearchResult(-1)}
                    disabled={conversationSearchResults.length === 0}
                    className={cn(
                      'w-[34px] h-[34px] inline-flex items-center justify-center rounded-lg border border-line bg-canvas',
                      conversationSearchResults.length > 0 ? 'text-primary cursor-pointer' : 'text-muted cursor-not-allowed',
                    )}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    title={t('下一个搜索结果')}
                    aria-label={t('下一个搜索结果')}
                    onClick={() => handleCycleConversationSearchResult(1)}
                    disabled={conversationSearchResults.length === 0}
                    className={cn(
                      'w-[34px] h-[34px] inline-flex items-center justify-center rounded-lg border border-line bg-canvas',
                      conversationSearchResults.length > 0 ? 'text-primary cursor-pointer' : 'text-muted cursor-not-allowed',
                    )}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    title={t('关闭搜索')}
                    aria-label={t('关闭搜索')}
                    onClick={resetConversationSearchState}
                    className="w-[34px] h-[34px] inline-flex items-center justify-center rounded-lg border border-line bg-canvas text-tertiary cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <AIChatConversation
                messages={isConversationLoading ? [] : panelState.messages}
                sessionId={sessionId}
                terminalId={terminalId}
                conversationId={isConversationLoading ? normalizedInitialConversationId || workspaceTabId : activeConversation?.id || workspaceTabId}
                tabId={workspaceTabId}
                onSendUserMessage={handleConversationUserMessage}
                onRetryUserMessage={handleRetryUserMessage}
                onRetryAssistantMessage={handleRetryAssistantMessage}
                onEditUserMessage={handleEditUserMessage}
                onDeleteMessage={handleDeleteMessage}
                onPreviewRestore={handlePreviewRestore}
                onPreviewDiffFetch={handlePreviewDiff}
                onApplyRestore={handleApplyRestore}
                followupInteractionLocked={collaborationFollowupInteractionLocked}
                messageActionBarAtBottom={messageActionBarAtBottom}
                messageNavEnabled={messageNavEnabled}
                side={side}
                scrollToBottomSignal={conversationScrollSignal}
                sendPerfMetricsRef={sendPerfMetricsRef}
                editingTargetMessageId={composerEditState.mode === 'edit' ? composerEditState.targetMessageId : ''}
              />
            </>
          ) : renderedConversationList}
          {showAssistantCollaborationActiveImage ? (
            <video
              src={assistantThinkingActiveImg}
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
              className="absolute right-[18px] bottom-0 w-[min(32%,180px)] min-w-[120px] max-w-[42vw] max-h-[280px] object-contain pointer-events-none select-none opacity-96 drop-shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
              style={{ zIndex: Z.STACK }}
            />
          ) : null}
        </div>
        {showComposer ? (
        <AIComposer
          onSend={handleComposerSendMessage}
          onCancel={handleCancelMessage}
          onStopAndResume={handleStopAndResumeMessage}
          conversationInputLocked={composerInteractionLocked}
          conversationInputLockedLabel={composerInteractionLockedLabel}
          isSending={isStreaming}
          currentProviderId={effectiveProviderId}
          onCurrentProviderChange={handleProviderChange}
          providerBalanceRefreshSignal={providerBalanceRefreshSignal}
          terminalSessionId={terminalId}
          queueBlocked={isQueueBlocked || panelState.isFlushingQueuedSubmission}
          queuedSubmissionKind={panelState.queuedSubmission?.kind || ''}
          collaborationLocked={collaborationLocked}
          collaborationActive={collaborationActive}
          collaborationMode={panelState.collaborationMode}
          collaborationStatus={collaborationActive ? {
            startedAtMs: panelState.collaborationStatusStartedAtMs,
            firstTokenAtMs: panelState.collaborationStatusFirstTokenAtMs,
            text: panelState.collaborationStatusText,
            reasoningText: panelState.collaborationStatusReasoningText,
          } : null}
          terminalAssignmentRequired={isAwaitingTerminalAssignment}
          toolResumeAvailable={toolResumeAvailable}
          onResumeTask={handleResumeTask}
          onListCommandTerminalCandidates={handleListCommandTerminalCandidates}
          onAssignToolTerminal={handleAssignToolTerminal}
          onCancelQueuedSubmission={handleCancelQueuedSubmission}
          skipNextAutomaticRequest={Boolean(panelState.skipNextAutomaticRequest)}
          onToggleSkipNextAutomaticRequest={handleToggleSkipNextAutomaticRequest}
          persistProviderSelection={shouldPersistProviderSelection}
          autoApprovalSettings={effectiveAutoApprovalSettings}
          onPatchAutoApprovalSettings={handlePatchAutoApprovalSettings}
          collaborationExtraPrompt={effectiveAutoApprovalSettings.collaborationExtraPrompt || ''}
          onCollaborationExtraPromptChange={handleCollaborationExtraPromptChange}
          collaborationPromptPresets={normalizedGlobalAISettings.collaborationPromptPresets}
          onCollaborationPromptPresetsChange={handleCollaborationPromptPresetsChange}
          collaborationPromptScopeIsTask={Boolean(activeConversation)}
          temporarySessionEnabled={temporarySessionEnabled}
          onTemporarySessionEnabledChange={setTemporarySessionEnabled}
          onInterruptCollaboration={handleInterruptCollaboration}
          approvalRequired={isAwaitingToolApproval}
          toolRunning={isToolRunning}
          commandActionRequired={isAwaitingCommandAction}
          onApproveTools={handleApproveTools}
          onRejectTools={handleRejectTools}
          onContinueTool={handleContinueTool}
          onTerminateTool={handleTerminateTool}
          approvalButtonOrder={approvalButtonOrder}
          commandActionButtonOrder={commandActionButtonOrder}
          inputValue={composerInputValue}
          onInputValueChange={setComposerInputValue}
          selectedImages={composerImages}
          onSelectedImagesChange={setComposerImages}
          editModeLabel={composerEditState.mode === 'edit' ? t('编辑消息后将从该消息起重建后续对话') : ''}
          slashCommands={normalizedGlobalAISettings.slashCommands}
          onCancelEdit={resetComposerEditState}
          dismissSignal={popupDismissVersion}
        />
        ) : null}
      </div>
      <AIPanelSettingsOverlay
        show={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        activeTab={activeSettingsTab}
        onChangeTab={setActiveSettingsTab}
        mcpInfo={mcpInfo}
        configText={configText}
        configRows={configRows}
        globalAISettings={normalizedGlobalAISettings}
        onSaveGlobalAISettings={handleSaveAIPanelGlobalSettings}
        aiTerminalIsolation={normalizedGlobalAISettings.terminalIsolation}
        onToggleAiTerminalIsolation={handleToggleAiTerminalIsolation}
        confirmDelete={normalizedGlobalAISettings.confirmDelete}
        onToggleConfirmDelete={handleToggleConfirmDelete}
        activeConversationId={activeConversation?.id || ''}
        conversationUpdatedAt={activeConversation?.updatedAt || 0}
        backupRequestInFlight={panelState.requestPhase !== 'idle' || runtimePhase !== 'ready'}
        onRestoreConversationBackup={handleRestoreConversationBackup}
        autoBackupEnabled={normalizedGlobalAISettings.conversationAutoBackupEnabled !== false}
        onToggleAutoBackup={() => handleSaveAIPanelGlobalSettings({
          conversationAutoBackupEnabled: !normalizedGlobalAISettings.conversationAutoBackupEnabled,
        })}
        soundEnabled={normalizedGlobalAISettings.soundEnabled !== false}
        soundVolume={normalizedGlobalAISettings.soundVolume ?? 0.06}
        terminalOutputLineLimit={terminalOutputLineLimit}
        onTerminalOutputLineLimitChange={handleTerminalOutputLineLimitChange}
        terminalOutputCharacterLimit={terminalOutputCharacterLimit}
        onTerminalOutputCharacterLimitChange={handleTerminalOutputCharacterLimitChange}
        mcpClientServers={mcpClientServers}
        mcpClientGlobalConfigPath={mcpClientGlobalConfigPath}
        mcpClientGlobalConfigText={mcpClientGlobalConfigText}
        onSaveMCPGlobalServer={handleSaveMCPGlobalServer}
        onReloadMCPGlobalServers={handleReloadMCPGlobalServers}
        onDeleteMCPGlobalServer={handleDeleteMCPGlobalServer}
        onRestartMCPClientServer={handleRestartMCPClientServer}
        onToggleMCPClientServer={handleToggleMCPClientServer}
        onToggleMCPClientServerDisabledForPrompts={handleToggleMCPClientServerDisabledForPrompts}
        onUpdateMCPClientServerTimeout={handleUpdateMCPClientServerTimeout}
        onMigratingChange={setTasksDirMigrating}
      />
      </div>
    </AIWorkspaceTabProvider>
  )
}

export default function AIPanel({ width, side, sessionId, terminalId, sessionTerminals = [], isPanelVisible = true, onDevilModeChange, onActiveTabChange, onActivateWorkspaceTab, addToast }: AIPanelProps) {
  const { t } = useTranslation()
  const [tabGroup, setTabGroup] = useState<AIWorkspaceTabGroup>(() => getAIWorkspaceTabGroup(terminalId))
  const [tabRequestIds, setTabRequestIds] = useState<Record<string, string>>({})
  const [aiWorkspaceTabOverflow, setAIWorkspaceTabOverflow] = useState(false)
  const [aiWorkspaceTabCanScrollLeft, setAIWorkspaceTabCanScrollLeft] = useState(false)
  const [aiWorkspaceTabCanScrollRight, setAIWorkspaceTabCanScrollRight] = useState(false)
  const tabGroupRef = useRef(tabGroup)
  const tabRequestIdsRef = useRef<Record<string, string>>({})
  const aiWorkspaceTabRuntimeRef = useRef<Record<string, { conversationId: string; activeRequestId: string }>>({})
  const aiWorkspaceTabScrollRef = useRef<HTMLDivElement | null>(null)
  const aiWorkspaceTabCloseLockRef = useRef<{ tabId: string; confirmed: boolean; lastInteractionAt: number } | undefined>(undefined)
  const aiWorkspaceTabCloseUnlockTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    tabGroupRef.current = tabGroup
  }, [tabGroup])
  useEffect(() => subscribeAIWorkspaceTabGroup(terminalId, setTabGroup), [terminalId])
  useEffect(() => {
    const tabIds = new Set(tabGroup.tabs.map((tab) => tab.id))
    const nextRuntime: Record<string, { conversationId: string; activeRequestId: string }> = {}
    tabIds.forEach((tabId) => {
      const runtime = aiWorkspaceTabRuntimeRef.current[tabId]
      if (runtime) {
        nextRuntime[tabId] = runtime
      }
    })
    aiWorkspaceTabRuntimeRef.current = nextRuntime
    setTabRequestIds((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([tabId]) => tabIds.has(tabId)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [tabGroup.tabs])
  useEffect(() => {
    onActiveTabChange?.(tabGroup.activeTabId)
  }, [onActiveTabChange, tabGroup.activeTabId])
  const updateTabGroup = useCallback((updater: (current: AIWorkspaceTabGroup) => AIWorkspaceTabGroup) => {
    return setAIWorkspaceTabGroup(terminalId, updater)
  }, [terminalId])
  const flushAIWorkspaceTabPendingLocation = useCallback((tabId: string) => {
    const pendingLocation = getAIWorkspaceTabPendingLocation(terminalId, tabId)
    const runtime = aiWorkspaceTabRuntimeRef.current[tabId]
    const tab = getAIWorkspaceTabGroup(terminalId).tabs.find((item) => item.id === tabId)
    if (
      !pendingLocation
      || !runtime
      || runtime.conversationId !== pendingLocation.conversationId
      || tab?.conversationId !== pendingLocation.conversationId
      || typeof window === 'undefined'
    ) {
      return
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const currentPendingLocation = getAIWorkspaceTabPendingLocation(terminalId, tabId)
        const currentRuntime = aiWorkspaceTabRuntimeRef.current[tabId]
        const currentTab = getAIWorkspaceTabGroup(terminalId).tabs.find((item) => item.id === tabId)
        if (
          currentPendingLocation?.conversationId !== pendingLocation.conversationId
          || currentPendingLocation?.messageId !== pendingLocation.messageId
          || !currentRuntime
          || currentRuntime.conversationId !== pendingLocation.conversationId
          || currentTab?.conversationId !== pendingLocation.conversationId
        ) {
          return
        }
        clearAIWorkspaceTabPendingLocation(terminalId, tabId)
        window.dispatchEvent(new CustomEvent('ai-conversation-diff-locate', {
          detail: {
            sessionId,
            terminalId,
            tabId,
            messageId: pendingLocation.messageId,
          },
        }))
      })
    })
  }, [sessionId, terminalId])
  const queueAIWorkspaceTabLocation = useCallback((targetTerminalId: string, tabId: string, conversationId: string, messageId: string) => {
    const normalizedMessageId = typeof messageId === 'string' ? messageId.trim() : ''
    if (!targetTerminalId || !tabId || !conversationId || !normalizedMessageId) {
      return
    }
    setAIWorkspaceTabPendingLocation(targetTerminalId, tabId, {
      conversationId,
      messageId: normalizedMessageId,
    })
    if (targetTerminalId === terminalId) {
      flushAIWorkspaceTabPendingLocation(tabId)
    }
  }, [flushAIWorkspaceTabPendingLocation, terminalId])
  useEffect(() => {
    tabGroup.tabs.forEach((tab) => flushAIWorkspaceTabPendingLocation(tab.id))
  }, [flushAIWorkspaceTabPendingLocation, tabGroup.tabs])
  const clearAIWorkspaceTabCloseUnlockTimer = useCallback(() => {
    if (aiWorkspaceTabCloseUnlockTimerRef.current !== undefined) {
      window.clearTimeout(aiWorkspaceTabCloseUnlockTimerRef.current)
      aiWorkspaceTabCloseUnlockTimerRef.current = undefined
    }
  }, [])
  const scheduleAIWorkspaceTabCloseUnlock = useCallback(() => {
    clearAIWorkspaceTabCloseUnlockTimer()
    const schedule = () => {
      const closeLock = aiWorkspaceTabCloseLockRef.current
      if (!closeLock?.confirmed) {
        return
      }
      const remainingDelay = Math.max(0, AI_WORKSPACE_TAB_CLOSE_QUIET_MS - (Date.now() - closeLock.lastInteractionAt))
      aiWorkspaceTabCloseUnlockTimerRef.current = window.setTimeout(() => {
        aiWorkspaceTabCloseUnlockTimerRef.current = undefined
        const currentCloseLock = aiWorkspaceTabCloseLockRef.current
        if (!currentCloseLock?.confirmed) {
          return
        }
        if (Date.now() - currentCloseLock.lastInteractionAt < AI_WORKSPACE_TAB_CLOSE_QUIET_MS) {
          schedule()
          return
        }
        aiWorkspaceTabCloseLockRef.current = undefined
      }, remainingDelay)
    }
    schedule()
  }, [clearAIWorkspaceTabCloseUnlockTimer])
  const suppressAIWorkspaceTabCloseInteraction = useCallback((event: React.SyntheticEvent) => {
    const closeLock = aiWorkspaceTabCloseLockRef.current
    if (!closeLock) {
      return
    }
    closeLock.lastInteractionAt = Date.now()
    event.preventDefault()
    event.stopPropagation()
    scheduleAIWorkspaceTabCloseUnlock()
  }, [scheduleAIWorkspaceTabCloseUnlock])
  const syncAIWorkspaceTabScrollState = useCallback(() => {
    const element = aiWorkspaceTabScrollRef.current
    if (!element) {
      setAIWorkspaceTabOverflow(false)
      setAIWorkspaceTabCanScrollLeft(false)
      setAIWorkspaceTabCanScrollRight(false)
      return
    }
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth)
    const hasOverflow = maxScrollLeft > 1
    setAIWorkspaceTabOverflow(hasOverflow)
    setAIWorkspaceTabCanScrollLeft(hasOverflow && element.scrollLeft > 1)
    setAIWorkspaceTabCanScrollRight(hasOverflow && element.scrollLeft < maxScrollLeft - 1)
  }, [])
  const scrollActiveAIWorkspaceTabIntoView = useCallback((tabId: string) => {
    const element = aiWorkspaceTabScrollRef.current
    if (!element || !tabId) {
      return
    }
    const tabElement = Array.from(element.querySelectorAll<HTMLElement>('[data-ai-workspace-tab-id]'))
      .find((item) => item.dataset.aiWorkspaceTabId === tabId)
    if (!tabElement) {
      return
    }
    const scrollRect = element.getBoundingClientRect()
    const tabRect = tabElement.getBoundingClientRect()
    const edgePadding = 6
    const delta = tabRect.left < scrollRect.left + edgePadding
      ? tabRect.left - scrollRect.left - edgePadding
      : tabRect.right > scrollRect.right - edgePadding
        ? tabRect.right - scrollRect.right + edgePadding
        : 0
    if (delta) {
      element.scrollBy({ left: delta, behavior: 'smooth' })
    }
  }, [])
  const scrollAIWorkspaceTabs = useCallback((direction: number) => {
    const element = aiWorkspaceTabScrollRef.current
    if (!element) {
      return
    }
    const step = Math.max(96, Math.round(element.clientWidth * 0.45))
    element.scrollBy({ left: step * direction, behavior: 'smooth' })
  }, [])
  const handleAIWorkspaceTabScroll = useCallback(() => {
    syncAIWorkspaceTabScrollState()
  }, [syncAIWorkspaceTabScrollState])
  const handleAIWorkspaceTabWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const element = aiWorkspaceTabScrollRef.current
    if (!element || element.scrollWidth <= element.clientWidth) {
      return
    }
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) {
      return
    }
    element.scrollBy({ left: delta, behavior: 'auto' })
    event.preventDefault()
  }, [])
  useEffect(() => {
    if (tabGroup.tabs.length > 0) {
      if (!tabGroup.tabs.some((tab) => tab.id === tabGroup.activeTabId)) {
        updateTabGroup((current) => ({
          ...current,
          activeTabId: current.tabs[0]?.id || '',
        }))
      }
      return
    }
    const tabId = createAIWorkspaceTabId()
    updateTabGroup((current) => (
      current.tabs.length > 0
        ? current
        : {
            activeTabId: tabId,
            tabs: [{ id: tabId, conversationId: '', title: t('新对话'), transient: false }],
          }
    ))
  }, [t, tabGroup.activeTabId, tabGroup.tabs, updateTabGroup])
  useEffect(() => {
    const closeLock = aiWorkspaceTabCloseLockRef.current
    if (!closeLock || tabGroup.tabs.some((tab) => tab.id === closeLock.tabId)) {
      return
    }
    closeLock.confirmed = true
    scheduleAIWorkspaceTabCloseUnlock()
  }, [scheduleAIWorkspaceTabCloseUnlock, tabGroup.tabs])
  useEffect(() => () => clearAIWorkspaceTabCloseUnlockTimer(), [clearAIWorkspaceTabCloseUnlockTimer])
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      scrollActiveAIWorkspaceTabIntoView(tabGroup.activeTabId)
      syncAIWorkspaceTabScrollState()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [scrollActiveAIWorkspaceTabIntoView, syncAIWorkspaceTabScrollState, tabGroup.activeTabId, tabGroup.tabs])
  useEffect(() => {
    const element = aiWorkspaceTabScrollRef.current
    if (!element) {
      return undefined
    }
    const handleResize = () => {
      scrollActiveAIWorkspaceTabIntoView(tabGroup.activeTabId)
      syncAIWorkspaceTabScrollState()
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(handleResize) : null
    observer?.observe(element)
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [scrollActiveAIWorkspaceTabIntoView, syncAIWorkspaceTabScrollState, tabGroup.activeTabId])
  const dismissTabPanels = useCallback((tabId: string) => {
    if (typeof window === 'undefined' || !tabId) {
      return
    }
    window.dispatchEvent(new CustomEvent('ai-change-review-clear', {
      detail: { sessionId: terminalId, tabId },
    }))
    window.dispatchEvent(new CustomEvent('ai-conversation-diff-close', {
      detail: { sessionId, terminalId, tabId },
    }))
  }, [sessionId, terminalId])
  const createWorkspaceTab = useCallback(() => {
    const tabId = createAIWorkspaceTabId()
    updateTabGroup((current) => ({
      activeTabId: tabId,
      tabs: [...current.tabs, { id: tabId, conversationId: '', title: t('新对话'), transient: false }],
    }))
    return tabId
  }, [t, updateTabGroup])
  const returnWorkspaceTabHome = useCallback((tabId: string) => {
    updateTabGroup((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.id === tabId
          ? { ...tab, conversationId: '', title: t('新对话'), transient: false }
          : tab
      )),
    }))
  }, [t, updateTabGroup])
  const activateWorkspaceTab = useCallback((tabId: string) => {
    updateTabGroup((current) => (
      current.tabs.some((tab) => tab.id === tabId)
        ? { ...current, activeTabId: tabId }
        : current
    ))
  }, [updateTabGroup])
  const closeWorkspaceTab = useCallback((tabId: string) => {
    const current = tabGroupRef.current
    const tabIndex = current.tabs.findIndex((tab) => tab.id === tabId)
    if (tabIndex < 0 || current.tabs.length <= 1) {
      return
    }
    const requestId = tabRequestIdsRef.current[tabId]
    delete tabRequestIdsRef.current[tabId]
    delete aiWorkspaceTabRuntimeRef.current[tabId]
    clearAIWorkspaceTabPendingLocation(terminalId, tabId)
    setTabRequestIds((currentRequests) => {
      if (!currentRequests[tabId]) {
        return currentRequests
      }
      const nextRequests = { ...currentRequests }
      delete nextRequests[tabId]
      return nextRequests
    })
    if (requestId) {
      void cancelAIChat(requestId)
    }
    dismissTabPanels(tabId)
    updateTabGroup((group) => {
      const index = group.tabs.findIndex((tab) => tab.id === tabId)
      if (index < 0) {
        return group
      }
      const tabs = group.tabs.filter((tab) => tab.id !== tabId)
      const activeTabId = group.activeTabId === tabId
        ? (tabs[Math.max(0, index - 1)]?.id || '')
        : group.activeTabId
      return { activeTabId, tabs }
    })
  }, [dismissTabPanels, updateTabGroup])
  const forkWorkspaceTabConversation = useCallback(async (sourceConversationId: string, sourceTabId: string, openInNewTab: boolean) => {
    const normalizedSourceId = typeof sourceConversationId === 'string' ? sourceConversationId.trim() : ''
    if (!normalizedSourceId) {
      return
    }
    let forkedId = ''
    try {
      const snapshot = await getAIConversation(normalizedSourceId)
      if (!snapshot?.id) {
        return
      }
      const baseTitle = typeof snapshot.title === 'string' && snapshot.title.trim() ? snapshot.title.trim() : t('新对话')
      const now = Date.now()
      const forkedSnapshot = await saveAIConversation({
        ...snapshot,
        id: '',
        title: `${baseTitle} - ${t('副本')}`,
        parentConversationId: '',
        rootConversationId: '',
        relationType: '',
        relationSource: '',
        parentTitleSnapshot: '',
        archived: false,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
      })
      forkedId = typeof forkedSnapshot?.id === 'string' ? forkedSnapshot.id.trim() : ''
    } catch {
      return
    }
    if (!forkedId) {
      return
    }
    if (openInNewTab) {
      const newTabId = createAIWorkspaceTabId()
      updateTabGroup((current) => ({
        activeTabId: newTabId,
        tabs: [...current.tabs, { id: newTabId, conversationId: forkedId, title: '' }],
      }))
      return
    }
    const normalizedSourceTabId = typeof sourceTabId === 'string' ? sourceTabId.trim() : ''
    updateTabGroup((current) => {
      if (!normalizedSourceTabId || !current.tabs.some((tab) => tab.id === normalizedSourceTabId)) {
        const newTabId = createAIWorkspaceTabId()
        return {
          activeTabId: newTabId,
          tabs: [...current.tabs, { id: newTabId, conversationId: forkedId, title: '' }],
        }
      }
      return {
        activeTabId: normalizedSourceTabId,
        tabs: current.tabs.map((tab) => (
          tab.id === normalizedSourceTabId
            ? { ...tab, conversationId: forkedId, title: '' }
            : tab
        )),
      }
    })
  }, [t, updateTabGroup])
  const openConversationInWorkspaceTab = useCallback(async (conversationId: string, messageId = '') => {
    const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : ''
    if (!normalizedConversationId) {
      return
    }
    const existing = findAIWorkspaceConversationTab(normalizedConversationId)
    if (existing) {
      queueAIWorkspaceTabLocation(existing.terminalId, existing.tabId, normalizedConversationId, messageId)
      if (existing.terminalId !== terminalId) {
        setAIWorkspaceTabGroup(existing.terminalId, (current) => ({
          ...current,
          activeTabId: existing.tabId,
        }))
        onActivateWorkspaceTab?.(existing.terminalId, existing.tabId)
        return
      }
      activateWorkspaceTab(existing.tabId)
      return
    }
    const activeTabId = tabGroupRef.current.activeTabId
    const activeTabExists = tabGroupRef.current.tabs.some((tab) => tab.id === activeTabId)
    const activeRequestId = activeTabExists
      ? (tabRequestIdsRef.current[activeTabId] || tabRequestIds[activeTabId] || '')
      : ''
    const tabId = activeTabExists && !activeRequestId ? activeTabId : createAIWorkspaceTabId()
    updateTabGroup((current) => ({
      activeTabId: tabId,
      tabs: current.tabs.some((tab) => tab.id === tabId)
        ? current.tabs.map((tab) => (
            tab.id === tabId
              ? { ...tab, conversationId: normalizedConversationId, title: '', transient: false }
              : tab
          ))
        : [...current.tabs, {
            id: tabId,
            conversationId: normalizedConversationId,
            title: '',
            transient: false,
          }],
    }))
    queueAIWorkspaceTabLocation(terminalId, tabId, normalizedConversationId, messageId)
  }, [activateWorkspaceTab, onActivateWorkspaceTab, queueAIWorkspaceTabLocation, tabRequestIds, terminalId, updateTabGroup])
  const handleWorkspaceTabStateChange = useCallback((tabId: string, state: { conversationId: string; title: string; activeRequestId: string; transient: boolean }) => {
    const conversationId = state.transient ? '' : state.conversationId
    aiWorkspaceTabRuntimeRef.current[tabId] = {
      conversationId,
      activeRequestId: state.activeRequestId,
    }
    if (state.activeRequestId) {
      tabRequestIdsRef.current[tabId] = state.activeRequestId
    } else {
      delete tabRequestIdsRef.current[tabId]
    }
    setTabRequestIds((currentRequests) => {
      const currentRequestId = currentRequests[tabId] || ''
      if (currentRequestId === state.activeRequestId) {
        return currentRequests
      }
      if (!state.activeRequestId) {
        const nextRequests = { ...currentRequests }
        delete nextRequests[tabId]
        return nextRequests
      }
      return {
        ...currentRequests,
        [tabId]: state.activeRequestId,
      }
    })
    const title = state.transient ? (state.title || t('临时会话')) : (conversationId ? state.title : t('新对话'))
    const currentTab = tabGroupRef.current.tabs.find((tab) => tab.id === tabId)
    flushAIWorkspaceTabPendingLocation(tabId)
    if (!currentTab || (currentTab.conversationId === conversationId && currentTab.title === title && currentTab.transient === state.transient)) {
      return
    }
    updateTabGroup((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.id === tabId
          ? { ...tab, conversationId, title, transient: state.transient }
          : tab
      )),
    }))
  }, [flushAIWorkspaceTabPendingLocation, t, updateTabGroup])
  useEffect(() => subscribeAIConversationChanges((change: unknown) => {
    const detail = change && typeof change === 'object' ? change as Record<string, unknown> : null
    const conversationId = typeof detail?.conversationId === 'string' ? detail.conversationId.trim() : ''
    if (detail?.type !== 'delete' || !conversationId) {
      return
    }
    const affectedTabs = tabGroupRef.current.tabs.filter((tab) => tab.conversationId === conversationId)
    affectedTabs.forEach((tab) => {
      const requestId = tabRequestIdsRef.current[tab.id]
      delete tabRequestIdsRef.current[tab.id]
      delete aiWorkspaceTabRuntimeRef.current[tab.id]
      clearAIWorkspaceTabPendingLocation(terminalId, tab.id)
      if (requestId) {
        void cancelAIChat(requestId)
      }
      dismissTabPanels(tab.id)
    })
    if (affectedTabs.length === 0) {
      return
    }
    const affectedTabIds = new Set(affectedTabs.map((tab) => tab.id))
    setTabRequestIds((currentRequests) => Object.fromEntries(
      Object.entries(currentRequests).filter(([tabId]) => !affectedTabIds.has(tabId)),
    ))
    updateTabGroup((current) => {
      const tabs = current.tabs.filter((tab) => !affectedTabIds.has(tab.id))
      return {
        activeTabId: affectedTabIds.has(current.activeTabId) ? (tabs[0]?.id || '') : current.activeTabId,
        tabs,
      }
    })
  }), [dismissTabPanels, updateTabGroup])
  const activeTabId = tabGroup.activeTabId
  const taskTabBar = (
    <div
      data-ai-workspace-tab-bar="true"
      onClickCapture={suppressAIWorkspaceTabCloseInteraction}
      onDoubleClickCapture={suppressAIWorkspaceTabCloseInteraction}
      className="h-10 flex items-stretch gap-0 pt-1 px-1.5 border-b border-line bg-canvas shrink-0 overflow-hidden">
      {aiWorkspaceTabOverflow ? (
        <button
          type="button"
          className={`terminal-sub-tab-nav terminal-sub-tab-nav-left${aiWorkspaceTabCanScrollLeft ? '' : ' disabled'}`}
          onClick={() => scrollAIWorkspaceTabs(-1)}
          aria-label={t('向左滚动标签')}
          title={t('向左滚动标签')}
          disabled={!aiWorkspaceTabCanScrollLeft}>
          <ChevronLeft size={14} />
        </button>
      ) : null}
      <div
        ref={aiWorkspaceTabScrollRef}
        className="terminal-sub-tab-scroll"
        onWheel={handleAIWorkspaceTabWheel}
        onScroll={handleAIWorkspaceTabScroll}>
        {tabGroup.tabs.map((tab: AIWorkspaceTab, index) => {
          const active = tab.id === activeTabId
          const running = Boolean(tabRequestIds[tab.id])
          const transient = tab.transient === true
          const tabTitle = tab.title || t('新对话')
          const tabLabel = `${index + 1}. ${tabTitle}${transient ? ` · ${t('临时会话')}` : ''}`
          return (
            <div
              key={tab.id}
              data-ai-workspace-tab-id={tab.id}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const canCloseTab = tabGroupRef.current.tabs.length > 1
                const tabConversationId = typeof tab.conversationId === 'string' ? tab.conversationId.trim() : ''
                openGlobalContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  estimatedWidth: 188,
                  estimatedHeight: 120,
                  items: [
                    {
                      key: 'close-workspace-tab',
                      label: translate('关闭此选项卡'),
                      disabled: !canCloseTab,
                      onSelect: () => closeWorkspaceTab(tab.id),
                    },
                    {
                      key: 'fork-workspace-tab-conversation',
                      label: translate('分叉此选项卡任务'),
                      disabled: !tabConversationId,
                      children: [
                        {
                          key: 'fork-workspace-tab-conversation-new-tab',
                          label: translate('分叉到新标签页'),
                          disabled: !tabConversationId,
                          onSelect: () => {
                            void forkWorkspaceTabConversation(tabConversationId, tab.id, true)
                          },
                        },
                        {
                          key: 'fork-workspace-tab-conversation-current-tab',
                          label: translate('分叉到当前标签页'),
                          disabled: !tabConversationId,
                          onSelect: () => {
                            void forkWorkspaceTabConversation(tabConversationId, tab.id, false)
                          },
                        },
                      ],
                    },
                    {
                      key: 'delete-workspace-tab-conversation',
                      label: translate('删除此选项卡中任务'),
                      danger: true,
                      disabled: !tabConversationId,
                      onSelect: () => {
                        if (typeof window === 'undefined') {
                          return
                        }
                        window.dispatchEvent(new CustomEvent('ai-workspace-tab-delete-conversation', {
                          detail: { sessionId, terminalId, tabId: tab.id, conversationId: tabConversationId },
                        }))
                      },
                    },
                  ],
                })
              }}
              className={cn(
                'shrink-0 basis-auto w-44 min-w-[132px] max-w-[220px] flex items-center rounded-t-lg -mb-px border',
                active ? 'border-line border-b-raised bg-raised' : 'border-transparent',
              )}>
              <Tiptop text={tabLabel} placement="bottom" style={{ display: 'flex', height: '100%', minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  onClick={() => activateWorkspaceTab(tab.id)}
                  onDoubleClick={(event) => {
                    if (tabGroupRef.current.tabs.length <= 1 || aiWorkspaceTabCloseLockRef.current) {
                      return
                    }
                    event.preventDefault()
                    event.stopPropagation()
                    clearAIWorkspaceTabCloseUnlockTimer()
                    aiWorkspaceTabCloseLockRef.current = {
                      tabId: tab.id,
                      confirmed: false,
                      lastInteractionAt: Date.now(),
                    }
                    closeWorkspaceTab(tab.id)
                  }}
                  aria-label={tabLabel}
                  className={cn(
                    'min-w-0 grow basis-auto h-full flex items-center justify-start gap-[7px] pl-2.5 pr-2 border-0 relative bg-transparent cursor-pointer text-sm tabular-nums',
                    active ? 'text-primary font-bold' : 'text-secondary font-medium',
                  )}>
                  {running ? <span aria-label={t('执行中')} className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" /> : null}
                  <span className="text-muted tabular-nums shrink-0">{index + 1}</span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tabTitle}</span>
                  {transient ? (
                    <span title={t('临时会话')} className="shrink-0 px-[5px] py-px rounded-sm bg-[rgba(var(--accent-rgb),0.12)] text-accent text-[10px] font-semibold">
                      {t('临时会话')}
                    </span>
                  ) : null}
                </button>
              </Tiptop>
              {tabGroup.tabs.length > 1 ? (
                <button
                  type="button"
                  aria-label={`${t('关闭')} ${tabTitle}`}
                  title={t('关闭')}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    closeWorkspaceTab(tab.id)
                  }}
                  className="w-6 h-6 mr-1 p-0 border-0 rounded-sm bg-transparent text-muted cursor-pointer shrink-0 text-lg leading-none">
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {aiWorkspaceTabOverflow ? (
        <button
          type="button"
          className={`terminal-sub-tab-nav terminal-sub-tab-nav-right${aiWorkspaceTabCanScrollRight ? '' : ' disabled'}`}
          onClick={() => scrollAIWorkspaceTabs(1)}
          aria-label={t('向右滚动标签')}
          title={t('向右滚动标签')}
          disabled={!aiWorkspaceTabCanScrollRight}>
          <ChevronRight size={14} />
        </button>
      ) : null}
      <button
        type="button"
        title={t('新对话')}
        aria-label={t('新对话')}
        onClick={createWorkspaceTab}
        className="w-[30px] border-0 border-b-2 border-b-transparent bg-transparent text-secondary cursor-pointer text-[18px] shrink-0">
        +
      </button>
    </div>
  )
  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden relative" style={{ width, minWidth: width }}>
      {tabGroup.tabs.map((tab) => (
        <div key={tab.id} className="absolute inset-0" style={{ display: activeTabId === tab.id ? 'flex' : 'none' }}>
          <AIConversationTabPanel
            width="100%"
            side={side}
            sessionId={sessionId}
            terminalId={terminalId}
            sessionTerminals={sessionTerminals}
            workspaceTabId={tab.id}
            isHomeView={tab.conversationId === ''}
            isWorkspaceTabActive={isPanelVisible && activeTabId === tab.id}
            initialConversationId={tab.conversationId}
            tabBar={taskTabBar}
            onDevilModeChange={isPanelVisible && activeTabId === tab.id ? (enabled) => onDevilModeChange?.(enabled, tab.id) : undefined}
            onGoHomeRequested={() => returnWorkspaceTabHome(tab.id)}
            onOpenConversationRequested={openConversationInWorkspaceTab}
            onWorkspaceTabStateChange={handleWorkspaceTabStateChange}
            addToast={addToast}
          />
        </div>
      ))}
    </div>
  )
}
