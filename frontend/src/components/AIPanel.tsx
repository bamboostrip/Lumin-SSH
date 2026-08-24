import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Bot, CheckSquare, ChevronLeft, ChevronRight, FolderOpen, FolderPlus, Loader2, Pencil, Scissors, Search, Trash2 } from 'lucide-react'
import { EventsOn } from '../../wailsjs/runtime/runtime.js'
import * as AppGo from '../../wailsjs/go/wailsapp/App.js'
import { useTranslation, t as translate, getLanguage, type I18nKey } from '../i18n.ts'
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
// AIPanel：AI 工作区多标签管理外壳。单个标签页面板见 ./ai/AIConversationTabPanel.tsx。
// ============================================================

import { AIConversationTabPanel } from './ai/AIConversationTabPanel.tsx'

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
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        padding: '4px 6px 0',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-base)',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
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
              style={{
                flex: '0 0 auto',
                width: 176,
                minWidth: 132,
                maxWidth: 220,
                display: 'flex',
                alignItems: 'center',
                border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
                borderBottom: active ? '1px solid var(--surface-raised)' : '1px solid transparent',
                borderRadius: '8px 8px 0 0',
                background: active ? 'var(--surface-raised)' : 'transparent',
                marginBottom: -1,
              }}>
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
                  style={{
                    minWidth: 0,
                    flex: '1 1 auto',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: 7,
                    padding: '0 8px 0 10px',
                    border: 'none',
                    position: 'relative',
                    background: 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                  {running ? <span aria-label={t('执行中')} style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 }} /> : null}
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{index + 1}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tabTitle}</span>
                  {transient ? (
                    <span title={t('临时会话')} style={{ flexShrink: 0, padding: '1px 5px', borderRadius: 4, background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent)', fontSize: 10, fontWeight: 600 }}>
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
                  style={{ width: 24, height: 24, marginRight: 4, padding: 0, border: 'none', borderRadius: 5, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, fontSize: 15, lineHeight: 1 }}>
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
        style={{
          width: 30,
          border: 'none',
          borderBottom: '2px solid transparent',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 18,
          flexShrink: 0,
        }}>
        +
      </button>
    </div>
  )
  return (
    <div style={{ width, minWidth: width, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {tabGroup.tabs.map((tab) => (
        <div key={tab.id} style={{ position: 'absolute', inset: 0, display: activeTabId === tab.id ? 'flex' : 'none' }}>
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
