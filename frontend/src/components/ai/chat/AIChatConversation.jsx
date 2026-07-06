import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useTranslation } from '../../../i18n.js'
import AIChatAssistantTurn from './AIChatAssistantTurn.jsx'
import AIChatContextCondenseCard from './AIChatContextCondenseCard.jsx'
import AIChatReasoningBlock from './AIChatReasoningBlock.jsx'
import AIChatToolSessionPane from './AIChatToolSessionPane.jsx'
import AIChatUserMessage from './AIChatUserMessage.jsx'
import { groupConversationMessages } from './aiChatMessageTopology.js'

function renderGroupedEntry(entry, handlers, entryMeta = {}) {
  switch (entry.type) {
    case 'user':
      return (
        <AIChatUserMessage
          message={entry.message}
          onRetry={handlers.onRetryUserMessage}
          onEdit={handlers.onEditUserMessage}
          onDelete={handlers.onDeleteMessage}
          messageActionBarAtBottom={Boolean(handlers.messageActionBarAtBottom)}
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
          messageActionBarAtBottom={Boolean(handlers.messageActionBarAtBottom)}
        />
      )
    case 'reasoning':
      return <AIChatReasoningBlock text={entry.message.text} duration={entry.message.duration} />
    case 'context-condense':
      return <AIChatContextCondenseCard message={entry.message} />
    case 'tool-session':
      return <AIChatToolSessionPane items={entry.tools} onSendUserMessage={handlers.onSendUserMessage} />
    default:
      return null
  }
}

function getEntryKey(entry, index) {
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

function getLastAssistantTurnIndex(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.type === 'assistant-turn') {
      return index
    }
  }
  return -1
}

function hasSubsequentAssistantTurn(entries, currentIndex) {
  for (let index = currentIndex + 1; index < entries.length; index += 1) {
    if (entries[index]?.type === 'assistant-turn') {
      return true
    }
  }
  return false
}

export default function AIChatConversation({ messages = [], onSendUserMessage, onRetryUserMessage, onRetryAssistantMessage, onEditUserMessage, onDeleteMessage, messageActionBarAtBottom = false, scrollToBottomSignal = 0 }) {
  const { t } = useTranslation()
  const containerRef = useRef(null)
  const virtuosoRef = useRef(null)
  const followIntentRef = useRef(true)
  const programmaticScrollRef = useRef(false)
  const programmaticScrollResetRef = useRef(0)
  const scrollAnimationFrameRef = useRef(0)
  const hasHydratedRef = useRef(false)
  const lastContainerHeightRef = useRef(0)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const groupedMessages = useMemo(() => groupConversationMessages(messages), [messages])
  const lastAssistantTurnIndex = useMemo(() => getLastAssistantTurnIndex(groupedMessages), [groupedMessages])

  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true
    if (programmaticScrollResetRef.current) {
      window.clearTimeout(programmaticScrollResetRef.current)
    }
    programmaticScrollResetRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false
      programmaticScrollResetRef.current = 0
    }, 480)
  }, [])

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    if (groupedMessages.length === 0) {
      return
    }
    markProgrammaticScroll()
    if (typeof virtuosoRef.current?.scrollToIndex === 'function') {
      virtuosoRef.current.scrollToIndex({
        index: groupedMessages.length - 1,
        align: 'end',
        behavior,
      })
      return
    }
    virtuosoRef.current?.scrollTo?.({
      top: Number.MAX_SAFE_INTEGER,
      behavior,
    })
  }, [groupedMessages.length, markProgrammaticScroll])

  const scheduleScrollToBottom = useCallback((behavior = 'smooth', force = false) => {
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
      programmaticScrollRef.current = false
      hasHydratedRef.current = false
      lastContainerHeightRef.current = 0
      setShowScrollToBottom(false)
      return
    }
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true
      return
    }
    scheduleScrollToBottom('smooth')
  }, [groupedMessages, scheduleScrollToBottom])

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
      scheduleScrollToBottom('smooth')
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [scheduleScrollToBottom])

  useEffect(() => {
    return () => {
      if (programmaticScrollResetRef.current) {
        window.clearTimeout(programmaticScrollResetRef.current)
      }
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current)
      }
    }
  }, [])

  const handleScrollToBottom = useCallback(() => {
    followIntentRef.current = true
    setShowScrollToBottom(false)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  if (groupedMessages.length === 0) {
    return (
      <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', padding: 20 }}>
        <div style={{ maxWidth: 260, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.8 }}>
          {t('选择供应商并发送消息后，Ai助手会在这里按真实流式顺序输出内容。')}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, height: '100%', background: 'transparent', position: 'relative' }}>
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        data={groupedMessages}
        increaseViewportBy={{ top: 1200, bottom: 800 }}
        initialTopMostItemIndex={Math.max(groupedMessages.length - 1, 0)}
        atBottomThreshold={24}
        followOutput={(isAtBottom) => (isAtBottom || followIntentRef.current ? 'smooth' : false)}
        atBottomStateChange={(isAtBottom) => {
          if (isAtBottom) {
            followIntentRef.current = true
            programmaticScrollRef.current = false
          } else if (!programmaticScrollRef.current) {
            followIntentRef.current = false
          }
          setShowScrollToBottom(!isAtBottom && !programmaticScrollRef.current)
        }}
        computeItemKey={(index, entry) => getEntryKey(entry, index)}
        itemContent={(index, entry) => (
          <div style={{ padding: `0 14px ${index === groupedMessages.length - 1 ? 18 : 14}px` }}>
            {renderGroupedEntry(entry, {
              onSendUserMessage,
              onRetryUserMessage,
              onRetryAssistantMessage,
              onEditUserMessage,
              onDeleteMessage,
              messageActionBarAtBottom,
            }, {
              isLastAssistantTurn: index === lastAssistantTurnIndex,
              hasSubsequentAssistantMessage: hasSubsequentAssistantTurn(groupedMessages, index),
            })}
          </div>
        )}
      />
      {showScrollToBottom ? (
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 10,
            zIndex: 10,
            pointerEvents: 'none',
          }}>
          <button
            type="button"
            onClick={handleScrollToBottom}
            style={{
              height: 32,
              minWidth: 40,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '0 10px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface-overlay)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-lg)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              transition: 'var(--transition)',
            }}>
            <ChevronDown size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}