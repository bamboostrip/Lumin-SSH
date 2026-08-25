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
  const [aiProviderState, setAIProviderState] = useState<AIProviderState>({ currentProviderId: '', providers: [] })
  const [isDevilMode, setIsDevilMode] = useState(false)
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([])
  const [conversationOrganizer, setConversationOrganizer] = useState<AIConversationOrganizerState>(() => loadAIConversationOrganizer())
  const [conversationFilter, setConversationFilter] = useState('all')
  const [conversationSelectionMode, setConversationSelectionMode] = useState(false)
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(() => new Set())
  const [moveToGroupOpen, setMoveToGroupOpen] = useState(false)
  const [editingConversationGroupId, setEditingConversationGroupId] = useState('')
  const [editingConversationGroupName, setEditingConversationGroupName] = useState('')
  const [draggingConversationGroupId, setDraggingConversationGroupId] = useState('')
  const [dragOverConversationGroupId, setDragOverConversationGroupId] = useState('')
  const conversationGroupRenameInputRef = useRef<HTMLInputElement | null>(null)
  const conversationGroupRenameCancelledRef = useRef(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const [globalSearchResults, setGlobalSearchResults] = useState<AIConversationMessageSearchResult[]>([])
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [conversationSearchIndex, setConversationSearchIndex] = useState(0)
  const globalSearchRequestRef = useRef(0)
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null)
  const conversationSearchInputRef = useRef<HTMLInputElement | null>(null)
  const resetGlobalSearchState = useCallback(() => {
    setGlobalSearchOpen(false)
    setGlobalSearchQuery('')
    setGlobalSearchLoading(false)
    setGlobalSearchResults([])
  }, [])

  const resetConversationSearchState = useCallback(() => {
    setConversationSearchOpen(false)
    setConversationSearchQuery('')
    setConversationSearchIndex(0)
  }, [])

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

  const refreshAIHomeData = useCallback(async () => {
    void getAIGlobalSettings()
      .then((value) => {
        if (!panelMountedRef.current) {
          return
        }
        setGlobalAISettings(value)
      })
      .catch(() => {
        if (!panelMountedRef.current) {
          return
        }
        setGlobalAISettings(null)
      })
    void getAIProviderState()
      .then((value) => {
        if (!panelMountedRef.current) {
          return
        }
        setAIProviderState(value)
      })
      .catch(() => {
        if (!panelMountedRef.current) {
          return
        }
        setAIProviderState({ currentProviderId: '', providers: [] })
      })
    void refreshMCPServerInfo()
    void refreshMCPOutputCompressionSettings()
    try {
      const conversations = await listAIConversations()
      if (!panelMountedRef.current) {
        return
      }
      const temporarySummaries = await listTemporaryAIConversationsFromDisk().catch(() => [])
      seedTemporaryAIConversations(temporarySummaries)
      setConversationList([...temporarySummaries.map((summary) => ({ ...summary, transient: true })), ...(Array.isArray(conversations) ? conversations : [])])
    } catch {
      if (!panelMountedRef.current) {
        return
      }
      const temporarySummaries = await listTemporaryAIConversationsFromDisk().catch(() => [])
      seedTemporaryAIConversations(temporarySummaries)
      setConversationList(temporarySummaries.map((summary) => ({ ...summary, transient: true })))
    }
  }, [refreshMCPOutputCompressionSettings, refreshMCPServerInfo])

  useEffect(() => {
    const syncTemporaryConversations = () => {
      setConversationList((current) => [...listInMemoryTemporaryAIConversations(), ...current.filter((item) => item.transient !== true)])
    }
    window.addEventListener(TEMPORARY_AI_CONVERSATIONS_CHANGED_EVENT, syncTemporaryConversations)
    return () => window.removeEventListener(TEMPORARY_AI_CONVERSATIONS_CHANGED_EVENT, syncTemporaryConversations)
  }, [])






  const terminalLabelMap = useMemo(() => {
    const map = new Map()
    ;(Array.isArray(sessionTerminals) ? sessionTerminals : []).forEach((terminal) => {
      const nextTerminalId = typeof terminal?.id === 'string' ? terminal.id.trim() : ''
      if (!nextTerminalId) {
        return
      }
      const nextLabel = typeof terminal?.label === 'string' && terminal.label.trim() ? terminal.label.trim() : nextTerminalId
      map.set(nextTerminalId, nextLabel)
    })
    return map
  }, [sessionTerminals])
  const enrichAIChatCommandMessage = useCallback((message: AIMessage) => {
    if (!message || typeof message !== 'object' || message.kind !== 'command') {
      return message
    }
    const nextExtra = message.extra && typeof message.extra === 'object' ? { ...message.extra } : {}
    const targetSessionId = typeof nextExtra.targetSessionId === 'string' && nextExtra.targetSessionId.trim()
      ? nextExtra.targetSessionId.trim()
      : ''
    if (targetSessionId) {
      nextExtra.targetLabel = terminalLabelMap.get(targetSessionId) || targetSessionId
    }
    return Object.keys(nextExtra).length > 0
      ? { ...message, extra: nextExtra }
      : message
  }, [terminalLabelMap])
  const selectedAIProvider = useMemo(() => {
    const currentProviderId = typeof aiProviderState?.currentProviderId === 'string' ? aiProviderState.currentProviderId.trim() : ''
    if (!currentProviderId) {
      return null
    }
    return (Array.isArray(aiProviderState?.providers) ? aiProviderState.providers : []).find((item) => item?.id === currentProviderId) || null
  }, [aiProviderState])
  const availableAIProviders = useMemo(
    () => (Array.isArray(aiProviderState?.providers) ? aiProviderState.providers : []),
    [aiProviderState],
  )
  const canToggleAIMode = useMemo(() => isCallMyVipProviderHost(selectedAIProvider?.baseUrl), [selectedAIProvider])
  useEffect(() => {
    if (!canToggleAIMode) {
      setIsDevilMode(false)
    }
  }, [canToggleAIMode])
  useEffect(() => {
    onDevilModeChange?.(canToggleAIMode ? isDevilMode : false)
  }, [canToggleAIMode, isDevilMode, onDevilModeChange])
  const handleToggleDevilMode = useCallback(async () => {
    if (isDevilMode) {
      setIsDevilMode(false)
      return
    }
    try {
      const tokenGroup = await getAIProviderTokenGroup(selectedAIProvider || {})
      const normalizedTokenGroup = typeof tokenGroup === 'string' ? tokenGroup.replace(/\s+/g, '') : ''
      if (!normalizedTokenGroup.includes('支持破限')) {
        addToast?.(t('当前供应商渠道不支持恶魔模式'), 'warning', 2400)
        return
      }
      setIsDevilMode(true)
    } catch (error) {
      const errorText = error instanceof Error ? error.message.trim() : ''
      if (errorText === t('Token 分组查询能力未就绪')) {
        addToast?.(errorText, 'warning', 2400)
        return
      }
      addToast?.(t('当前Token分组校验失败,无法进入恶魔模式'), 'warning', 2400)
    }
  }, [addToast, isDevilMode, selectedAIProvider, t])
  const resolveFirstAvailableProviderId = useCallback((providers: AIProviderLike[] = []) => {
    return typeof providers[0]?.id === 'string' ? providers[0].id.trim() : ''
  }, [])
  const resolveAvailableProviderId = useCallback((providers: AIProviderLike[] = [], preferredProviderId = '') => {
    const normalizedPreferredProviderId = typeof preferredProviderId === 'string' ? preferredProviderId.trim() : ''
    if (normalizedPreferredProviderId && providers.some((item) => item?.id === normalizedPreferredProviderId)) {
      return normalizedPreferredProviderId
    }
    return resolveFirstAvailableProviderId(providers)
  }, [resolveFirstAvailableProviderId])
  const buildConversationWithProviderId = useCallback((snapshot: AIConversationSnapshot, providerId: string) => {
    if (!snapshot || typeof snapshot !== 'object') {
      return snapshot
    }
    const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : ''
    const rawSettings = snapshot.settings && typeof snapshot.settings === 'object' ? snapshot.settings as Record<string, unknown> : null
    const currentProviderId = typeof rawSettings?.currentProviderId === 'string' ? rawSettings.currentProviderId.trim() : ''
    if (currentProviderId === normalizedProviderId) {
      return snapshot
    }
    return {
      ...snapshot,
      updatedAt: Date.now(),
      settings: normalizeAIConversationTaskSettings({
        ...(rawSettings || {}),
        currentProviderId: normalizedProviderId,
      }),
    }
  }, [])
  const effectiveProviderId = selectedAIProvider?.id || resolveAvailableProviderId(
    availableAIProviders,
    typeof aiProviderState?.currentProviderId === 'string' ? aiProviderState.currentProviderId.trim() : '',
  )
  const resolveAIRequestModelMeta = useCallback((providerId = '', providers: AIProviderLike[] | null = null) => {
    const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : ''
    const sourceProviders = Array.isArray(providers) ? providers : (Array.isArray(aiProviderState?.providers) ? aiProviderState.providers : [])
    const matchedProvider = normalizedProviderId
      ? sourceProviders.find((item) => item?.id === normalizedProviderId) || null
      : null
    return buildAIRequestModelMeta(matchedProvider)
  }, [aiProviderState])
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
  const normalizedGlobalSearchQuery = useMemo(() => normalizeAIConversationSearchQuery(globalSearchQuery), [globalSearchQuery])
  const normalizedConversationSearchQuery = useMemo(() => normalizeAIConversationSearchQuery(conversationSearchQuery), [conversationSearchQuery])
  const conversationSearchResults = useMemo(() => {
    if (!activeConversation || !normalizedConversationSearchQuery) {
      return []
    }
    const normalizedNeedle = normalizedConversationSearchQuery.toLowerCase()
    return (Array.isArray(panelState.messages) ? panelState.messages : []).flatMap((message) => {
      const body = extractAIConversationSearchText(message)
      if (!body || !body.toLowerCase().includes(normalizedNeedle)) {
        return []
      }
      return [normalizeAIConversationMessageSearchResult({
        conversationId: activeConversation.id,
        conversationTitle: activeConversation.title,
        messageId: message.id,
        role: message.kind === 'user' ? 'user' : 'assistant',
        snippet: buildAIConversationSearchSnippet(body, normalizedConversationSearchQuery),
        updatedAt: activeConversation.updatedAt,
      })]
    })
  }, [activeConversation, normalizedConversationSearchQuery, panelState.messages])

  useEffect(() => {
    if (!globalSearchOpen || !globalSearchInputRef.current) {
      return
    }
    globalSearchInputRef.current.focus()
    globalSearchInputRef.current.select()
  }, [globalSearchOpen])

  useEffect(() => {
    if (!conversationSearchOpen || !conversationSearchInputRef.current) {
      return
    }
    conversationSearchInputRef.current.focus()
    conversationSearchInputRef.current.select()
  }, [conversationSearchOpen])

  useEffect(() => {
    if (!conversationSearchOpen) {
      return
    }
    if (conversationSearchResults.length === 0) {
      setConversationSearchIndex(0)
      return
    }
    setConversationSearchIndex((current) => (current >= conversationSearchResults.length ? 0 : current))
  }, [conversationSearchOpen, conversationSearchResults.length])

  useEffect(() => {
    if (!conversationSearchOpen || !normalizedConversationSearchQuery || conversationSearchResults.length === 0) {
      return
    }
    const activeResult = conversationSearchResults[conversationSearchIndex] || conversationSearchResults[0]
    if (!activeResult?.messageId || typeof window === 'undefined') {
      return
    }
    window.dispatchEvent(new CustomEvent('ai-conversation-diff-locate', {
      detail: {
        sessionId: sessionId || '',
        terminalId: terminalId || '',
        tabId: workspaceTabId,
        messageId: activeResult.messageId,
      },
    }))
  }, [conversationSearchIndex, conversationSearchOpen, conversationSearchResults, normalizedConversationSearchQuery, sessionId, terminalId])

  useEffect(() => {
    if (!globalSearchOpen) {
      setGlobalSearchLoading(false)
      setGlobalSearchResults([])
      return
    }
    if (!normalizedGlobalSearchQuery) {
      setGlobalSearchLoading(false)
      setGlobalSearchResults([])
      return
    }
    const requestId = globalSearchRequestRef.current + 1
    globalSearchRequestRef.current = requestId
    setGlobalSearchLoading(true)
    const timer = window.setTimeout(() => {
      searchAIConversationMessages(normalizedGlobalSearchQuery, '', 50)
        .then((results) => {
          if (!panelMountedRef.current || globalSearchRequestRef.current !== requestId) {
            return
          }
          setGlobalSearchResults(results)
        })
        .catch(() => {
          if (!panelMountedRef.current || globalSearchRequestRef.current !== requestId) {
            return
          }
          setGlobalSearchResults([])
        })
        .finally(() => {
          if (!panelMountedRef.current || globalSearchRequestRef.current !== requestId) {
            return
          }
          setGlobalSearchLoading(false)
        })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [globalSearchOpen, normalizedGlobalSearchQuery])





  useEffect(() => {
    void refreshAIHomeData()
  }, [refreshAIHomeData])


  useEffect(() => subscribeAIConversationChanges((change: unknown) => {
    const rawChange = change && typeof change === 'object' ? change as Record<string, unknown> : null
    if (!rawChange) {
      return
    }
    const summary = rawChange.summary as AIConversationSnapshot | null | undefined
    if (rawChange.type === 'upsert' && summary?.id) {
      deletedConversationIdsRef.current.delete(summary.id)
      setConversationList((current) => upsertConversationSummary(current, summary))
      setPanelState(panelInstanceKey, (current) => (
        current.activeConversationId === summary.id && current.conversation
          ? {
              ...current,
              conversation: {
                ...current.conversation,
                ...summary,
                messages: current.messages,
                apiMessages: current.apiMessages,
              },
            }
          : current
      ))
      return
    }
    const conversationId = typeof rawChange.conversationId === 'string' ? rawChange.conversationId.trim() : ''
    if (rawChange.type !== 'delete' || !conversationId) {
      return
    }
    deletedConversationIdsRef.current.add(conversationId)
    setConversationList((current) => current.filter((item) => item.id !== conversationId))
    const panel = terminalPanelsRef.current[panelInstanceKey]
    if (panel?.activeConversationId !== conversationId) {
      return
    }
    const requestId = panel.activeRequestId
    setPanelState(panelInstanceKey, createEmptyPanelState())
    setThemeToolPreview(null)
    clearRestorePreview()
    resetComposerEditState()
    resetGlobalSearchState()
    resetConversationSearchState()
    if (requestId) {
      void cancelAIChat(requestId)
    }
  }), [clearRestorePreview, panelInstanceKey, resetComposerEditState, resetConversationSearchState, resetGlobalSearchState, setPanelState])




  const conversationDiffItems = useMemo(() => {
    const sourceMessages = Array.isArray(panelState.messages) ? panelState.messages : []
    const collected = sourceMessages.flatMap((message, index) => {
      if (!message || typeof message !== 'object' || message.kind !== 'tool') {
        return []
      }
      const toolName = typeof message.actionLabel === 'string' ? message.actionLabel.trim() : ''
      const status = normalizeAIMessageStatus(message.status)
      const artifactPath = typeof message?.extra?.restoreArtifactPath === 'string' ? message.extra.restoreArtifactPath.trim() : ''
      const hasPreview = message?.extra?.conversationDiffHasPreview === true
      if (!AI_CONVERSATION_DIFF_TOOL_NAMES.has(toolName) || !AI_CONVERSATION_DIFF_SUCCESS_STATUSES.has(status) || !artifactPath || !hasPreview) {
        return []
      }
      const copyContent = typeof message?.extra?.copyContent === 'string' ? message.extra.copyContent : ''
      const summaryText = typeof message.summary === 'string' ? message.summary.trim() : ''
      const primaryPath = typeof message?.extra?.conversationDiffPrimaryPath === 'string' ? message.extra.conversationDiffPrimaryPath.trim() : ''
      const fileCountRaw = Number(message?.extra?.conversationDiffFileCount)
      const fileCount = Number.isFinite(fileCountRaw) && fileCountRaw > 0 ? Math.trunc(fileCountRaw) : 0
      const title = primaryPath
        ? fileCount > 1
          ? translate('{path} 等 {count} 个文件', { path: primaryPath, count: fileCount })
          : primaryPath
        : extractAIConversationDiffPrimaryPath(copyContent, summaryText)
      return [{
        id: typeof message.id === 'string' && message.id.trim() ? message.id.trim() : `conversation-diff-${index}`,
        messageId: typeof message.id === 'string' && message.id.trim() ? message.id.trim() : '',
        artifactPath,
        toolName,
        title,
        summary: summaryText,
        status,
        copyContent,
        order: index,
      }]
    })
    return collected
      .reverse()
      .map((item, index) => ({
        ...item,
        order: index + 1,
      }))
  }, [panelState.messages])

  const handleOpenConversationDiff = useCallback(() => {
    if (typeof window === 'undefined' || conversationDiffItems.length === 0) {
      return
    }
    window.dispatchEvent(new CustomEvent('ai-conversation-diff-open', {
      detail: {
        sessionId: sessionId || terminalId || '',
        terminalId: terminalId || '',
        tabId: workspaceTabId,
        items: conversationDiffItems,
      },
    }))
  }, [conversationDiffItems, sessionId, terminalId, workspaceTabId])

  const handleGoHome = useCallback(async () => {
    conversationLoadRequestRef.current += 1
    setPendingConversationId('')
    isReturningHomeRef.current = true
    onGoHomeRequested?.()
    if (typeof window !== 'undefined') {
      if (terminalId) {
        window.dispatchEvent(new CustomEvent('ai-change-review-clear', {
          detail: { sessionId: terminalId, tabId: workspaceTabId },
        }))
      }
      window.dispatchEvent(new CustomEvent('ai-conversation-diff-close', {
        detail: {
          sessionId: sessionId || '',
          terminalId: terminalId || '',
          tabId: workspaceTabId,
        },
      }))
    }
    setThemeToolPreview(null)
    clearRestorePreview()
    setShowSettingsPanel(false)
    setPopupDismissVersion((current) => current + 1)
    resetComposerEditState()
    resetGlobalSearchState()
    resetConversationSearchState()
    const previousPanel = terminalPanelsRef.current[panelInstanceKey]
    const previousRequestId = previousPanel?.activeRequestId || ''
    const previousConversation = previousPanel?.conversation
    const persistCurrentConversation = previousConversation?.transient === true && !deletedConversationIdsRef.current.has(previousConversation.id)
      ? (() => {
          const assistantMessageId = previousPanel?.activeAssistantMessageId || previousRequestId
          const messages = (Array.isArray(previousPanel?.messages) ? previousPanel.messages : []).filter((message) => (
            !(
              (message.id === assistantMessageId || message.id === `${assistantMessageId}-reasoning`)
              && (message.kind === 'assistant' || message.kind === 'reasoning')
            )
          ))
          return saveTemporaryAIConversation({
            ...previousConversation,
            updatedAt: Date.now(),
            status: 'idle',
            messages,
            apiMessages: Array.isArray(previousPanel?.apiMessages) ? previousPanel.apiMessages : [],
          }).then((saved) => { upsertTemporaryAIConversation(saved); return saved })
        })()
      : previousConversation && !deletedConversationIdsRef.current.has(previousConversation.id)
      ? (() => {
          const assistantMessageId = previousPanel?.activeAssistantMessageId || previousRequestId
          const messages = (Array.isArray(previousPanel?.messages) ? previousPanel.messages : []).filter((message) => (
            !(
              (message.id === assistantMessageId || message.id === `${assistantMessageId}-reasoning`)
              && (message.kind === 'assistant' || message.kind === 'reasoning')
            )
          ))
          return saveAIConversation({
            ...previousConversation,
            updatedAt: Date.now(),
            status: 'idle',
            messages,
            apiMessages: Array.isArray(previousPanel?.apiMessages) ? previousPanel.apiMessages : [],
          }).catch(() => {})
        })()
      : Promise.resolve()
    setPanelState(panelInstanceKey, (current) => ({
      ...current,
      activeConversationId: '',
      conversation: null,
      messages: [],
      apiMessages: [],
      activeRequestId: '',
      activeAssistantMessageId: '',
      activeToolExecution: null,
      toolApprovalMode: '',
      requestPhase: 'idle',
      runtimePhase: 'ready',
      queuedSubmission: null,
      isFlushingQueuedSubmission: false,
      skipNextAutomaticRequest: false,
      resumeAfterCancelRequestId: '',
      recoverableToolStopReason: '',
      contextTokens: 0,
      isCondensingContext: false,
      activeChangeReview: null,
      collaborationLocked: false,
      collaborationActive: false,
      collaborationMode: '',
      collaborationStreamBuffer: '',
      collaborationAwaitingManualFollowup: false,
      collaborationFollowupRequestId: '',
    }))
    if (previousRequestId) {
      try {
        await cancelAIChat(previousRequestId)
      } catch {}
    }
    await persistCurrentConversation
    await refreshAIHomeData()
  }, [clearRestorePreview, onGoHomeRequested, panelInstanceKey, refreshAIHomeData, resetComposerEditState, sessionId, setPanelState, terminalId, workspaceTabId])

  const handleOpenConversation = useCallback(async (conversationId: string, delegateToWorkspace = true) => {
    const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : ''
    if (!normalizedConversationId) {
      return
    }
    const temporarySummary = getTemporaryAIConversationSummary(normalizedConversationId)
    if (!temporarySummary && delegateToWorkspace && onOpenConversationRequested) {
      await onOpenConversationRequested(conversationId)
      return
    }
    const requestToken = conversationLoadRequestRef.current + 1
    conversationLoadRequestRef.current = requestToken
    setPendingConversationId(normalizedConversationId)
    setThemeToolPreview(null)
    clearRestorePreview()
    resetComposerEditState()
    resetGlobalSearchState()
    resetConversationSearchState()
    try {
      const snapshot = temporarySummary ? await getTemporaryAIConversation(normalizedConversationId) : await getAIConversation(normalizedConversationId)
      if (!panelMountedRef.current || conversationLoadRequestRef.current !== requestToken) {
        return
      }
      const latestProviderState = await getAIProviderState().catch(() => ({
        currentProviderId: typeof aiProviderState?.currentProviderId === 'string' ? aiProviderState.currentProviderId.trim() : '',
        providers: availableAIProviders,
      }))
      if (!panelMountedRef.current || conversationLoadRequestRef.current !== requestToken) {
        return
      }
      const latestProviders = Array.isArray(latestProviderState?.providers) ? latestProviderState.providers : []
      const snapshotSettings = snapshot?.settings && typeof snapshot.settings === 'object' ? snapshot.settings as Record<string, unknown> : null
      const resolvedProviderId = resolveAvailableProviderId(latestProviders, typeof snapshotSettings?.currentProviderId === 'string' ? snapshotSettings.currentProviderId : '')
      const nextSnapshot = buildConversationWithProviderId(snapshot, resolvedProviderId)
      setAIProviderState({
        currentProviderId: resolvedProviderId,
        providers: latestProviders,
      })
      setConversationList((prev) => upsertConversationSummary(prev, nextSnapshot))
      setPanelState(panelInstanceKey, {
        activeConversationId: nextSnapshot.id,
        conversation: nextSnapshot,
        messages: nextSnapshot.messages,
        apiMessages: nextSnapshot.apiMessages,
        activeRequestId: '',
        activeAssistantMessageId: '',
        activeToolExecution: null,
        toolApprovalMode: '',
        requestPhase: 'idle',
        runtimePhase: 'ready',
        queuedSubmission: null,
        isFlushingQueuedSubmission: false,
        skipNextAutomaticRequest: false,
        resumeAfterCancelRequestId: '',
        recoverableToolStopReason: '',
        ...computeAILastAssistantTurnState(nextSnapshot.messages),
        contextTokens: 0,
        isCondensingContext: false,
        activeChangeReview: null,
        collaborationLocked: false,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
      })
      if (nextSnapshot !== snapshot) {
        await saveConversationSnapshot(nextSnapshot, panelInstanceKey)
        return
      }
      void rebuildAIConversationTokenLedger(nextSnapshot, panelInstanceKey)
    } catch {
    } finally {
      if (conversationLoadRequestRef.current === requestToken) {
        setPendingConversationId('')
      }
    }
  }, [aiProviderState, availableAIProviders, buildConversationWithProviderId, onOpenConversationRequested, panelInstanceKey, rebuildAIConversationTokenLedger, resetComposerEditState, resolveAvailableProviderId, saveConversationSnapshot, setPanelState])

  useEffect(() => {
    const normalizedConversationId = initialConversationId.trim()
    if (
      !isWorkspaceTabActive
      || !normalizedConversationId
      || pendingConversationId === normalizedConversationId
      || panelState.activeConversationId === normalizedConversationId
    ) {
      return
    }
    void handleOpenConversation(normalizedConversationId, false)
  }, [handleOpenConversation, initialConversationId, isWorkspaceTabActive, panelState.activeConversationId, pendingConversationId])

  const handleRestoreConversationBackup = useCallback(async (snapshot: unknown) => {
    const rawSnapshot = snapshot && typeof snapshot === 'object' ? snapshot as AIConversationSnapshot : null
    if (!rawSnapshot?.id) {
      return
    }
    setThemeToolPreview(null)
    clearRestorePreview()
    resetComposerEditState()
    resetGlobalSearchState()
    resetConversationSearchState()
    setConversationList((prev) => upsertConversationSummary(prev, rawSnapshot))
    setPanelState(panelInstanceKey, {
      activeConversationId: rawSnapshot.id,
      conversation: rawSnapshot,
      messages: rawSnapshot.messages,
      apiMessages: rawSnapshot.apiMessages,
      activeRequestId: '',
      activeAssistantMessageId: '',
      activeToolExecution: null,
      toolApprovalMode: '',
      requestPhase: 'idle',
      runtimePhase: 'ready',
      queuedSubmission: null,
      isFlushingQueuedSubmission: false,
      skipNextAutomaticRequest: false,
      resumeAfterCancelRequestId: '',
      recoverableToolStopReason: '',
      ...computeAILastAssistantTurnState(rawSnapshot.messages),
      contextTokens: 0,
      isCondensingContext: false,
      activeChangeReview: null,
      collaborationLocked: false,
      collaborationActive: false,
      collaborationMode: '',
      collaborationStreamBuffer: '',
      collaborationAwaitingManualFollowup: false,
      collaborationFollowupRequestId: '',
    })
    // 恢复备份: 全量重建账本 (100% 可靠)
    void rebuildAIConversationTokenLedger(rawSnapshot, panelInstanceKey)
  }, [panelInstanceKey, rebuildAIConversationTokenLedger, resetComposerEditState, setPanelState])

  const handleOpenConversationFolder = useCallback(async (conversationId: string) => {
    try {
      await openAIConversationFolder(conversationId)
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t('打开任务所在文件夹失败')
      await showAlert(message)
    }
  }, [showAlert, t])

  const handleRenameConversationTitle = useCallback(async (targetConversationId = '') => {
    const normalizedTargetConversationId = typeof targetConversationId === 'string' ? targetConversationId.trim() : ''
    let conversationToRename = activeConversation
    if (!conversationToRename || (normalizedTargetConversationId && conversationToRename.id !== normalizedTargetConversationId)) {
      if (!normalizedTargetConversationId) {
        return
      }
      try {
        conversationToRename = await getAIConversation(normalizedTargetConversationId)
      } catch {
        return
      }
    }
    if (!conversationToRename || conversationToRename.transient === true) {
      return
    }
    const currentTitle = typeof conversationToRename.title === 'string' ? conversationToRename.title.trim() : ''
    const nextTitle = window?.luminDialog?.prompt
      ? await window.luminDialog.prompt(
          t('请输入任务标题'),
          currentTitle,
          t('编辑任务标题'),
          '',
          {
            validate: (value) => (String(value || '').trim() ? '' : t('任务标题不能为空')),
          },
        )
      : window.prompt(t('请输入任务标题'), currentTitle)
    if (nextTitle === null || nextTitle === undefined) {
      return
    }
    const trimmedTitle = String(nextTitle).trim()
    if (!trimmedTitle || trimmedTitle === currentTitle) {
      return
    }
    const nextConversation = {
      ...conversationToRename,
      title: trimmedTitle,
      updatedAt: Date.now(),
    }
    if (activeConversation?.id === nextConversation.id) {
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        conversation: nextConversation,
      }))
    }
    await saveConversationSnapshot(nextConversation, panelInstanceKey)
    addToast?.(t('任务标题已更新'), 'success')
  }, [activeConversation, addToast, panelInstanceKey, saveConversationSnapshot, setPanelState, t])

  const locateConversationMessage = useCallback((messageId: string) => {
    const normalizedMessageId = typeof messageId === 'string' ? messageId.trim() : ''
    if (!normalizedMessageId || typeof window === 'undefined') {
      return
    }
    window.dispatchEvent(new CustomEvent('ai-conversation-diff-locate', {
      detail: {
        sessionId: sessionId || '',
        terminalId: terminalId || '',
        tabId: workspaceTabId,
        messageId: normalizedMessageId,
      },
    }))
  }, [sessionId, terminalId, workspaceTabId])

  const handleOpenGlobalSearch = useCallback(() => {
    setGlobalSearchOpen((current) => {
      const next = !current
      if (!next) {
        setGlobalSearchQuery('')
        setGlobalSearchLoading(false)
        setGlobalSearchResults([])
      }
      return next
    })
  }, [])

  const handleOpenConversationSearch = useCallback(() => {
    setConversationSearchOpen((current) => {
      const next = !current
      if (!next) {
        setConversationSearchQuery('')
        setConversationSearchIndex(0)
      }
      return next
    })
  }, [])

  const handleCycleConversationSearchResult = useCallback((direction: number) => {
    if (conversationSearchResults.length === 0) {
      return
    }
    setConversationSearchIndex((current) => {
      const total = conversationSearchResults.length
      return (current + direction + total) % total
    })
  }, [conversationSearchResults.length])

  const handleSelectGlobalSearchResult = useCallback(async (result: AIConversationMessageSearchResult) => {
    const conversationId = typeof result?.conversationId === 'string' ? result.conversationId.trim() : ''
    const messageId = typeof result?.messageId === 'string' ? result.messageId.trim() : ''
    if (!conversationId || !messageId) {
      return
    }
    if (onOpenConversationRequested) {
      await onOpenConversationRequested(conversationId, messageId)
      return
    }
    if (conversationId !== panelState.activeConversationId) {
      await handleOpenConversation(conversationId)
    } else {
      resetGlobalSearchState()
    }
    window.setTimeout(() => {
      locateConversationMessage(messageId)
    }, 40)
  }, [handleOpenConversation, locateConversationMessage, onOpenConversationRequested, panelState.activeConversationId, resetGlobalSearchState])

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    const deletingActiveConversation = panelState.activeConversationId === conversationId
    if (deletingActiveConversation) {
      setThemeToolPreview(null)
    }
    clearRestorePreview()
    const confirmed = await requestDeleteConfirmation(t('确定删除这条对话吗？此操作不可撤销。'))
    if (!confirmed) {
      return
    }
    const removedTemporaryConversation = removeTemporaryAIConversation(conversationId)
    if (removedTemporaryConversation) await deleteTemporaryAIConversation(conversationId)
    else await deleteAIConversation(conversationId)
    // 登记已删除 ID：拦截仍在途的并发保存，防止临时会话文件复活
    deletedConversationIdsRef.current.add(conversationId)
    tokenLedgerRef.current.delete(conversationId)
    setComposerEditState((current) => (
      current.mode !== 'new' && deletingActiveConversation
        ? { mode: 'new', targetMessageId: '', targetMessageText: '' }
        : current
    ))
    if (deletingActiveConversation) {
      await handleGoHome()
      return
    }
    const refreshedConversations = await listAIConversations().catch(() => [])
    setConversationList([...listInMemoryTemporaryAIConversations(), ...(Array.isArray(refreshedConversations) ? refreshedConversations : [])])
    const currentActiveConversationId = typeof terminalPanelsRef.current?.[panelInstanceKey]?.activeConversationId === 'string'
      ? terminalPanelsRef.current[panelInstanceKey].activeConversationId.trim()
      : ''
    if (currentActiveConversationId && currentActiveConversationId !== conversationId && refreshedConversations.some((item) => item?.id === currentActiveConversationId)) {
      await handleOpenConversation(currentActiveConversationId)
    }
  }, [clearRestorePreview, handleGoHome, handleOpenConversation, panelInstanceKey, panelState.activeConversationId, requestDeleteConfirmation, t])

  const persistConversationOrganizer = useCallback((updater: (current: AIConversationOrganizerState) => AIConversationOrganizerState) => {
    setConversationOrganizer((current) => saveAIConversationOrganizer(updater(current)))
  }, [])

  const handleMakeConversationPermanent = useCallback(async (conversationId: string) => {
    const temporarySummary = getTemporaryAIConversationSummary(conversationId)
    if (!temporarySummary) return
    let createdConversationId = ''
    try {
      const temporarySnapshot = await getTemporaryAIConversation(conversationId)
      const created = await createAIConversation(temporarySnapshot.title || t('新对话'))
      createdConversationId = created.id
      const permanentSnapshot = await saveAIConversation({
        ...temporarySnapshot,
        id: created.id,
        createdAt: created.createdAt,
        updatedAt: Date.now(),
        transient: false,
        status: 'idle',
      })
      removeTemporaryAIConversation(conversationId)
      persistConversationOrganizer((current) => {
        const assignments = { ...current.assignments }
        if (assignments[conversationId]) assignments[permanentSnapshot.id] = assignments[conversationId]
        delete assignments[conversationId]
        return { ...current, assignments }
      })
      setConversationList((current) => upsertConversationSummary(current.filter((item) => item.id !== conversationId), permanentSnapshot))
      addToast?.(`${t('临时会话')} · ${t('保存')}`, 'success')
      await handleOpenConversation(permanentSnapshot.id)
    } catch {
      if (createdConversationId) await deleteAIConversation(createdConversationId).catch(() => {})
      addToast?.(t('保存失败'), 'error')
    }
  }, [addToast, handleOpenConversation, persistConversationOrganizer, t])

  const handleCreateConversationGroup = useCallback(async () => {
    const name = window?.luminDialog?.prompt
      ? await window.luminDialog.prompt(t('请输入分组名称'), '', t('新建分组'))
      : window.prompt(t('请输入分组名称'))
    const normalizedName = typeof name === 'string' ? name.trim() : ''
    if (!normalizedName) return
    const group = createAIConversationGroup(normalizedName)
    persistConversationOrganizer((current) => ({ ...current, groups: [...current.groups, group] }))
    setConversationFilter(group.id)
  }, [persistConversationOrganizer, t])

  const beginRenameConversationGroup = useCallback((groupId: string) => {
    const group = conversationOrganizer.groups.find((item) => item.id === groupId)
    if (!group) return
    setConversationFilter(groupId)
    conversationGroupRenameCancelledRef.current = false
    setEditingConversationGroupId(groupId)
    setEditingConversationGroupName(group.name)
    window.requestAnimationFrame(() => {
      conversationGroupRenameInputRef.current?.focus()
      conversationGroupRenameInputRef.current?.select()
    })
  }, [conversationOrganizer.groups])

  const cancelRenameConversationGroup = useCallback(() => {
    conversationGroupRenameCancelledRef.current = true
    setEditingConversationGroupId('')
    setEditingConversationGroupName('')
  }, [])

  const commitRenameConversationGroup = useCallback(() => {
    if (conversationGroupRenameCancelledRef.current) {
      conversationGroupRenameCancelledRef.current = false
      setEditingConversationGroupId('')
      setEditingConversationGroupName('')
      return
    }
    const groupId = editingConversationGroupId
    const normalizedName = editingConversationGroupName.trim()
    if (groupId && normalizedName) {
      persistConversationOrganizer((current) => ({ ...current, groups: current.groups.map((item) => item.id === groupId ? { ...item, name: normalizedName } : item) }))
    }
    setEditingConversationGroupId('')
    setEditingConversationGroupName('')
  }, [editingConversationGroupId, editingConversationGroupName, persistConversationOrganizer])

  const reorderConversationGroup = useCallback((sourceGroupId: string, targetGroupId: string) => {
    if (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) return
    persistConversationOrganizer((current) => {
      const sourceIndex = current.groups.findIndex((group) => group.id === sourceGroupId)
      const targetIndex = current.groups.findIndex((group) => group.id === targetGroupId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const groups = [...current.groups]
      const [moved] = groups.splice(sourceIndex, 1)
      groups.splice(targetIndex, 0, moved)
      return { ...current, groups }
    })
  }, [persistConversationOrganizer])

  const showSystemGroupRenameUnsupported = useCallback(() => {
    const message = t('系统分组不支持重命名')
    if (typeof addToast === 'function') {
      addToast(message, 'info', 2200)
      return
    }
    void showAlert(message)
  }, [addToast, showAlert, t])

  useEffect(() => {
    if (!isWorkspaceTabActive) return
    const handleRenameShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'F2' || editingConversationGroupId) return
      if (conversationFilter === 'all' || conversationFilter === 'archived') {
        event.preventDefault()
        showSystemGroupRenameUnsupported()
        return
      }
      if (!conversationOrganizer.groups.some((group) => group.id === conversationFilter)) return
      event.preventDefault()
      beginRenameConversationGroup(conversationFilter)
    }
    window.addEventListener('keydown', handleRenameShortcut)
    return () => window.removeEventListener('keydown', handleRenameShortcut)
  }, [beginRenameConversationGroup, conversationFilter, conversationOrganizer.groups, editingConversationGroupId, isWorkspaceTabActive, showSystemGroupRenameUnsupported])

  useEffect(() => {
    if (conversationFilter === 'ungrouped') setConversationFilter('all')
  }, [conversationFilter])

  const handleDeleteConversationGroup = useCallback(async (groupId: string) => {
    const group = conversationOrganizer.groups.find((item) => item.id === groupId)
    if (!group) return
    const confirmed = await requestDeleteConfirmation(t('删除分组后,其中的会话将移到未分组.是否继续?'))
    if (!confirmed) return
    persistConversationOrganizer((current) => ({
      groups: current.groups.filter((item) => item.id !== groupId),
      assignments: Object.fromEntries(Object.entries(current.assignments).filter(([, assignedGroupId]) => assignedGroupId !== groupId)),
    }))
    if (conversationFilter === groupId) setConversationFilter('ungrouped')
  }, [conversationFilter, conversationOrganizer.groups, persistConversationOrganizer, requestDeleteConfirmation, t])

  const toggleConversationSelection = useCallback((conversationId: string) => {
    setSelectedConversationIds((current) => {
      const next = new Set(current)
      if (next.has(conversationId)) next.delete(conversationId)
      else next.add(conversationId)
      return next
    })
  }, [])

  const clearConversationSelection = useCallback(() => {
    setSelectedConversationIds(new Set())
    setConversationSelectionMode(false)
    setMoveToGroupOpen(false)
  }, [])

  const refreshConversationList = useCallback(async () => {
    const conversations = await listAIConversations().catch(() => [])
    const temporarySummaries = await listTemporaryAIConversationsFromDisk().catch(() => [])
    seedTemporaryAIConversations(temporarySummaries)
    setConversationList([...temporarySummaries.map((summary) => ({ ...summary, transient: true })), ...(Array.isArray(conversations) ? conversations : [])])
  }, [])

  const handleMoveSelectedConversations = useCallback((groupId: string) => {
    const selected = new Set(selectedConversationIds)
    persistConversationOrganizer((current) => {
      const assignments = { ...current.assignments }
      selected.forEach((conversationId) => {
        if (groupId) assignments[conversationId] = groupId
        else delete assignments[conversationId]
      })
      return { ...current, assignments }
    })
    clearConversationSelection()
  }, [clearConversationSelection, persistConversationOrganizer, selectedConversationIds])

  const handleSetSelectedArchived = useCallback(async (archived: boolean) => {
    const ids = Array.from(selectedConversationIds)
    await Promise.all(ids.map(async (conversationId) => {
      try {
    const temporarySummary = getTemporaryAIConversationSummary(conversationId)
        if (temporarySummary) {
          const temporarySnapshot = await getTemporaryAIConversation(conversationId)
          const saved = await saveTemporaryAIConversation({ ...temporarySnapshot, archived, updatedAt: Date.now() })
          upsertTemporaryAIConversation(saved)
          return
        }
        const snapshot = await getAIConversation(conversationId)
        await saveAIConversation({ ...snapshot, archived, updatedAt: Date.now() })
      } catch {
        // Continue processing the remaining selected conversations.
      }
    }))
    clearConversationSelection()
    await refreshConversationList()
  }, [clearConversationSelection, refreshConversationList, selectedConversationIds])

  const handleDeleteSelectedConversations = useCallback(async () => {
    const ids = Array.from(selectedConversationIds)
    if (ids.length === 0) return
    const confirmed = await requestDeleteConfirmation(t('确定删除选中的对话吗？此操作不可撤销。'))
    if (!confirmed) return
    const results = await Promise.allSettled(ids.map(async (conversationId) => removeTemporaryAIConversation(conversationId) ? deleteTemporaryAIConversation(conversationId) : deleteAIConversation(conversationId)))
    persistConversationOrganizer((current) => ({
      ...current,
      assignments: Object.fromEntries(Object.entries(current.assignments).filter(([conversationId]) => !selectedConversationIds.has(conversationId))),
    }))
    clearConversationSelection()
    await refreshConversationList()
    // 容错：部分失败时提示，不影响已成功的删除
    const failedCount = results.filter((result) => result.status === 'rejected').length
    if (failedCount > 0) {
      addToast?.(`${t('部分对话删除失败')}（${failedCount}），其余删除已生效`, 'error')
    }
  }, [addToast, clearConversationSelection, persistConversationOrganizer, refreshConversationList, requestDeleteConfirmation, selectedConversationIds, t])
  useEffect(() => {
    const handleDeleteWorkspaceTabConversation = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      const targetSessionId = typeof detail?.sessionId === 'string' ? detail.sessionId.trim() : ''
      const targetTerminalId = typeof detail?.terminalId === 'string' ? detail.terminalId.trim() : ''
      const targetTabId = typeof detail?.tabId === 'string' ? detail.tabId.trim() : ''
      const targetConversationId = typeof detail?.conversationId === 'string' ? detail.conversationId.trim() : ''
      if (
        !targetConversationId
        || targetTabId !== (workspaceTabId || '').trim()
        || targetSessionId !== (sessionId || '').trim()
        || targetTerminalId !== (terminalId || '').trim()
      ) {
        return
      }
      void handleDeleteConversation(targetConversationId)
    }
    window.addEventListener('ai-workspace-tab-delete-conversation', handleDeleteWorkspaceTabConversation)
    return () => window.removeEventListener('ai-workspace-tab-delete-conversation', handleDeleteWorkspaceTabConversation)
  }, [handleDeleteConversation, sessionId, terminalId, workspaceTabId])

  const handleProviderChange = useCallback(async (providerId: string) => {
    const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : ''
    const syncLatestProviderState = async () => {
      try {
        const latestProviderState = await getAIProviderState()
        setAIProviderState({
          currentProviderId: normalizedProviderId || latestProviderState.currentProviderId || '',
          providers: Array.isArray(latestProviderState?.providers) ? latestProviderState.providers : [],
        })
      } catch {
        setAIProviderState((current) => ({
          ...current,
          currentProviderId: normalizedProviderId,
        }))
      }
    }

    setAIProviderState((current) => ({
      ...current,
      currentProviderId: normalizedProviderId,
    }))
    if (activeConversation) {
      const nextConversation = {
        ...activeConversation,
        updatedAt: Date.now(),
        settings: {
          ...((activeConversation?.settings as Record<string, unknown> | null) || {}),
          currentProviderId: normalizedProviderId,
        },
      }
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        conversation: nextConversation,
      }))
      await saveConversationSnapshot(nextConversation, panelInstanceKey)
      await syncLatestProviderState()
      return
    }

    const nextSettings = await saveAIGlobalSettings({
      ...(globalAISettings || {}),
      currentProviderId: normalizedProviderId,
    })
    setGlobalAISettings(nextSettings)
    await syncLatestProviderState()
  }, [activeConversation, globalAISettings, panelInstanceKey, saveConversationSnapshot, setPanelState])

  const handlePatchAutoApprovalSettings = useCallback(async (patch: Record<string, unknown>) => {
    const { allowedCommands, deniedCommands, ...taskPatch } = patch || {}
    const hasGlobalOnlyPatch = allowedCommands !== undefined || deniedCommands !== undefined
    const hasTaskPatch = Object.keys(taskPatch).length > 0

    if (hasGlobalOnlyPatch) {
      const nextGlobalSettings = await saveAIGlobalSettings({
        ...normalizeAIGlobalSettings(globalAISettings),
        ...(!activeConversation ? taskPatch : {}),
        ...(allowedCommands !== undefined ? { allowedCommands } : {}),
        ...(deniedCommands !== undefined ? { deniedCommands } : {}),
      })
      setGlobalAISettings(nextGlobalSettings)
    }

    if (activeConversation && hasTaskPatch) {
      const nextConversation = {
        ...activeConversation,
        updatedAt: Date.now(),
        settings: normalizeAIConversationTaskSettings({
          ...((activeConversation?.settings as Record<string, unknown> | null) || {}),
          ...taskPatch,
        }),
      }
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        conversation: nextConversation,
      }))
      await saveConversationSnapshot(nextConversation, panelInstanceKey)
    } else if (!activeConversation && hasTaskPatch && !hasGlobalOnlyPatch) {
      const nextSettings = await saveAIGlobalSettings({
        ...normalizeAIGlobalSettings(globalAISettings),
        ...taskPatch,
      })
      setGlobalAISettings(nextSettings)
    }
    if (taskPatch.alwaysAllowFollowupQuestions === false) {
      let shouldDisableCurrentCollaboration = false
      let shouldMarkInterruptedRequestId = ''
      setComposerInputValue('')
      setPanelState(panelInstanceKey, (current) => {
        const activeMode = typeof current.collaborationMode === 'string' ? current.collaborationMode.trim() : ''
        const pendingMode = typeof current.collaborationPendingMode === 'string' ? current.collaborationPendingMode.trim() : ''
        const activeRequestId = typeof current.activeRequestId === 'string' ? current.activeRequestId.trim() : ''
        const pendingRequestId = typeof current.collaborationPendingRequestId === 'string' ? current.collaborationPendingRequestId.trim() : ''
        const isForcedActive = activeMode === 'forced'
        const isForcedPending = pendingMode === 'forced'
        if (!isForcedActive && !isForcedPending) {
          shouldDisableCurrentCollaboration = Boolean(activeRequestId)
          shouldMarkInterruptedRequestId = activeRequestId || pendingRequestId
        }
        return {
          ...current,
          collaborationLocked: false,
          collaborationActive: isForcedActive ? current.collaborationActive : false,
          collaborationMode: isForcedActive ? current.collaborationMode : '',
          collaborationStreamBuffer: isForcedActive ? current.collaborationStreamBuffer : '',
          collaborationAwaitingManualFollowup: false,
          collaborationFollowupRequestId: '',
          collaborationPendingMode: isForcedPending ? current.collaborationPendingMode : '',
          collaborationPendingRequestId: isForcedPending ? current.collaborationPendingRequestId : '',
          collaborationInterruptedRequestId: shouldMarkInterruptedRequestId,
          collaborationStatusStartedAtMs: isForcedActive ? current.collaborationStatusStartedAtMs : 0,
          collaborationStatusFirstTokenAtMs: isForcedActive ? current.collaborationStatusFirstTokenAtMs : 0,
          collaborationStatusText: isForcedActive ? current.collaborationStatusText : '',
          collaborationStatusReasoningText: isForcedActive ? current.collaborationStatusReasoningText : '',
        }
      })
      if (shouldDisableCurrentCollaboration && panelState.activeRequestId) {
        void disableAIChatCollaboration(panelState.activeRequestId).catch(() => {})
      }
    }
  }, [activeConversation, globalAISettings, panelInstanceKey, panelState.activeRequestId, saveConversationSnapshot, setPanelState])

  const handleCollaborationExtraPromptChange = useCallback(async (nextValue: string) => {
    await handlePatchAutoApprovalSettings({ collaborationExtraPrompt: typeof nextValue === 'string' ? nextValue : '' })
  }, [handlePatchAutoApprovalSettings])

  const handleCollaborationPromptPresetsChange = useCallback(async (nextPresets: unknown) => {
    const nextGlobalSettings = await saveAIGlobalSettings({
      ...normalizeAIGlobalSettings(globalAISettings),
      collaborationPromptPresets: Array.isArray(nextPresets) ? nextPresets : [],
    })
    setGlobalAISettings(nextGlobalSettings)
  }, [globalAISettings])


  const handleSendMessage = useCallback(async (text: string, sendOptionsOrEditState: Record<string, unknown> | null = null, explicitEditState: Record<string, unknown> | null = null, runtimeOptions: Record<string, unknown> = {}) => {
    const perfStages: Array<{ label: string; ms: number }> = []
    let perfLastMark = performance.now()
    const recordPerfStage = (label: string) => {
      const now = performance.now()
      perfStages.push({ label, ms: now - perfLastMark })
      perfLastMark = now
    }
    let sendOptions = null
    let overrideEditState = explicitEditState
    if (sendOptionsOrEditState && typeof sendOptionsOrEditState === 'object' && (sendOptionsOrEditState.mode === 'edit' || sendOptionsOrEditState.mode === 'retry')) {
      overrideEditState = sendOptionsOrEditState
    } else {
      sendOptions = sendOptionsOrEditState
    }

    const normalizedRuntimeOptions = runtimeOptions && typeof runtimeOptions === 'object' ? runtimeOptions : {}
    const nextText = typeof text === 'string' ? text.trim() : ''
    const messageImages = normalizeMessageImages(sendOptions?.images ?? composerImages)
    if (!nextText && messageImages.length === 0) {
      return false
    }

    clearRestorePreview()

    const targetConversationFromOptions = normalizedRuntimeOptions?.targetConversationSnapshot && typeof normalizedRuntimeOptions.targetConversationSnapshot === 'object'
      ? normalizedRuntimeOptions.targetConversationSnapshot as AIConversationSnapshot
      : null
    const activeConversationToolScope = typeof activeConversation?.toolScope === 'string' ? activeConversation.toolScope.trim() : ''
    const activeConversationToolScopeSlot = typeof activeConversation?.toolScopeSlot === 'string' ? activeConversation.toolScopeSlot.trim() : ''
    const effectiveToolScope = typeof normalizedRuntimeOptions?.toolScope === 'string' && normalizedRuntimeOptions.toolScope.trim()
      ? normalizedRuntimeOptions.toolScope.trim()
      : activeConversationToolScope
    const effectiveToolScopeSlot = typeof normalizedRuntimeOptions?.toolScopeSlot === 'string' && normalizedRuntimeOptions.toolScopeSlot.trim()
      ? normalizedRuntimeOptions.toolScopeSlot.trim()
      : activeConversationToolScopeSlot
    const isThemeTuningConversation = effectiveToolScope === 'theme_tuning'
    let targetConversationSnapshot = normalizedRuntimeOptions?.forceNewConversation === true ? null : (targetConversationFromOptions || activeConversation)
    if (temporarySessionEnabled && targetConversationSnapshot?.transient !== true && !effectiveToolScope) {
      targetConversationSnapshot = null
    }
    if (!temporarySessionEnabled && targetConversationSnapshot?.transient === true && !effectiveToolScope) {
      targetConversationSnapshot = null
    }
    if (targetConversationSnapshot?.archived === true && targetConversationSnapshot?.relationType === 'agent') {
      return false
    }
    const activeComposerState = overrideEditState || composerEditState
    const isEditingExistingMessage = activeComposerState?.mode === 'edit' && activeComposerState?.targetMessageId
    const isRetryingMessage = activeComposerState?.mode === 'retry' && activeComposerState?.targetMessageId

    const latestProviderState = await getAIProviderState().catch(() => ({
      currentProviderId: typeof aiProviderState?.currentProviderId === 'string' ? aiProviderState.currentProviderId.trim() : '',
      providers: availableAIProviders,
    }))
    recordPerfStage('获取供应商状态')
    const latestProviders = Array.isArray(latestProviderState?.providers) ? latestProviderState.providers : []
    const preferredProviderId = targetConversationSnapshot
      ? (targetConversationSnapshot.settings && typeof targetConversationSnapshot.settings === 'object'
        ? (targetConversationSnapshot.settings as Record<string, unknown>).currentProviderId
        : undefined)
      : latestProviderState?.currentProviderId
    const resolvedProviderId = resolveAvailableProviderId(latestProviders, typeof preferredProviderId === 'string' ? preferredProviderId : undefined)
    const nextConversationSnapshot = targetConversationSnapshot
      ? buildConversationWithProviderId(targetConversationSnapshot, resolvedProviderId)
      : null

    setAIProviderState({
      currentProviderId: resolvedProviderId,
      providers: latestProviders,
    })

    if (targetConversationSnapshot && nextConversationSnapshot !== targetConversationSnapshot) {
      targetConversationSnapshot = nextConversationSnapshot
      setConversationList((prev) => upsertConversationSummary(prev, nextConversationSnapshot!))
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        conversation: nextConversationSnapshot,
      }))
      // 此分支内 targetConversationSnapshot 非空，nextConversationSnapshot 必为快照
      await saveConversationSnapshot(nextConversationSnapshot!, panelInstanceKey)
    } else if (!targetConversationSnapshot && !isThemeTuningConversation) {
      const currentGlobalProviderId = typeof latestProviderState?.currentProviderId === 'string' ? latestProviderState.currentProviderId.trim() : ''
      if (resolvedProviderId && resolvedProviderId !== currentGlobalProviderId) {
        const nextSettings = await saveAIGlobalSettings({
          ...(globalAISettings || {}),
          currentProviderId: resolvedProviderId,
        })
        setGlobalAISettings(nextSettings)
      }
    }

    if (!resolvedProviderId) {
      return false
    }

    if (runtimeOptions?.forceImmediate !== true && isQueueBlocked) {
      const queuedSubmission = buildAIQueuedSubmission({
        kind: isEditingExistingMessage ? 'edit' : isRetryingMessage ? 'retry_user' : 'chat',
        text: nextText,
        images: messageImages,
        targetMessageId: typeof activeComposerState?.targetMessageId === 'string' ? activeComposerState.targetMessageId : '',
        targetMessageText: typeof activeComposerState?.targetMessageText === 'string' ? activeComposerState.targetMessageText : nextText,
        toolScope: effectiveToolScope,
        toolScopeSlot: effectiveToolScopeSlot,
        forceNewConversation: runtimeOptions?.forceNewConversation === true,
      })
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        queuedSubmission,
        isFlushingQueuedSubmission: false,
      }))
      if (panelState.requestPhase === 'awaiting_tool_approval' && panelState.activeRequestId) {
        try {
          await rejectAIChatToolsForQueuedSubmission(panelState.activeRequestId)
        } catch {}
      }
      return false
    }

    let targetConversation = targetConversationSnapshot
    if (!targetConversation) {
      if (isThemeTuningConversation || temporarySessionEnabled) {
        const now = Date.now()
        targetConversation = {
          id: `${isThemeTuningConversation ? 'theme-tuning' : 'temporary'}-${now}-${Math.random().toString(36).slice(2, 8)}`,
          title: isThemeTuningConversation ? translate('AI调色') : truncateConversationTitle(nextText),
          createdAt: now,
          updatedAt: now,
          status: 'idle',
          toolProtocol: 'xml',
          messageCount: 0,
          messages: [],
          apiMessages: [],
          settings: normalizeAIConversationTaskSettings({
            currentProviderId: resolvedProviderId,
          }),
          transient: true,
          toolScope: effectiveToolScope,
          toolScopeSlot: effectiveToolScopeSlot,
        }
      } else {
        targetConversation = await createAIConversation(truncateConversationTitle(nextText))
        setConversationList((prev) => upsertConversationSummary(prev, targetConversation!))
      }
    }

    const executionContextSnapshot = getExecutionContextSnapshot({
      sessionId,
      terminalId,
    })
    const environmentDetailsBlock = buildExecutionContextDetails(executionContextSnapshot)
    const { transformedText: slashExpandedPromptText } = expandFirstSlashCommandForPrompt(
      nextText,
      normalizedGlobalAISettings.slashCommands,
    )
    const preprocessedPromptText = slashExpandedPromptText && targetConversation?.id
      ? await preprocessAIConversationLongText(targetConversation.id, slashExpandedPromptText)
      : (slashExpandedPromptText || '')
    recordPerfStage('长文本预处理')
    const baseUserPromptText = preprocessedPromptText
      ? `<user_message>\n${preprocessedPromptText}\n</user_message>`
      : ''
    const promptWithMentions = baseUserPromptText
      ? await processRemoteFileMentions(baseUserPromptText, {
          sessionId: terminalId,
          readFile: (activeSessionId: string, remotePath: string) => AppGo.ReadFile(activeSessionId, remotePath),
          listDir: (activeSessionId: string, remotePath: string) => AppGo.ListDir(activeSessionId, remotePath),
          getTerminalOutput: () => {
            const snapshotProvider = window?.__luminTerminalSnapshots?.[terminalId]
            const rawOutput = typeof snapshotProvider === 'function' ? snapshotProvider() : ''
            return compressTerminalOutputForPrompt(rawOutput, terminalOutputLineLimit, terminalOutputCharacterLimit)
          },
          readLocalWrappedFile: (localPath: string) => readAIConversationWrappedFile(targetConversation.id, localPath),
        })
      : ''
    recordPerfStage('远程@提及')
    const processedPromptText = [promptWithMentions, environmentDetailsBlock]
      .filter((item) => typeof item === 'string' && item.trim())
      .join('\n\n')
      .trim()

    const baseConversation = isEditingExistingMessage || isRetryingMessage
      ? truncateConversationAfterMessage(targetConversation, String(activeComposerState.targetMessageId || ''))
      : targetConversation
    const shouldInjectAssistantFirstReply = shouldUseAssistantFirstReplyForConversation(baseConversation)

    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const baseApiMessages = Array.isArray(baseConversation.apiMessages) ? baseConversation.apiMessages : []
    const requestModelMeta = resolveAIRequestModelMeta(resolvedProviderId, latestProviders)
    const userMessage = {
      id: `user-${requestId}`,
      kind: 'user',
      text: nextText,
      images: messageImages,
      time: formatMessageTime(),
      extra: requestModelMeta,
    }
    const nextApiMessages = [
      ...baseApiMessages,
      createAPIHistoryMessage({
        role: 'user',
        content: processedPromptText,
        messageId: `api-user-${requestId}`,
        uiMessageIds: [userMessage.id],
        images: messageImages,
        ts: Date.now(),
      }),
    ]
    const requestMessages = buildRequestMessages(nextApiMessages)
    recordPerfStage('净化构建')
    const assistantMessage = {
      id: requestId,
      turnId: requestId,
      kind: 'assistant',
      text: '▍',
      time: formatMessageTime(),
      metrics: [],
      streaming: true,
      extra: {
        apiLengthBefore: nextApiMessages.length,
        statusStartedAtMs: Date.now(),
        firstTokenAtMs: 0,
        requestStatusLive: true,
      },
    }
    const persistedConversation = {
      ...baseConversation,
      title: baseConversation.title && baseConversation.title !== translate('新对话') ? baseConversation.title : truncateConversationTitle(nextText),
      updatedAt: Date.now(),
      status: 'streaming',
      messages: [...(baseConversation.messages || []), userMessage],
      apiMessages: nextApiMessages,
    }
    const nextConversation = {
      ...persistedConversation,
      messages: [...persistedConversation.messages, assistantMessage],
    }

    let assistantFirstReplyText = ''
    if (!normalizedRuntimeOptions.skipAssistantFirstReply && shouldInjectAssistantFirstReply) {
      assistantFirstReplyText = (await getAIAssistantFirstReply(getLanguage())).trim()
    }
    recordPerfStage('首字预取')

    resetComposerEditState()
    requestConversationSmoothScrollToBottom()
    if (!targetConversation.transient) {
      setConversationList((prev) => upsertConversationSummary(prev, persistedConversation))
    }
    setPanelState(panelInstanceKey, {
      activeConversationId: targetConversation.id,
      conversation: nextConversation,
      messages: nextConversation.messages,
      apiMessages: nextApiMessages,
      activeRequestId: requestId,
      activeAssistantMessageId: requestId,
      activeToolExecution: null,
      recoverableToolStopReason: '',
      lastAssistantTurnId: requestId,
      lastTurnBusinessMessageKind: '',
      requestPhase: 'streaming',
      runtimePhase: 'api_request',
      isCondensingContext: normalizedRuntimeOptions.keepCondensingContext === true,
      collaborationLocked: shouldLockAssistantCollaboration,
      collaborationActive: false,
      collaborationMode: '',
      collaborationStreamBuffer: '',
      collaborationAwaitingManualFollowup: false,
      collaborationFollowupRequestId: '',
      collaborationInterruptedRequestId: '',
      collaborationStatusStartedAtMs: 0,
      collaborationStatusFirstTokenAtMs: 0,
      collaborationStatusText: '',
      collaborationStatusReasoningText: '',
    })

    await saveConversationSnapshot(persistedConversation, panelInstanceKey, { hydrate: false })
    recordPerfStage('落库快照')

    try {
      await startAIChat(requestId, {
        conversationId: targetConversation.id,
        sessionId: terminalId,
        autoApprove: effectiveAutoApprovalEnabled,
        skipNextAutomaticRequest: Boolean(panelState.skipNextAutomaticRequest),
        assistantFirstReplyText: assistantFirstReplyText || undefined,
        isDemon: Boolean(isDevilMode),
        toolScope: effectiveToolScope || undefined,
        toolScopeSlot: effectiveToolScopeSlot || undefined,
        autoRecoverySubtaskHops: Number.isFinite(Number(normalizedRuntimeOptions.autoRecoverySubtaskHops))
          ? Math.max(0, Math.trunc(Number(normalizedRuntimeOptions.autoRecoverySubtaskHops)))
          : undefined,
        messages: requestMessages,
      })
      recordPerfStage('发起请求')
      const perfTotal = perfStages.reduce((sum, stage) => sum + stage.ms, 0)
      const perfRecord = { stages: perfStages, total: perfTotal, at: Date.now() }
      sendPerfMetricsRef.current.set(userMessage.id, perfRecord)
      sendPerfMetricsRef.current.set(requestId, perfRecord)
      return true
    } catch (error) {
      const errorText = error instanceof Error ? error.message : translate('请求失败')
      const erroredConversation = {
        ...nextConversation,
        updatedAt: Date.now(),
        status: 'error',
        messages: (nextConversation.messages || []).map((message: AIMessage) => {
          if (message.id !== requestId || message.kind !== 'assistant') {
            return message
          }
          const preservedText = typeof message.text === 'string' ? message.text.replace(/▍$/u, '').trim() : ''
          return {
            ...message,
            text: preservedText,
            metrics: [],
            streaming: false,
            extra: {
              ...(message.extra || {}),
              requestStatusLive: false,
              errorText,
            },
          }
        }),
      }

      setPanelState(panelInstanceKey, {
        activeConversationId: targetConversation.id,
        conversation: erroredConversation,
        messages: erroredConversation.messages,
        apiMessages: nextApiMessages,
        activeRequestId: '',
        activeAssistantMessageId: '',
        activeToolExecution: null,
        recoverableToolStopReason: '',
        requestPhase: 'idle',
        toolApprovalMode: '',
        runtimePhase: 'ready',
        skipNextAutomaticRequest: false,
        activeChangeReview: null,
        collaborationLocked: false,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
      })
      await saveConversationSnapshot(erroredConversation, panelInstanceKey)
      return false
    }
  }, [activeConversation, aiProviderState, availableAIProviders, buildConversationWithProviderId, composerEditState, composerImages, effectiveAutoApprovalEnabled, getAIAssistantFirstReply, globalAISettings, isDevilMode, isQueueBlocked, normalizedGlobalAISettings.slashCommands, panelInstanceKey, panelState.activeRequestId, panelState.requestPhase, requestConversationSmoothScrollToBottom, resetComposerEditState, resolveAIRequestModelMeta, resolveAvailableProviderId, saveConversationSnapshot, setPanelState, shouldLockAssistantCollaboration, temporarySessionEnabled, terminalId, terminalOutputCharacterLimit, terminalOutputLineLimit, truncateConversationAfterMessage])

  const handleFollowupResponse = useCallback(async (payload: Record<string, unknown>) => {
    if (!payload || typeof payload !== 'object') {
      return false
    }
    const requestId = typeof payload.requestId === 'string' ? payload.requestId.trim() : ''
    if (!requestId) {
      return false
    }
    const followupImages = normalizeMessageImages(payload.images)
    try {
      await resolveAIChatFollowup(requestId, payload.answer, followupImages)
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        collaborationLocked: shouldLockAssistantCollaboration,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
        collaborationInterruptedRequestId: '',
        collaborationStatusStartedAtMs: 0,
        collaborationStatusFirstTokenAtMs: 0,
        collaborationStatusText: '',
        collaborationStatusReasoningText: '',
      }))
      return true
    } catch {}
    const currentPanel = terminalPanelsRef.current[panelInstanceKey] || null
    const currentConversation = currentPanel?.conversation || activeConversation
    const currentConversationToolScope = typeof currentConversation?.toolScope === 'string' ? currentConversation.toolScope.trim() : ''
    const currentConversationToolScopeSlot = typeof currentConversation?.toolScopeSlot === 'string' ? currentConversation.toolScopeSlot.trim() : ''
    if (!currentConversation?.id) {
      return false
    }
    const { readableText, content: followupContent } = buildAIFollowupAnswerPayload(payload.answer as string | AIMessage)
    if (!readableText || !followupContent) {
      return false
    }
    const currentMessages = Array.isArray(currentPanel?.messages) ? currentPanel.messages : (Array.isArray(currentConversation.messages) ? currentConversation.messages : [])
    const currentApiMessages = Array.isArray(currentPanel?.apiMessages) ? currentPanel.apiMessages : (Array.isArray(currentConversation.apiMessages) ? currentConversation.apiMessages : [])
    const followupMessage = findLatestAIFollowupMessageByRequestId(currentMessages, requestId)
    const followupMessageId = typeof followupMessage?.id === 'string' ? followupMessage.id.trim() : ''
    const timestamp = Date.now()
    const userMessageId = `${followupMessageId || requestId}-followup-answer-${timestamp}`
    const rawFollowupSettings = currentConversation?.settings && typeof currentConversation.settings === 'object' ? currentConversation.settings as Record<string, unknown> : null
    const followupProviderId = typeof rawFollowupSettings?.currentProviderId === 'string' ? rawFollowupSettings.currentProviderId.trim() : ''
    const requestModelMeta = resolveAIRequestModelMeta(followupProviderId)
    const userMessage = {
      id: userMessageId,
      kind: 'user',
      text: readableText,
      images: followupImages,
      time: formatMessageTime(),
      extra: requestModelMeta,
    }
    const resolvedMessages = currentMessages.map((message) => {
      if (!followupMessageId || message?.id !== followupMessageId || message?.kind !== 'followup') {
        return message
      }
      return {
        ...message,
        status: AI_FOLLOWUP_COMPLETED_STATUS_KEY,
        requestId: '',
      }
    })
    const nextMessages = [...resolvedMessages, userMessage]
    const nextApiMessages = [
      ...currentApiMessages,
      createAPIHistoryMessage({
        role: 'user',
        content: followupContent,
        messageId: `api-user-followup-${timestamp}`,
        uiMessageIds: [userMessageId],
        images: followupImages,
        ts: timestamp,
      }),
    ]
    const requestMessages = buildRequestMessages(nextApiMessages)
    const nextRequestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const assistantMessage = {
      id: nextRequestId,
      turnId: nextRequestId,
      kind: 'assistant',
      text: '▍',
      time: formatMessageTime(),
      metrics: [],
      streaming: true,
      extra: {
        apiLengthBefore: nextApiMessages.length,
        statusStartedAtMs: Date.now(),
        firstTokenAtMs: 0,
        requestStatusLive: true,
        errorText: '',
      },
    }
    const persistedConversation = {
      ...currentConversation,
      updatedAt: Date.now(),
      status: 'streaming',
      messages: nextMessages,
      apiMessages: nextApiMessages,
    }
    const nextConversation = {
      ...persistedConversation,
      messages: [...nextMessages, assistantMessage],
    }
    requestConversationSmoothScrollToBottom()
    if (!currentConversation.transient) {
      setConversationList((prev) => upsertConversationSummary(prev, persistedConversation))
    }
    setPanelState(panelInstanceKey, {
      activeConversationId: currentConversation.id,
      conversation: nextConversation,
      messages: nextConversation.messages,
      apiMessages: nextApiMessages,
      activeRequestId: nextRequestId,
      activeAssistantMessageId: nextRequestId,
      activeToolExecution: null,
      toolApprovalMode: '',
      requestPhase: 'streaming',
      runtimePhase: 'api_request',
      queuedSubmission: null,
      isFlushingQueuedSubmission: false,
      skipNextAutomaticRequest: false,
      resumeAfterCancelRequestId: '',
      recoverableToolStopReason: '',
      lastAssistantTurnId: nextRequestId,
      lastTurnBusinessMessageKind: '',
      activeChangeReview: null,
      collaborationLocked: shouldLockAssistantCollaboration,
      collaborationActive: false,
      collaborationMode: '',
      collaborationStreamBuffer: '',
      collaborationAwaitingManualFollowup: false,
      collaborationFollowupRequestId: '',
      collaborationInterruptedRequestId: '',
      collaborationStatusStartedAtMs: 0,
      collaborationStatusFirstTokenAtMs: 0,
      collaborationStatusText: '',
      collaborationStatusReasoningText: '',
    })
    await saveConversationSnapshot(persistedConversation, panelInstanceKey, { hydrate: false })
    try {
      await startAIChat(nextRequestId, {
        conversationId: currentConversation.id,
        sessionId: terminalId,
        autoApprove: effectiveAutoApprovalEnabled,
        skipNextAutomaticRequest: false,
        isDemon: Boolean(isDevilMode),
        toolScope: currentConversationToolScope || undefined,
        toolScopeSlot: currentConversationToolScopeSlot || undefined,
        messages: requestMessages,
      })
      return true
    } catch (error) {
      const errorText = error instanceof Error ? error.message : translate('请求失败')
      const erroredConversation = {
        ...nextConversation,
        updatedAt: Date.now(),
        status: 'error',
        messages: nextConversation.messages.map((message) => {
          if (message.id !== nextRequestId || message.kind !== 'assistant') {
            return message
          }
          return {
            ...message,
            text: '',
            metrics: [],
            streaming: false,
            extra: {
              ...(message.extra || {}),
              requestStatusLive: false,
              errorText,
            },
          }
        }),
      }
      setPanelState(panelInstanceKey, {
        activeConversationId: currentConversation.id,
        conversation: erroredConversation,
        messages: erroredConversation.messages,
        apiMessages: nextApiMessages,
        activeRequestId: '',
        activeAssistantMessageId: '',
        activeToolExecution: null,
        requestPhase: 'idle',
        toolApprovalMode: '',
        runtimePhase: 'ready',
        queuedSubmission: null,
        isFlushingQueuedSubmission: false,
        skipNextAutomaticRequest: false,
        resumeAfterCancelRequestId: '',
        recoverableToolStopReason: '',
        activeChangeReview: null,
        collaborationLocked: false,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
      })
      await saveConversationSnapshot(erroredConversation, panelInstanceKey)
      return false
    }
  }, [activeConversation, effectiveAutoApprovalEnabled, isDevilMode, panelInstanceKey, requestConversationSmoothScrollToBottom, resolveAIRequestModelMeta, saveConversationSnapshot, setPanelState, shouldLockAssistantCollaboration, terminalId])

  const handleConversationUserMessage = useCallback(async (payload: string | Record<string, unknown>) => {
    if (payload && typeof payload === 'object' && payload.kind === 'followup-response') {
      if (collaborationFollowupInteractionLocked) {
        return false
      }
      return handleFollowupResponse(payload)
    }
    const text = typeof payload === 'string' ? payload : ''
    return handleSendMessage(text, { images: [] })
  }, [collaborationFollowupInteractionLocked, handleFollowupResponse, handleSendMessage])

  const handleComposerSendMessage = useCallback(async (text: string, sendOptionsOrEditState: Record<string, unknown> | null = null, explicitEditState: Record<string, unknown> | null = null, runtimeOptions: Record<string, unknown> = {}) => {
    const pendingFollowupRequestId = panelState.collaborationAwaitingManualFollowup ? panelState.collaborationFollowupRequestId : ''
    if (pendingFollowupRequestId) {
      const followupImages = normalizeMessageImages(sendOptionsOrEditState?.images)
      const accepted = await handleFollowupResponse({
        kind: 'followup-response',
        requestId: pendingFollowupRequestId,
        answer: typeof text === 'string' ? text : '',
        images: followupImages,
      })
      if (accepted !== false) {
        resetComposerEditState()
      }
      return accepted
    }
    return handleSendMessage(text, sendOptionsOrEditState, explicitEditState, runtimeOptions)
  }, [handleFollowupResponse, handleSendMessage, panelState.collaborationAwaitingManualFollowup, panelState.collaborationFollowupRequestId, resetComposerEditState])

  useEffect(() => {
    const handleStartThemeTuning = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      const targetSessionId = typeof detail?.sessionId === 'string' ? detail.sessionId.trim() : ''
      const targetTerminalId = typeof detail?.terminalId === 'string' ? detail.terminalId.trim() : ''
      const targetTabId = typeof detail?.tabId === 'string' ? detail.tabId.trim() : ''
      const slot = typeof detail?.slot === 'string' ? detail.slot.trim() : ''
      if (
        !isWorkspaceTabActive
        || (targetTabId && targetTabId !== workspaceTabId)
        || (sessionId || '').trim() !== targetSessionId
        || (terminalId || '').trim() !== targetTerminalId
      ) {
        return
      }
      if (slot !== 'light' && slot !== 'dark') {
        return
      }
      setThemeToolPreview(null)
      const starterText = slot === 'light'
        ? '请帮我实时调整当前浅色主题包的配色,先调用 help,随后只用 preview 或 inspect 逐步预览,满意后再 commit.'
        : '请帮我实时调整当前深色主题包的配色,先调用 help,随后只用 preview 或 inspect 逐步预览,满意后再 commit.'
      void handleSendMessage(starterText, { images: [] }, null, {
        toolScope: 'theme_tuning',
        toolScopeSlot: slot,
        forceNewConversation: true,
      })
    }
    window.addEventListener('ai-theme-tuning-start', handleStartThemeTuning)
    return () => window.removeEventListener('ai-theme-tuning-start', handleStartThemeTuning)
  }, [handleSendMessage, isWorkspaceTabActive, sessionId, terminalId, workspaceTabId])

  const handleRetryUserMessage = useCallback(async (messageId: string, text: string, images: unknown[] = []) => {
    if (!activeConversation) {
      return
    }
    if (isQueueBlocked) {
      const queuedSubmission = buildAIQueuedSubmission({
        kind: 'retry_user',
        text,
        images,
        targetMessageId: messageId,
        targetMessageText: text,
      })
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        queuedSubmission,
        isFlushingQueuedSubmission: false,
      }))
      if (panelState.requestPhase === 'awaiting_tool_approval' && panelState.activeRequestId) {
        try {
          await rejectAIChatToolsForQueuedSubmission(panelState.activeRequestId)
        } catch {}
      }
      return
    }
    await handleSendMessage(text, { images }, {
      mode: 'retry',
      targetMessageId: messageId,
      targetMessageText: text,
    }, { forceImmediate: true })
  }, [activeConversation, handleSendMessage, isQueueBlocked, panelInstanceKey, panelState.activeRequestId, panelState.requestPhase, setPanelState])

  const handleRetryAssistantMessage = useCallback(async (messageId: string) => {
    if (!activeConversation || isArchivedAgentConversation) {
      return false
    }
    clearRestorePreview()
    if (isQueueBlocked) {
      const queuedSubmission = buildAIQueuedSubmission({
        kind: 'retry_assistant',
        targetMessageId: messageId,
      })
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        queuedSubmission,
        isFlushingQueuedSubmission: false,
      }))
      if (panelState.requestPhase === 'awaiting_tool_approval' && panelState.activeRequestId) {
        try {
          await rejectAIChatToolsForQueuedSubmission(panelState.activeRequestId)
        } catch {}
      }
      return false
    }

    const targetAssistantMessage = (activeConversation.messages || []).find((message) => message.id === messageId && message.kind === 'assistant')
    if (!targetAssistantMessage) {
      return false
    }

    const baseConversation = truncateConversationAfterMessage(activeConversation, messageId)
    const requestApiMessages = Array.isArray(baseConversation.apiMessages) ? baseConversation.apiMessages : []
    if (requestApiMessages.length === 0) {
      return false
    }

    const requestMessages = buildRequestMessages(requestApiMessages)
    let assistantFirstReplyText = ''
    if (shouldUseAssistantFirstReplyForConversation(baseConversation)) {
      assistantFirstReplyText = (await getAIAssistantFirstReply(getLanguage())).trim()
    }
    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const assistantMessage = {
      id: requestId,
      turnId: requestId,
      kind: 'assistant',
      text: '▍',
      time: formatMessageTime(),
      metrics: [],
      streaming: true,
      extra: {
        apiLengthBefore: requestMessages.length,
        statusStartedAtMs: Date.now(),
        firstTokenAtMs: 0,
        requestStatusLive: true,
      },
    }
    const persistedConversation = {
      ...baseConversation,
      updatedAt: Date.now(),
      status: 'streaming',
      messages: [...(baseConversation.messages || [])],
      apiMessages: requestApiMessages,
    }
    const nextConversation = {
      ...persistedConversation,
      messages: [...persistedConversation.messages, assistantMessage],
    }

    resetComposerEditState()
    requestConversationSmoothScrollToBottom()
    if (!activeConversation.transient) {
      setConversationList((prev) => upsertConversationSummary(prev, persistedConversation))
    }
    setPanelState(panelInstanceKey, {
      activeConversationId: activeConversation.id,
      conversation: nextConversation,
      messages: nextConversation.messages,
      apiMessages: requestApiMessages,
      activeRequestId: requestId,
      activeAssistantMessageId: requestId,
      activeToolExecution: null,
      recoverableToolStopReason: '',
      lastAssistantTurnId: requestId,
      lastTurnBusinessMessageKind: '',
      requestPhase: 'streaming',
      runtimePhase: 'api_request',
      collaborationLocked: shouldLockAssistantCollaboration,
      collaborationActive: false,
      collaborationMode: '',
      collaborationStreamBuffer: '',
      collaborationAwaitingManualFollowup: false,
      collaborationFollowupRequestId: '',
      collaborationInterruptedRequestId: '',
      collaborationStatusStartedAtMs: 0,
      collaborationStatusFirstTokenAtMs: 0,
      collaborationStatusText: '',
      collaborationStatusReasoningText: '',
    })

    await saveConversationSnapshot(persistedConversation, panelInstanceKey, { hydrate: false })

    try {
      await startAIChat(requestId, {
        conversationId: activeConversation.id,
        sessionId: terminalId,
        autoApprove: effectiveAutoApprovalEnabled,
        skipNextAutomaticRequest: Boolean(panelState.skipNextAutomaticRequest),
        assistantFirstReplyText: assistantFirstReplyText || undefined,
        isDemon: Boolean(isDevilMode),
        toolScope: typeof activeConversation?.toolScope === 'string' && activeConversation.toolScope.trim() ? activeConversation.toolScope.trim() : undefined,
        toolScopeSlot: typeof activeConversation?.toolScopeSlot === 'string' && activeConversation.toolScopeSlot.trim() ? activeConversation.toolScopeSlot.trim() : undefined,
        messages: requestMessages,
      })
      return true
    } catch (error) {
      const errorText = error instanceof Error ? error.message : translate('请求失败')
      const erroredConversation = {
        ...nextConversation,
        updatedAt: Date.now(),
        status: 'error',
        messages: (nextConversation.messages || []).map((message: AIMessage) => {
          if (message.id !== requestId || message.kind !== 'assistant') {
            return message
          }
          const preservedText = typeof message.text === 'string' ? message.text.replace(/▍$/u, '').trim() : ''
          return {
            ...message,
            text: preservedText,
            metrics: [],
            streaming: false,
            extra: {
              ...(message.extra || {}),
              requestStatusLive: false,
              errorText,
            },
          }
        }),
      }

      setPanelState(panelInstanceKey, {
        activeConversationId: activeConversation.id,
        conversation: erroredConversation,
        messages: erroredConversation.messages,
        apiMessages: requestApiMessages,
        activeRequestId: '',
        activeAssistantMessageId: '',
        activeToolExecution: null,
        recoverableToolStopReason: '',
        requestPhase: 'idle',
        toolApprovalMode: '',
        runtimePhase: 'ready',
        skipNextAutomaticRequest: false,
        activeChangeReview: null,
        collaborationLocked: false,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
      })
      await saveConversationSnapshot(erroredConversation, panelInstanceKey)
      return false
    }
  }, [activeConversation, effectiveAutoApprovalEnabled, isDevilMode, isQueueBlocked, panelInstanceKey, panelState.activeRequestId, panelState.requestPhase, requestConversationSmoothScrollToBottom, resetComposerEditState, saveConversationSnapshot, setPanelState, shouldLockAssistantCollaboration, terminalId, truncateConversationAfterMessage])

  const handleEditUserMessage = useCallback((messageId: string, text: string, images: unknown[] = []) => {
    if (!activeConversation) {
      return
    }
    setComposerEditState({
      mode: 'edit',
      targetMessageId: messageId,
      targetMessageText: text,
    })
    setComposerInputValue(text || '')
    setComposerImages(normalizeMessageImages(images))
    requestConversationSmoothScrollToBottom()
  }, [activeConversation, requestConversationSmoothScrollToBottom])

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!activeConversation) {
      return
    }
    clearRestorePreview()
    const confirmed = await requestDeleteConfirmation(t('确定删除这条消息及其后续对话吗？此操作不可撤销。'))
    if (!confirmed) {
      return
    }
    const nextConversation = truncateConversationAfterMessage(activeConversation, messageId)
    const nextLastTurnState = computeAILastAssistantTurnState(nextConversation.messages)
    setPanelState(panelInstanceKey, (current) => ({
      ...current,
      conversation: nextConversation,
      messages: nextConversation.messages || [],
      apiMessages: nextConversation.apiMessages || [],
      activeRequestId: '',
      activeAssistantMessageId: '',
      activeToolExecution: null,
      requestPhase: 'idle',
      runtimePhase: 'ready',
      queuedSubmission: null,
      isFlushingQueuedSubmission: false,
      skipNextAutomaticRequest: false,
      resumeAfterCancelRequestId: '',
      recoverableToolStopReason: '',
      ...nextLastTurnState,
      collaborationLocked: false,
      collaborationActive: false,
      collaborationMode: '',
      collaborationStreamBuffer: '',
      collaborationAwaitingManualFollowup: false,
      collaborationFollowupRequestId: '',
    }))
    if (composerEditState.targetMessageId === messageId) {
      resetComposerEditState()
    }
    requestConversationSmoothScrollToBottom()
    await saveConversationSnapshot(nextConversation, panelInstanceKey)
  }, [activeConversation, composerEditState.targetMessageId, panelInstanceKey, requestConversationSmoothScrollToBottom, requestDeleteConfirmation, resetComposerEditState, saveConversationSnapshot, setPanelState, t, truncateConversationAfterMessage])

  const handleCondenseContext = useCallback(async () => {
    if (!activeConversation || isArchivedAgentConversation || runtimePhase !== 'ready' || panelState.isCondensingContext) {
      return
    }
    setPanelState(panelInstanceKey, (current) => ({
      ...current,
      isCondensingContext: true,
    }))
    try {
      const result = await condenseAIConversationContext(activeConversation.id, terminalId)
      const nextSnapshot = normalizeAIConversationSnapshot((result as { snapshot?: unknown } | null)?.snapshot || result)
      setConversationList((prev) => upsertConversationSummary(prev, nextSnapshot))
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        conversation: nextSnapshot,
        messages: nextSnapshot.messages,
        apiMessages: nextSnapshot.apiMessages,
        isCondensingContext: false,
      }))
      // 压缩改写了历史节点: 全量重建账本 (对每个节点重算并重新持久化压缩后的 Token)
      void rebuildAIConversationTokenLedger(nextSnapshot, panelInstanceKey)
    } catch {
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        isCondensingContext: false,
      }))
    }
  }, [activeConversation, panelInstanceKey, panelState.isCondensingContext, rebuildAIConversationTokenLedger, runtimePhase, setPanelState, terminalId])

  const continueAIConversationSummarySubtask = useCallback(async (conversationSnapshot: AIConversationSnapshot, continueText: string, options: Record<string, unknown> = {}) => {
    const nextConversationSnapshot = normalizeAIConversationSnapshot(conversationSnapshot)
    const normalizedContinueText = typeof continueText === 'string' ? continueText.trim() : ''
    const normalizedOptions = options && typeof options === 'object' ? options : {}
    const finalContinueText = buildAIConversationSummarySubtaskContinuePrompt(normalizedContinueText, getLanguage())
    if (!nextConversationSnapshot?.id || !finalContinueText) {
      return false
    }
    return handleSendMessage(finalContinueText, { images: [] }, null, {
      forceImmediate: true,
      targetConversationSnapshot: nextConversationSnapshot,
      autoRecoverySubtaskHops: Number.isFinite(Number(normalizedOptions.autoRecoverySubtaskHops))
        ? Math.max(0, Math.trunc(Number(normalizedOptions.autoRecoverySubtaskHops)))
        : undefined,
    })
  }, [handleSendMessage])

  const runAIConversationSummarySubtaskFlow = useCallback(async (conversationSnapshot: AIConversationSnapshot, options: Record<string, unknown> = {}) => {
    const nextConversationSnapshot = normalizeAIConversationSnapshot(conversationSnapshot)
    const normalizedOptions = options && typeof options === 'object' ? options : {}
    const summaryRequestId = typeof normalizedOptions.requestId === 'string' && normalizedOptions.requestId.trim()
      ? normalizedOptions.requestId.trim()
      : `summary-subtask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const preserveExistingCollaboration = normalizedOptions.preserveExistingCollaboration === true
    if (!nextConversationSnapshot?.id) {
      return false
    }
    if (!preserveExistingCollaboration) {
      setComposerInputValue('')
      setComposerImages([])
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        activeRequestId: summaryRequestId,
        isCondensingContext: true,
        collaborationLocked: true,
        collaborationActive: true,
        collaborationMode: 'summary_subtask',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
        collaborationPendingMode: '',
        collaborationPendingRequestId: '',
        collaborationInterruptedRequestId: '',
        collaborationStatusStartedAtMs: Date.now(),
        collaborationStatusFirstTokenAtMs: 0,
        collaborationStatusText: '',
        collaborationStatusReasoningText: '',
      }))
    }
    try {
      const subtaskResult = await createAIConversationSummarySubtask(nextConversationSnapshot.id, terminalId, summaryRequestId)
      const childSnapshot = normalizeAIConversationSnapshot(subtaskResult?.snapshot || subtaskResult)
      const continueText = typeof subtaskResult?.continueText === 'string' ? subtaskResult.continueText.trim() : ''
      if (!childSnapshot?.id || !continueText) {
        throw new Error(t('摘要创建子任务失败'))
      }
      const accepted = await continueAIConversationSummarySubtask(childSnapshot, continueText, {
        autoRecoverySubtaskHops: Number.isFinite(Number(normalizedOptions.autoRecoverySubtaskHops))
          ? Math.max(0, Math.trunc(Number(normalizedOptions.autoRecoverySubtaskHops)))
          : undefined,
      })
      if (!accepted) {
        throw new Error(t('摘要创建子任务失败'))
      }
      return true
    } catch (error) {
      const interruptedRequestId = typeof terminalPanelsRef.current?.[panelInstanceKey]?.collaborationInterruptedRequestId === 'string'
        ? terminalPanelsRef.current[panelInstanceKey].collaborationInterruptedRequestId.trim()
        : ''
      if (interruptedRequestId !== summaryRequestId) {
        const message = error instanceof Error && error.message ? error.message : t('摘要创建子任务失败')
        await showAlert(message)
      }
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        activeRequestId: '',
        isCondensingContext: false,
        collaborationLocked: false,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
        collaborationPendingMode: '',
        collaborationPendingRequestId: '',
        collaborationInterruptedRequestId: '',
        collaborationStatusStartedAtMs: 0,
        collaborationStatusFirstTokenAtMs: 0,
        collaborationStatusText: '',
        collaborationStatusReasoningText: '',
      }))
      return false
    }
  }, [continueAIConversationSummarySubtask, panelInstanceKey, setComposerImages, setComposerInputValue, setPanelState, showAlert, t, terminalId])

  const handleCondenseContextFullSummary = useCallback(async () => {
    if (!activeConversation || runtimePhase !== 'ready' || panelState.isCondensingContext) {
      return
    }
    void runAIConversationSummarySubtaskFlow(activeConversation)
  }, [activeConversation, panelState.isCondensingContext, runAIConversationSummarySubtaskFlow, runtimePhase])

  const resumeAIChatFromConversation = useCallback(async (conversationSnapshot: AIConversationSnapshot, targetPanelKey = panelInstanceKey, options: Record<string, unknown> = {}) => {
    if (!conversationSnapshot || !effectiveProviderId) {
      return false
    }
    const normalizedOptions = options && typeof options === 'object' ? options : {}
    const requestApiMessages = Array.isArray(conversationSnapshot.apiMessages) ? conversationSnapshot.apiMessages : []
    if (requestApiMessages.length === 0) {
      return false
    }
    const requestMessages = buildRequestMessages(requestApiMessages)
    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const keepCollaborationActive = normalizedOptions.keepCollaborationActive === true
    const collaborationMode = keepCollaborationActive
      ? (typeof normalizedOptions.collaborationMode === 'string' && normalizedOptions.collaborationMode.trim() ? normalizedOptions.collaborationMode.trim() : 'summary_subtask')
      : ''
    const collaborationStatusText = typeof normalizedOptions.collaborationStatusText === 'string' ? normalizedOptions.collaborationStatusText : ''
    const collaborationStatusReasoningText = typeof normalizedOptions.collaborationStatusReasoningText === 'string' ? normalizedOptions.collaborationStatusReasoningText : ''
    const recoverableToolStopReason = typeof normalizedOptions.recoverableToolStopReason === 'string' ? normalizedOptions.recoverableToolStopReason : ''
    const autoRecoverySubtaskHops = Number.isFinite(Number(normalizedOptions.autoRecoverySubtaskHops))
      ? Math.max(0, Math.trunc(Number(normalizedOptions.autoRecoverySubtaskHops)))
      : 0
    const assistantMessage = {
      id: requestId,
      turnId: requestId,
      kind: 'assistant',
      text: '▍',
      time: formatMessageTime(),
      metrics: [],
      streaming: true,
      extra: {
        apiLengthBefore: requestApiMessages.length,
        statusStartedAtMs: Date.now(),
        firstTokenAtMs: 0,
        requestStatusLive: true,
        errorText: '',
      },
    }
    const nextConversation = {
      ...conversationSnapshot,
      updatedAt: Date.now(),
      status: 'streaming',
      messages: [...(conversationSnapshot.messages || []), assistantMessage],
      apiMessages: requestApiMessages,
    }

    requestConversationSmoothScrollToBottom()
    if (!conversationSnapshot.transient) {
      setConversationList((prev) => upsertConversationSummary(prev, nextConversation))
    }
    setPanelState(targetPanelKey, {
      activeConversationId: conversationSnapshot.id,
      conversation: nextConversation,
      messages: nextConversation.messages,
      apiMessages: requestApiMessages,
      activeRequestId: requestId,
      activeAssistantMessageId: requestId,
      activeToolExecution: null,
      requestPhase: 'streaming',
      runtimePhase: 'api_request',
      queuedSubmission: null,
      isFlushingQueuedSubmission: false,
      skipNextAutomaticRequest: false,
      resumeAfterCancelRequestId: '',
      recoverableToolStopReason: '',
      lastAssistantTurnId: requestId,
      lastTurnBusinessMessageKind: '',
      isCondensingContext: keepCollaborationActive,
      collaborationLocked: keepCollaborationActive ? true : shouldLockAssistantCollaboration,
      collaborationActive: keepCollaborationActive,
      collaborationMode,
      collaborationStreamBuffer: '',
      collaborationAwaitingManualFollowup: false,
      collaborationFollowupRequestId: '',
      collaborationInterruptedRequestId: '',
      collaborationStatusStartedAtMs: keepCollaborationActive ? Date.now() : 0,
      collaborationStatusFirstTokenAtMs: 0,
      collaborationStatusText: keepCollaborationActive ? collaborationStatusText : '',
      collaborationStatusReasoningText: keepCollaborationActive ? collaborationStatusReasoningText : '',
    })

    try {
      await startAIChat(requestId, {
        conversationId: conversationSnapshot.id,
        sessionId: terminalId,
        autoApprove: effectiveAutoApprovalEnabled,
        skipNextAutomaticRequest: false,
        isDemon: Boolean(isDevilMode),
        toolScope: typeof conversationSnapshot?.toolScope === 'string' && conversationSnapshot.toolScope.trim() ? conversationSnapshot.toolScope.trim() : undefined,
        toolScopeSlot: typeof conversationSnapshot?.toolScopeSlot === 'string' && conversationSnapshot.toolScopeSlot.trim() ? conversationSnapshot.toolScopeSlot.trim() : undefined,
        autoRecoverySubtaskHops,
        messages: requestMessages,
      })
      return true
    } catch (error) {
      const errorText = error instanceof Error ? error.message : translate('请求失败')
      const erroredConversation = {
        ...nextConversation,
        updatedAt: Date.now(),
        status: 'error',
        messages: (nextConversation.messages || []).map((message: AIMessage) => {
          if (message.id !== requestId || message.kind !== 'assistant') {
            return message
          }
          return {
            ...message,
            text: '',
            metrics: [],
            streaming: false,
            extra: {
              ...(message.extra || {}),
              requestStatusLive: false,
              errorText,
            },
          }
        }),
      }

      setPanelState(targetPanelKey, {
        activeConversationId: conversationSnapshot.id,
        conversation: erroredConversation,
        messages: erroredConversation.messages,
        apiMessages: requestApiMessages,
        activeRequestId: '',
        activeAssistantMessageId: '',
        activeToolExecution: null,
        requestPhase: 'idle',
        toolApprovalMode: '',
        runtimePhase: 'ready',
        queuedSubmission: null,
        isFlushingQueuedSubmission: false,
        skipNextAutomaticRequest: false,
        resumeAfterCancelRequestId: '',
        recoverableToolStopReason,
        isCondensingContext: false,
        activeChangeReview: null,
        collaborationLocked: false,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
      })
      await saveConversationSnapshot(erroredConversation, targetPanelKey)
      return false
    }
  }, [effectiveAutoApprovalEnabled, effectiveProviderId, isDevilMode, panelInstanceKey, requestConversationSmoothScrollToBottom, saveConversationSnapshot, setPanelState, shouldLockAssistantCollaboration, terminalId])
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


  const handleCancelMessage = useCallback(async () => {
    if (!panelState.activeRequestId) {
      return
    }
    await cancelAIChat(panelState.activeRequestId)
  }, [panelState.activeRequestId])

  const handleStopAndResumeMessage = useCallback(async () => {
    if (!panelState.activeRequestId || !activeConversation) {
      return
    }
    const requestId = panelState.activeRequestId
    setPanelState(panelInstanceKey, (current) => ({
      ...current,
      resumeAfterCancelRequestId: requestId,
    }))
    try {
      await cancelAIChat(requestId)
    } catch {
      setPanelState(panelInstanceKey, (current) => ({
        ...current,
        resumeAfterCancelRequestId: '',
      }))
    }
  }, [activeConversation, panelInstanceKey, panelState.activeRequestId, setPanelState])

  const handleResumeTask = useCallback(async () => {
    const currentPanel = terminalPanelsRef.current[panelInstanceKey] || null
    const conversationSnapshot = currentPanel?.conversation || activeConversation
    if (!conversationSnapshot) {
      return false
    }
    return resumeAIChatFromConversation(conversationSnapshot, panelInstanceKey)
  }, [activeConversation, panelInstanceKey, resumeAIChatFromConversation])

  const handleApproveTools = useCallback(async () => {
    if (!panelState.activeRequestId) {
      return
    }
    await approveAIChatTools(panelState.activeRequestId)
  }, [panelState.activeRequestId])

  const handleRejectTools = useCallback(async () => {
    if (!panelState.activeRequestId) {
      return
    }
    if (normalizedGlobalAISettings.continueAfterToolRejection !== false) {
      await rejectAIChatTools(panelState.activeRequestId)
      return
    }
    await rejectAIChatToolsForQueuedSubmission(panelState.activeRequestId)
  }, [normalizedGlobalAISettings.continueAfterToolRejection, panelState.activeRequestId])

  const handleContinueTool = useCallback(async () => {
    if (!panelState.activeRequestId) {
      return
    }
    await continueAIChatTool(panelState.activeRequestId)
  }, [panelState.activeRequestId])

  const handleTerminateTool = useCallback(async () => {
    if (!panelState.activeRequestId) {
      return
    }
    await terminateAIChatTool(panelState.activeRequestId)
  }, [panelState.activeRequestId])

  const handlePreviewRestore = useCallback(async (restoreArtifactPath: string) => {
    try {
      const review = await previewAIChatToolRestore(restoreArtifactPath, terminalId)
      if (typeof window !== 'undefined' && review && typeof review === 'object') {
        window.dispatchEvent(new CustomEvent('ai-change-review-preview', {
          detail: { sessionId: terminalId, tabId: workspaceTabId, review },
        }))
      }
    } catch (error) {
      // error.message 为后端动态文案（可能不在翻译表），translate() 内部有兜底
      await showAlert(error instanceof Error ? translate(error.message as I18nKey) : translate('当前状态不支持还原'))
    }
  }, [showAlert, terminalId, workspaceTabId])

  const handlePreviewDiff = useCallback(async (restoreArtifactPath: string) => {
    try {
      const review = await previewAIChatToolDiff(restoreArtifactPath, terminalId)
      return review && typeof review === 'object' ? review : null
    } catch {
      return null
    }
  }, [terminalId])

  const handleApplyRestore = useCallback(async (restoreArtifactPath: string) => {
    try {
      await restoreAIChatTool(restoreArtifactPath, terminalId)
      clearRestorePreview()
      addToast?.(translate('已还原'), 'success', 3200)
      return true
    } catch (error) {
      // error.message 为后端动态文案（可能不在翻译表），translate() 内部有兜底
      await showAlert(error instanceof Error ? translate(error.message as I18nKey) : translate('当前状态不支持还原'))
      return false
    }
  }, [addToast, clearRestorePreview, showAlert, terminalId, translate])

  const handleListCommandTerminalCandidates = useCallback(async () => {
    if (!panelState.activeRequestId) {
      return []
    }
    const candidates = await listAIChatCommandTerminalCandidates(panelState.activeRequestId)
    return candidates.map((candidate) => ({
      ...candidate,
      label: terminalLabelMap.get(candidate.sessionId) || candidate.sessionId,
      current: candidate.current === true || candidate.sessionId === terminalId,
    }))
  }, [panelState.activeRequestId, terminalId, terminalLabelMap])

  const handleAssignToolTerminal = useCallback(async (targetSessionId: string) => {
    if (!panelState.activeRequestId) {
      return
    }
    await assignAIChatToolTerminal(panelState.activeRequestId, targetSessionId)
  }, [panelState.activeRequestId])

  const handleToggleSkipNextAutomaticRequest = useCallback(async (enabled: boolean) => {
    let targetRequestId = ''
    setPanelState(panelInstanceKey, (current) => {
      targetRequestId = current.activeRequestId || ''
      return {
        ...current,
        skipNextAutomaticRequest: Boolean(enabled),
      }
    })
    if (targetRequestId) {
      try {
        await setAIChatSkipNextAutomaticRequest(targetRequestId, Boolean(enabled))
      } catch {}
    }
  }, [panelInstanceKey, setPanelState])

  const handleInterruptCollaboration = useCallback(async () => {
    let targetRequestId = ''
    let targetMode = ''
    setPanelState(panelInstanceKey, (current) => {
      targetRequestId = current.activeRequestId || ''
      targetMode = typeof current.collaborationMode === 'string' ? current.collaborationMode.trim() : ''
      return {
        ...current,
        activeRequestId: targetMode === 'summary_subtask' ? '' : current.activeRequestId,
        isCondensingContext: targetMode === 'summary_subtask' ? false : current.isCondensingContext,
        collaborationLocked: false,
        collaborationActive: false,
        collaborationMode: '',
        collaborationStreamBuffer: '',
        collaborationAwaitingManualFollowup: false,
        collaborationFollowupRequestId: '',
        collaborationPendingMode: '',
        collaborationPendingRequestId: '',
        collaborationInterruptedRequestId: targetRequestId,
        collaborationStatusStartedAtMs: 0,
        collaborationStatusFirstTokenAtMs: 0,
        collaborationStatusText: '',
        collaborationStatusReasoningText: '',
      }
    })
    if (targetRequestId) {
      try {
        if (targetMode === 'summary_subtask') {
          await cancelAIChat(targetRequestId)
        } else {
          await disableAIChatCollaboration(targetRequestId)
        }
      } catch {}
    }
  }, [panelInstanceKey, setPanelState])

  const handleCancelQueuedSubmission = useCallback(() => {
    setPanelState(panelInstanceKey, (current) => ({
      ...current,
      queuedSubmission: null,
      isFlushingQueuedSubmission: false,
    }))
  }, [panelInstanceKey, setPanelState])

  useEffect(() => {
    const queuedSubmission = panelState.queuedSubmission
    if (!queuedSubmission || panelState.isFlushingQueuedSubmission || isQueueBlocked) {
      return
    }

    let disposed = false

    setPanelState(panelInstanceKey, (current) => {
      if (!current.queuedSubmission || current.queuedSubmission.id !== queuedSubmission.id) {
        return current
      }
      return {
        ...current,
        isFlushingQueuedSubmission: true,
      }
    })

    void (async () => {
      let accepted = false
      try {
        if (queuedSubmission.kind === 'retry_assistant') {
          accepted = await handleRetryAssistantMessage(queuedSubmission.targetMessageId) === true
        } else {
          accepted = await handleSendMessage(
            queuedSubmission.text,
            { images: queuedSubmission.images },
            queuedSubmission.kind === 'chat'
              ? null
              : {
                  mode: queuedSubmission.kind === 'edit' ? 'edit' : 'retry',
                  targetMessageId: queuedSubmission.targetMessageId,
                  targetMessageText: queuedSubmission.targetMessageText,
                },
            {
              forceImmediate: true,
              toolScope: queuedSubmission.toolScope,
              toolScopeSlot: queuedSubmission.toolScopeSlot,
              forceNewConversation: queuedSubmission.forceNewConversation === true,
            },
          ) !== false
        }
      } finally {
        if (disposed && !panelMountedRef.current) {
          return
        }
        setPanelState(panelInstanceKey, (current) => {
          if (!current.queuedSubmission || current.queuedSubmission.id !== queuedSubmission.id) {
            return {
              ...current,
              isFlushingQueuedSubmission: false,
            }
          }
          return {
            ...current,
            queuedSubmission: null,
            isFlushingQueuedSubmission: false,
          }
        })
      }
    })()

    return () => {
      disposed = true
    }
  }, [handleRetryAssistantMessage, handleSendMessage, isQueueBlocked, panelInstanceKey, panelState.isFlushingQueuedSubmission, panelState.queuedSubmission, setPanelState])

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
