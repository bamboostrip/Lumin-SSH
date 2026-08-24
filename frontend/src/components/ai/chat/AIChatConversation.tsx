import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useTranslation, t } from '../../../i18n.ts'
import { Z } from '../../../constants/zIndex.ts'
import { cn } from '../../../utils/cn.ts'
import AIChatAssistantTurn from './AIChatAssistantTurn.tsx'
import AIChatContextCondenseCard from './AIChatContextCondenseCard.tsx'
import AIChatReasoningBlock from './AIChatReasoningBlock.tsx'
import AIChatToolSessionPane, { type AIChatToolSessionItem } from './AIChatToolSessionPane.tsx'
import AIChatUserMessage from './AIChatUserMessage.tsx'
import { groupConversationMessages } from './aiChatMessageTopology.ts'

/** 发送性能指标记录（宽松形状，来自 AIPanel） */
interface SendPerfRecord {
  stages?: Array<{ ms?: unknown; label?: unknown }>
  total?: unknown
}

function formatSendPerfMetrics(record: unknown) {
  const r = record as SendPerfRecord | null | undefined
  if (!r || !Array.isArray(r.stages) || r.stages.length === 0) {
    return ''
  }
  const total = Number(r.total) || 0
  const lines = r.stages.map((stage, index) => {
    const ms = Number(stage.ms) || 0
    const percent = total > 0 ? ((ms / total) * 100).toFixed(1) : '0.0'
    return `${index + 1}.${stage.label} -> ${ms.toFixed(1)}ms (${percent}%)`
  })
  lines.push(`${t('总计')} -> ${total.toFixed(1)}ms`)
  return lines.join('\n')
}

function resolveSendPerfMetrics(sendPerfMetricsRef: { current: Map<string, unknown> | null } | null | undefined, messageId: unknown) {
  const normalizedId = typeof messageId === 'string' ? messageId.trim() : ''
  if (!normalizedId || !sendPerfMetricsRef?.current) {
    return ''
  }
  return formatSendPerfMetrics(sendPerfMetricsRef.current.get(normalizedId))
}

/** 会话消息条目（aiChatMessageTopology.js 分组后的宽松形状） */
export type GroupedConversationEntry =
  | { id?: string; type: 'user'; message?: { id?: string; text?: string; time?: string; images?: unknown[]; extra?: Record<string, unknown> } }
  | { id?: string; type: 'assistant-turn'; turnId?: string; assistant?: { id?: string; title?: string; time?: string; text?: string; streaming?: boolean; extra?: Record<string, unknown> }; reasoning?: Array<{ id: string; text?: string; duration?: string }>; tools?: AIChatToolSessionItem[] }
  | { id?: string; type: 'reasoning'; message?: { id?: string; text?: string; duration?: string } }
  | { id?: string; type: 'context-condense'; message?: Record<string, unknown> }
  | { id?: string; type: 'tool-session'; tools?: AIChatToolSessionItem[] }

interface ConversationHandlers {
  onSendUserMessage?: (text: string) => void
  onRetryUserMessage?: (id: string, text: string, images: string[]) => void
  onRetryAssistantMessage?: (id: string) => void
  onEditUserMessage?: (id: string, text: string, images: string[]) => void
  onDeleteMessage?: (id: string) => void
  onPreviewRestore?: (artifactPath: string, targetTerminalId: string) => void
  onPreviewDiffFetch?: (artifactPath: string, targetTerminalId: string) => void
  onApplyRestore?: (artifactPath: string, targetTerminalId: string) => void
  followupInteractionLocked?: boolean
  messageActionBarAtBottom?: boolean
  sendPerfMetricsRef?: { current: Map<string, unknown> | null } | null
  isEditingTarget?: boolean
}

interface ConversationEntryMeta {
  isLastAssistantTurn?: boolean
  hasSubsequentAssistantMessage?: boolean
  isFirstUserMessage?: boolean
}

function renderGroupedEntry(entry: GroupedConversationEntry, handlers: ConversationHandlers, entryMeta: ConversationEntryMeta = {}) {
  switch (entry.type) {
    case 'user':
      return (
        <AIChatUserMessage
          message={entry.message}
          onRetry={handlers.onRetryUserMessage}
          onEdit={handlers.onEditUserMessage}
          onDelete={handlers.onDeleteMessage}
          messageActionBarAtBottom={Boolean(handlers.messageActionBarAtBottom)}
          perfMetricsText={resolveSendPerfMetrics(handlers.sendPerfMetricsRef, entry.message?.id)}
          isEditingTarget={Boolean(handlers.isEditingTarget)}
          isFirstUserMessage={Boolean(entryMeta.isFirstUserMessage)}
        />
      )
    case 'assistant-turn':
      return (
        <AIChatAssistantTurn
          assistant={entry.assistant}
          reasoning={entry.reasoning}
          tools={entry.tools}
          isLastAssistantTurn={Boolean(entryMeta.isLastAssistantTurn)}
          hasSubsequentAssistantMessage={Boolean(entryMeta.hasSubsequentAssistantMessage)}
          onDelete={handlers.onDeleteMessage}
          onRetry={handlers.onRetryAssistantMessage}
          onSendUserMessage={handlers.onSendUserMessage}
          onPreviewRestore={handlers.onPreviewRestore}
          onPreviewDiffFetch={handlers.onPreviewDiffFetch}
          onApplyRestore={handlers.onApplyRestore}
          followupInteractionLocked={Boolean(handlers.followupInteractionLocked)}
          messageActionBarAtBottom={Boolean(handlers.messageActionBarAtBottom)}
          perfMetricsText={resolveSendPerfMetrics(handlers.sendPerfMetricsRef, entry.assistant?.id)}
        />
      )
    case 'reasoning':
      return <AIChatReasoningBlock text={entry.message?.text || ''} duration={entry.message?.duration || ''} />
    case 'context-condense':
      return <AIChatContextCondenseCard message={entry.message} />
    case 'tool-session':
      return <AIChatToolSessionPane items={entry.tools || []} onSendUserMessage={handlers.onSendUserMessage} onPreviewRestore={handlers.onPreviewRestore} onPreviewDiffFetch={handlers.onPreviewDiffFetch} onApplyRestore={handlers.onApplyRestore} followupInteractionLocked={Boolean(handlers.followupInteractionLocked)} />
    default:
      return null
  }
}

function getEntryKey(entry: GroupedConversationEntry, index: number) {
  if (entry?.id) {
    return entry.id
  }
  if (entry?.type === 'assistant-turn') {
    return entry.turnId || entry.assistant?.id || `assistant-${index}`
  }
  if (entry?.type === 'user') {
    return entry.message?.id || `user-${index}`
  }
  if (entry?.type === 'reasoning') {
    return entry.message?.id || `reasoning-${index}`
  }
  return `entry-${index}`
}

function getLastAssistantTurnIndex(entries: GroupedConversationEntry[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.type === 'assistant-turn') {
      return index
    }
  }
  return -1
}

function hasSubsequentAssistantTurn(entries: GroupedConversationEntry[], currentIndex: number) {
  for (let index = currentIndex + 1; index < entries.length; index += 1) {
    if (entries[index]?.type === 'assistant-turn') {
      return true
    }
  }
  return false
}

// 入场/高亮动画 ai-chat-msg-enter-left|right / ai-chat-message-flash（keyframes 已上收全局样式表）
function getAIChatMessageEntryAnimationClass(entry: GroupedConversationEntry) {
  if (entry?.type === 'user') {
    return 'animate-[ai-chat-msg-enter-right_1500ms_cubic-bezier(0.16,1,0.3,1)_both]'
  }
  return 'animate-[ai-chat-msg-enter-left_1500ms_cubic-bezier(0.16,1,0.3,1)_both]'
}

function isVerticallyScrollableElement(element: Element) {
  if (!(element instanceof HTMLElement)) {
    return false
  }
  if (element.scrollHeight <= element.clientHeight + 1) {
    return false
  }
  const overflowY = window.getComputedStyle(element).overflowY
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
}

function collectScrollableAncestorsWithinContainer(target: EventTarget | null, container: HTMLElement | null) {
  const ancestors: HTMLElement[] = []
  let current = target instanceof HTMLElement ? target : null
  while (current && current !== container) {
    if (isVerticallyScrollableElement(current)) {
      ancestors.push(current)
    }
    current = current.parentElement
  }
  return ancestors
}

function canScrollableElementConsumeDelta(element: Element, deltaY: number) {
  if (!(element instanceof HTMLElement) || Math.abs(Number(deltaY) || 0) < 1) {
    return false
  }
  const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0)
  if (deltaY < 0) {
    return element.scrollTop > 0
  }
  return element.scrollTop < maxScrollTop - 1
}

function shouldIgnoreConversationScrollIntentFromNestedScroller(target: EventTarget | null, container: HTMLElement | null, deltaY: number | null = null) {
  if (!(container instanceof HTMLElement)) {
    return false
  }
  const scrollableAncestors = collectScrollableAncestorsWithinContainer(target, container)
  if (scrollableAncestors.length <= 1) {
    return false
  }
  const nearestScrollable = scrollableAncestors[0]
  const outermostScrollable = scrollableAncestors[scrollableAncestors.length - 1]
  if (nearestScrollable === outermostScrollable) {
    return false
  }
  if (typeof deltaY === 'number') {
    return canScrollableElementConsumeDelta(nearestScrollable, deltaY)
  }
  return true
}

function getTouchClientY(event: React.TouchEvent | React.TouchEvent<HTMLElement>) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0]
  const value = Number(touch?.clientY)
  return Number.isFinite(value) ? value : null
}

export interface AIChatConversationProps {
  messages?: unknown[]
  sessionId?: string
  terminalId?: string
  conversationId?: string
  tabId?: string
  onSendUserMessage?: (text: string) => void
  onRetryUserMessage?: (id: string, text: string, images: string[]) => void
  onRetryAssistantMessage?: (id: string) => void
  onEditUserMessage?: (id: string, text: string, images: string[]) => void
  onDeleteMessage?: (id: string) => void
  onPreviewRestore?: (artifactPath: string, targetTerminalId: string) => void
  onPreviewDiffFetch?: (artifactPath: string, targetTerminalId: string) => void
  onApplyRestore?: (artifactPath: string, targetTerminalId: string) => void
  followupInteractionLocked?: boolean
  messageActionBarAtBottom?: boolean
  messageNavEnabled?: boolean
  side?: string
  scrollToBottomSignal?: number
  sendPerfMetricsRef?: { current: Map<string, unknown> | null } | null
  editingTargetMessageId?: string
}

export default function AIChatConversation({ messages = [], sessionId = '', terminalId = '', conversationId = '', tabId = '', onSendUserMessage, onRetryUserMessage, onRetryAssistantMessage, onEditUserMessage, onDeleteMessage, onPreviewRestore, onPreviewDiffFetch, onApplyRestore, followupInteractionLocked = false, messageActionBarAtBottom = false, messageNavEnabled = true, side = 'right', scrollToBottomSignal = 0, sendPerfMetricsRef = null, editingTargetMessageId = '' }: AIChatConversationProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const scrollerElementRef = useRef<HTMLElement | null>(null)
  const followIntentRef = useRef(true)
  const scrollAnimationFrameRef = useRef(0)
  const lastContainerHeightRef = useRef(0)
  const lastTouchClientYRef = useRef<number | null>(null)
  const isScrollbarDraggingRef = useRef(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [highlightedEntryKey, setHighlightedEntryKey] = useState('')
  const [hoveredNavIndex, setHoveredNavIndex] = useState(-1)
  const isLeftSide = side !== 'left'
  const groupedMessages = useMemo(() => groupConversationMessages(messages) as GroupedConversationEntry[], [messages])
  const lastAssistantTurnIndex = useMemo(() => getLastAssistantTurnIndex(groupedMessages), [groupedMessages])
  const firstUserMessageIndex = useMemo(() => groupedMessages.findIndex((entry) => entry?.type === 'user'), [groupedMessages])
  const userMessageEntries = useMemo(() => {
    const result: Array<{ entry: Extract<GroupedConversationEntry, { type: 'user' }>; index: number }> = []
    groupedMessages.forEach((entry, idx) => {
      if (entry?.type === 'user' && entry.message) {
        result.push({ entry, index: idx })
      }
    })
    return result
  }, [groupedMessages])

  const suspendFollow = useCallback(() => {
    const scroller = scrollerElementRef.current
    if (!(scroller instanceof HTMLElement) || scroller.scrollHeight <= scroller.clientHeight + 1) {
      return
    }
    followIntentRef.current = false
    setShowScrollToBottom(true)
  }, [])

  const handleJumpToUserMessage = useCallback((targetIndex: number, entry: GroupedConversationEntry) => {
    followIntentRef.current = false
    setShowScrollToBottom(true)
    if (typeof virtuosoRef.current?.scrollToIndex === 'function') {
      // ponytail: auto(瞬跳)而非smooth, Virtuoso对未渲染的远端item只能按均高估算,
      // smooth会停在估算位置需要多点几次; auto能快速多次修正到准确位置
      virtuosoRef.current.scrollToIndex({
        index: targetIndex,
        align: 'center',
        behavior: 'auto',
      })
    }
    setHighlightedEntryKey(getEntryKey(entry, targetIndex))
  }, [])

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (groupedMessages.length === 0) {
      return
    }
    if (typeof virtuosoRef.current?.scrollToIndex === 'function') {
      virtuosoRef.current.scrollToIndex({
        index: groupedMessages.length - 1,
        align: 'end',
        behavior,
      })
      return
    }
    const scroller = scrollerElementRef.current
    if (scroller instanceof HTMLElement) {
      if (typeof scroller.scrollTo === 'function') {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior })
      } else {
        scroller.scrollTop = scroller.scrollHeight
      }
      return
    }
    virtuosoRef.current?.scrollTo?.({
      top: Number.MAX_SAFE_INTEGER,
      behavior,
    })
  }, [groupedMessages.length])

  const scheduleScrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto', force = false) => {
    if (groupedMessages.length === 0) {
      return
    }
    if (!force && !followIntentRef.current) {
      return
    }
    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current)
    }
    scrollAnimationFrameRef.current = requestAnimationFrame(() => {
      scrollAnimationFrameRef.current = 0
      scrollToBottom(behavior)
    })
  }, [groupedMessages.length, scrollToBottom])

  useEffect(() => {
    if (groupedMessages.length === 0) {
      followIntentRef.current = true
      lastContainerHeightRef.current = 0
      setShowScrollToBottom(false)
    }
  }, [groupedMessages.length])

  useEffect(() => {
    if (groupedMessages.length === 0) {
      return
    }
    followIntentRef.current = true
    setShowScrollToBottom(false)
    scheduleScrollToBottom('auto', true)
  }, [conversationId, scheduleScrollToBottom])

  useEffect(() => {
    if (!scrollToBottomSignal || groupedMessages.length === 0) {
      return
    }
    followIntentRef.current = true
    setShowScrollToBottom(false)
    scheduleScrollToBottom('smooth', true)
  }, [groupedMessages.length, scheduleScrollToBottom, scrollToBottomSignal])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver !== 'function') {
      return undefined
    }
    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect?.height || 0
      if (!nextHeight) {
        return
      }
      if (!lastContainerHeightRef.current) {
        lastContainerHeightRef.current = nextHeight
        return
      }
      if (Math.abs(nextHeight - lastContainerHeightRef.current) < 1) {
        return
      }
      lastContainerHeightRef.current = nextHeight
      scheduleScrollToBottom('auto')
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [scheduleScrollToBottom])

  useEffect(() => {
    return () => {
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!highlightedEntryKey) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      setHighlightedEntryKey('')
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [highlightedEntryKey])

  useEffect(() => {
    const handleLocateConversationDiffItem = (event: Event) => {
      const detail = (event as CustomEvent).detail as Record<string, unknown> | undefined
      const targetSessionId = typeof detail?.sessionId === 'string' ? detail.sessionId.trim() : ''
      const targetTerminalId = typeof detail?.terminalId === 'string' ? detail.terminalId.trim() : ''
      const targetTabId = typeof detail?.tabId === 'string' ? detail.tabId.trim() : ''
      const targetMessageId = typeof detail?.messageId === 'string' ? detail.messageId.trim() : ''
      if (!targetMessageId) {
        return
      }
      if (targetSessionId && targetSessionId !== sessionId) {
        return
      }
      if (targetTerminalId && targetTerminalId !== terminalId) {
        return
      }
      if (targetTabId && targetTabId !== tabId) {
        return
      }

      const targetIndex = groupedMessages.findIndex((entry) => {
        if (!entry || typeof entry !== 'object') {
          return false
        }
        if (entry.type === 'assistant-turn') {
          if (entry.assistant?.id === targetMessageId || entry.turnId === targetMessageId) {
            return true
          }
          return Array.isArray(entry.tools) && entry.tools.some((tool) => tool?.id === targetMessageId)
        }
        if (entry.type === 'user' || entry.type === 'reasoning' || entry.type === 'context-condense') {
          return entry.message?.id === targetMessageId
        }
        if (entry.type === 'tool-session') {
          return Array.isArray(entry.tools) && entry.tools.some((tool) => tool?.id === targetMessageId)
        }
        return false
      })

      if (targetIndex < 0) {
        return
      }

      const targetEntry = groupedMessages[targetIndex]
      const targetEntryKey = getEntryKey(targetEntry, targetIndex)
      suspendFollow()
      if (typeof virtuosoRef.current?.scrollToIndex === 'function') {
        virtuosoRef.current.scrollToIndex({
          index: targetIndex,
          align: 'center',
          behavior: 'smooth',
        })
      } else {
        virtuosoRef.current?.scrollTo?.({
          top: Number.MAX_SAFE_INTEGER,
          behavior: 'smooth',
        })
      }
      setHighlightedEntryKey(targetEntryKey)
    }

    window.addEventListener('ai-conversation-diff-locate', handleLocateConversationDiffItem)
    return () => {
      window.removeEventListener('ai-conversation-diff-locate', handleLocateConversationDiffItem)
    }
  }, [groupedMessages, sessionId, suspendFollow, tabId, terminalId])

  const handleScrollToBottom = useCallback(() => {
    followIntentRef.current = true
    setShowScrollToBottom(false)
    scrollToBottom('auto')
  }, [scrollToBottom])

  const handleUserWheelCapture = useCallback((event: React.WheelEvent) => {
    const deltaY = Number(event?.deltaY) || 0
    if (deltaY >= -1) {
      return
    }
    if (shouldIgnoreConversationScrollIntentFromNestedScroller(event?.target, containerRef.current, deltaY)) {
      return
    }
    suspendFollow()
  }, [suspendFollow])

  const handleUserTouchStartCapture = useCallback((event: React.TouchEvent) => {
    lastTouchClientYRef.current = getTouchClientY(event)
  }, [])

  const handleUserTouchMoveCapture = useCallback((event: React.TouchEvent) => {
    const nextTouchClientY = getTouchClientY(event)
    const previousTouchClientY = lastTouchClientYRef.current
    lastTouchClientYRef.current = nextTouchClientY
    if (nextTouchClientY === null || previousTouchClientY === null) {
      return
    }
    const deltaY = previousTouchClientY - nextTouchClientY
    if (deltaY >= -1) {
      return
    }
    if (shouldIgnoreConversationScrollIntentFromNestedScroller(event?.target, containerRef.current, deltaY)) {
      return
    }
    suspendFollow()
  }, [suspendFollow])

  const handleUserTouchEndCapture = useCallback(() => {
    lastTouchClientYRef.current = null
  }, [])

  const handlePointerDownCapture = useCallback((event: React.PointerEvent) => {
    const scroller = scrollerElementRef.current
    if (!(scroller instanceof HTMLElement) || event?.target !== scroller) {
      return
    }
    const rect = scroller.getBoundingClientRect()
    const scrollbarWidth = Math.max(scroller.offsetWidth - scroller.clientWidth, 12)
    const isLeftScrollbar = getComputedStyle(scroller).direction === 'rtl'
    const clientX = Number(event?.clientX)
    const isScrollbar = isLeftScrollbar
      ? clientX <= rect.left + scrollbarWidth
      : clientX >= rect.right - scrollbarWidth
    if (isScrollbar) {
      isScrollbarDraggingRef.current = true
      suspendFollow()
    }
  }, [suspendFollow])

  const handlePointerEndCapture = useCallback(() => {
    if (!isScrollbarDraggingRef.current) {
      return
    }
    isScrollbarDraggingRef.current = false
    const scroller = scrollerElementRef.current
    if (!(scroller instanceof HTMLElement)) {
      return
    }
    const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 2
    followIntentRef.current = isAtBottom
    setShowScrollToBottom(!isAtBottom)
  }, [])

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerEndCapture)
    window.addEventListener('pointercancel', handlePointerEndCapture)
    window.addEventListener('blur', handlePointerEndCapture)
    return () => {
      window.removeEventListener('pointerup', handlePointerEndCapture)
      window.removeEventListener('pointercancel', handlePointerEndCapture)
      window.removeEventListener('blur', handlePointerEndCapture)
    }
  }, [handlePointerEndCapture])

  const handleKeyDownCapture = useCallback((event: React.KeyboardEvent) => {
    if (!['ArrowUp', 'PageUp', 'Home'].includes(event?.key)) {
      return
    }
    if (shouldIgnoreConversationScrollIntentFromNestedScroller(event?.target, containerRef.current, -1)) {
      return
    }
    suspendFollow()
  }, [suspendFollow])

  if (groupedMessages.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-transparent p-5">
        <div className="max-w-[260px] text-center text-sm leading-[1.8] text-tertiary">
          {t('选择供应商并发送消息后，AI会在这里按真实流式顺序输出内容。')}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onWheelCapture={handleUserWheelCapture}
      onTouchStartCapture={handleUserTouchStartCapture}
      onTouchMoveCapture={handleUserTouchMoveCapture}
      onTouchEndCapture={handleUserTouchEndCapture}
      onTouchCancelCapture={handleUserTouchEndCapture}
      onPointerDownCapture={handlePointerDownCapture}
      onKeyDownCapture={handleKeyDownCapture}
      className="relative min-h-0 h-full flex-1 overflow-x-hidden bg-transparent">
      <Virtuoso
        ref={virtuosoRef}
        scrollerRef={(element) => {
          scrollerElementRef.current = element instanceof HTMLElement ? element : null
          if (element instanceof HTMLElement) {
            element.style.overflowX = 'hidden'
            // ponytail: 面板在左侧时, direction: rtl 把滚动条翻到左侧(远离终端), 内容保持 LTR
            element.style.direction = isLeftSide ? 'rtl' : 'ltr'
          }
        }}
        style={{ height: '100%', overflowX: 'hidden' }}
        data={groupedMessages}
        alignToBottom={false}
        increaseViewportBy={{ top: 1200, bottom: 800 }}
        initialTopMostItemIndex={{ index: Math.max(groupedMessages.length - 1, 0), align: 'end' }}
        atBottomThreshold={2}
        followOutput={() => (followIntentRef.current ? 'auto' : false)}
        atBottomStateChange={(isAtBottom) => {
          if (isAtBottom && !isScrollbarDraggingRef.current) {
            followIntentRef.current = true
            setShowScrollToBottom(false)
            return
          }
          setShowScrollToBottom(!followIntentRef.current)
        }}
        computeItemKey={(index, entry) => getEntryKey(entry, index)}
        itemContent={(index, entry) => {
          const entryKey = getEntryKey(entry, index)
          const isHighlighted = highlightedEntryKey === entryKey
          const entryAnimClass = getAIChatMessageEntryAnimationClass(entry)
          const isEditingTargetEntry = entry?.type === 'user' && typeof entry?.message?.id === 'string' && entry.message.id.trim() && entry.message.id.trim() === editingTargetMessageId
          return (
            <div
              className={cn(
                '[direction:ltr] rounded-[14px] px-3.5',
                index === groupedMessages.length - 1 ? 'pb-[18px]' : 'pb-3.5',
                isHighlighted
                  ? 'animate-[ai-chat-message-flash_0.72s_ease-in-out_4] bg-[rgba(var(--accent-rgb),0.08)]'
                  : cn(entryAnimClass, 'bg-transparent'),
                '[transition:background_180ms_ease,box-shadow_180ms_ease]',
              )}>
              {renderGroupedEntry(entry, {
                onSendUserMessage,
                onRetryUserMessage,
                onRetryAssistantMessage,
                onEditUserMessage,
                onDeleteMessage,
                onPreviewRestore,
                onPreviewDiffFetch,
                onApplyRestore,
                followupInteractionLocked,
                messageActionBarAtBottom,
                sendPerfMetricsRef,
                isEditingTarget: Boolean(isEditingTargetEntry),
              }, {
                isLastAssistantTurn: index === lastAssistantTurnIndex,
                hasSubsequentAssistantMessage: hasSubsequentAssistantTurn(groupedMessages, index),
                isFirstUserMessage: index === firstUserMessageIndex,
              })}
            </div>
          )
        }}
      />
      {userMessageEntries.length >= 1 && messageNavEnabled ? (
        <div
          style={{ zIndex: Z.PANEL_BUTTON }}
          className={cn(
            'absolute bottom-[44px] top-[14px] flex flex-col items-center justify-center gap-[5px]',
            isLeftSide ? 'right-[3px]' : 'left-[3px]',
          )}>
          {userMessageEntries.map(({ entry, index }, navIndex) => {
            const navText = typeof entry.message?.text === 'string' ? entry.message.text.trim() : ''
            const navTime = typeof entry.message?.time === 'string' ? entry.message.time : ''
            const navPreview = navText.length > 60 ? navText.slice(0, 60) + '…' : navText
            const isNavHovered = hoveredNavIndex === navIndex
            return (
              <div
                key={entry.message?.id || `nav-${navIndex}`}
                className="relative flex justify-center"
                onMouseEnter={() => setHoveredNavIndex(navIndex)}
                onMouseLeave={() => setHoveredNavIndex(-1)}
              >
                <button
                  type="button"
                  onClick={() => handleJumpToUserMessage(index, entry)}
                  aria-label={navPreview || t('图片消息')}
                  style={{ transform: isNavHovered ? 'scale(1.4)' : 'scale(1)' }}
                  className={cn(
                    'h-[7px] w-[7px] cursor-pointer rounded-full border border-line p-0 [transition:transform_150ms_ease,background_150ms_ease,border-color_150ms_ease]',
                    isNavHovered ? 'bg-accent' : 'bg-overlay',
                  )}
                />
                {isNavHovered ? (
                  <div
                    style={{ zIndex: Z.POPUP }}
                    className={cn(
                      'pointer-events-none absolute top-1/2 w-max max-w-[240px] -translate-y-1/2 rounded-lg bg-[rgba(30,35,42,0.96)] px-2.5 py-1.5 text-sm leading-[1.5] text-white shadow-lg [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap',
                      isLeftSide ? 'right-full mr-2.5' : 'left-full ml-2.5',
                    )}>
                    {navTime ? <div className="mb-[3px] text-[10px] opacity-[0.55]">{navTime}</div> : null}
                    {navPreview || t('图片消息')}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {showScrollToBottom ? (
        <div
          style={{ zIndex: Z.PANEL_BUTTON }}
          className="pointer-events-none absolute bottom-2.5 right-3.5">
          <button
            type="button"
            onClick={handleScrollToBottom}
            className="pointer-events-auto inline-flex h-8 min-w-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line bg-overlay px-2.5 text-primary shadow-lg [transition:var(--transition)]">
            <ChevronDown size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
