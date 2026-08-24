import { ChevronLeft, ChevronRight, MessageCircleQuestionMark } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { useTranslation } from '../../../i18n.ts'
import { cn } from '../../../utils/cn.ts'
import AIChatMarkdown from './AIChatMarkdown.tsx'

const FREEZE_AFTER_SUBMIT_MS = 1000
const FREEZE_AFTER_MULTI_NEXT_MS = 500

/** 追问选项 */
interface FollowUpOption {
  id: string
  answer: string
  mode: string
  disabled: boolean
  recommended?: boolean
}

/** 归一化后的追问问题 */
interface FollowUpQuestion {
  id: string
  text: string
  type: 'single' | 'multiple' | 'free_text'
  options: FollowUpOption[]
}

/** 追问提交的答案结构 */
interface FollowUpAnswerPayload {
  questionId: string
  question: string
  type: string
  textAnswer?: string
  selectedOptionIds?: string[]
  selectedAnswers?: string[]
}

const suggestionMarkdownComponents: Components = {
  p: ({ children }) => <span>{children}</span>,
  ul: ({ children }) => <span className="grid gap-1 pl-[18px]">{children}</span>,
  ol: ({ children }) => <span className="grid gap-1 pl-[18px]">{children}</span>,
  li: ({ children }) => <span className="leading-[1.6] [display:list-item]">{children}</span>,
  a: ({ children }) => <span className="text-accent underline">{children}</span>,
  code: ({ children }) => (
    <code className="rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-overlay))] px-1.5 py-0.5 font-mono text-sm text-primary">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <span
      className="block whitespace-pre-wrap font-mono [word-break:break-word]"
    >
      {children}
    </span>
  ),
  blockquote: ({ children }) => (
    <span
      className="block border-l-[3px] border-l-[color-mix(in_srgb,var(--accent)_40%,var(--border))] pl-3 text-secondary"
    >
      {children}
    </span>
  ),
  h1: ({ children }) => <span className="block text-[16px] font-bold leading-[1.4]">{children}</span>,
  h2: ({ children }) => <span className="block text-[15px] font-bold leading-[1.45]">{children}</span>,
  h3: ({ children }) => <span className="block text-md font-bold leading-[1.5]">{children}</span>,
}

interface FollowUpSuggestionMarkdownProps {
  text: string
  inline?: boolean
}

function FollowUpSuggestionMarkdown({ text, inline = false }: FollowUpSuggestionMarkdownProps) {
  return (
    <span className={cn('leading-[1.6] [word-break:break-word]', inline ? 'inline w-auto' : 'block w-full')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={suggestionMarkdownComponents}>
        {text || ''}
      </ReactMarkdown>
    </span>
  )
}

function normalizeLegacySuggestions(question: unknown, suggestions: unknown): FollowUpQuestion[] {
  const suggestionList = Array.isArray(suggestions) ? suggestions.filter((item) => typeof item === 'string' && item.trim()) : []
  if (suggestionList.length === 0) {
    return []
  }
  return [{
    id: 'question-1',
    text: typeof question === 'string' && question.trim() ? question.trim() : 'Question 1',
    type: 'single',
    options: suggestionList.map((item, index) => ({
      id: `question-1-option-${index + 1}`,
      answer: (item as string).trim(),
      mode: '',
      disabled: false,
    })),
  }]
}

function normalizeFollowUpQuestionType(value: unknown): 'single' | 'multiple' | 'free_text' {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (normalizedValue === 'multiple' || normalizedValue === 'multi_select') {
    return 'multiple'
  }
  if (normalizedValue === 'free_text' || normalizedValue === 'text') {
    return 'free_text'
  }
  return 'single'
}

function normalizeFollowUpQuestions(question: unknown, questions: unknown, suggestions: unknown): FollowUpQuestion[] {
  if (Array.isArray(questions) && questions.length > 0) {
    return (questions as Array<Record<string, unknown>>)
      .map((item, questionIndex) => {
        const id = typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `question-${questionIndex + 1}`
        const text = typeof item?.text === 'string' && item.text.trim()
          ? item.text.trim()
          : questionIndex === 0 && typeof question === 'string' && question.trim()
            ? question.trim()
            : `Question ${questionIndex + 1}`
        const type = normalizeFollowUpQuestionType(item?.type)
        const options: FollowUpOption[] = Array.isArray(item?.options)
          ? (item.options as Array<Record<string, unknown>>)
            .map((option, optionIndex): FollowUpOption | null => {
              const answer = typeof option?.answer === 'string' ? option.answer.trim() : ''
              if (!answer) {
                return null
              }
              return {
                id: typeof option?.id === 'string' && option.id.trim() ? option.id.trim() : `${id}-option-${optionIndex + 1}`,
                answer,
                mode: typeof option?.mode === 'string' ? option.mode.trim() : '',
                disabled: option?.disabled === true,
                recommended: option?.recommended === true,
              }
            })
            .filter((option): option is FollowUpOption => option !== null)
          : []
        if (type !== 'free_text' && options.length === 0) {
          return null
        }
        return { id, text, type, options }
      })
      .filter((item): item is FollowUpQuestion => item !== null)
  }
  return normalizeLegacySuggestions(question, suggestions)
}

function buildFollowUpSessionIdentity(requestId: unknown, questions: FollowUpQuestion[]) {
  const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : ''
  const normalizedQuestions = Array.isArray(questions)
    ? questions.map((item) => ({
        id: typeof item?.id === 'string' ? item.id : '',
        text: typeof item?.text === 'string' ? item.text : '',
        type: typeof item?.type === 'string' ? item.type : '',
        options: Array.isArray(item?.options)
          ? item.options.map((option) => ({
              id: typeof option?.id === 'string' ? option.id : '',
              answer: typeof option?.answer === 'string' ? option.answer : '',
              mode: typeof option?.mode === 'string' ? option.mode : '',
              disabled: option?.disabled === true,
              recommended: option?.recommended === true,
            }))
          : [],
      }))
    : []
  return JSON.stringify({
    requestId: normalizedRequestId,
    questions: normalizedQuestions,
  })
}

function buildFollowUpReadableText(questions: FollowUpQuestion[], answers: Record<string, string[]>, textAnswers: Record<string, string>) {
  return questions
    .map((question) => {
      if (question.type === 'free_text') {
        const textAnswer = String(textAnswers?.[question.id] || '').trim()
        return textAnswer ? `${question.text}: ${textAnswer}` : ''
      }
      const selectedIds = answers[question.id] || []
      const selectedAnswers = (question.options || []).filter((option) => selectedIds.includes(option.id)).map((option) => option.answer)
      return selectedAnswers.length > 0 ? `${question.text}: ${selectedAnswers.join(', ')}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function buildFollowUpResponse(questions: FollowUpQuestion[], answers: Record<string, string[]>, textAnswers: Record<string, string>) {
  const formattedAnswers: FollowUpAnswerPayload[] = questions.map((question) => {
    if (question.type === 'free_text') {
      return {
        questionId: question.id,
        question: question.text,
        type: question.type,
        textAnswer: String(textAnswers?.[question.id] || '').trim(),
      }
    }
    const selectedOptionIds = answers[question.id] || []
    const selectedAnswers = (question.options || []).filter((option) => selectedOptionIds.includes(option.id)).map((option) => option.answer)
    return {
      questionId: question.id,
      question: question.text,
      type: question.type,
      selectedOptionIds,
      selectedAnswers,
    }
  })
  const mode = questions
    .filter((question) => question.type === 'single')
    .flatMap((question) => (question.options || []).filter((option) => (answers[question.id] || []).includes(option.id) && option.mode))[0]?.mode
  return {
    readableText: buildFollowUpReadableText(questions, answers, textAnswers),
    answers: formattedAnswers,
    ...(mode ? { mode } : {}),
  }
}

// 选项按钮选中/禁用态为条件样式，改为条件工具类（原 buildOptionButtonStyle）
function buildOptionButtonClass(selected: boolean, disabled: boolean): string {
  return cn(
    'grid min-h-[44px] w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5 rounded-xl px-3 py-[9px] text-left [transition:var(--transition)]',
    selected
      ? 'border border-accent bg-[rgba(var(--accent-rgb),0.08)]'
      : 'border border-line bg-overlay',
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
    'text-primary',
  )
}

interface OptionIndicatorProps {
  type: string
  checked: boolean
}

function OptionIndicator({ type, checked }: OptionIndicatorProps) {
  if (type === 'multiple') {
    return (
      <span
        className={cn(
          'inline-flex h-[18px] w-[18px] box-border items-center justify-center rounded-sm border-[1.5px]',
          checked ? 'border-accent bg-[rgba(var(--accent-rgb),0.18)]' : 'border-tertiary bg-transparent',
        )}
      >
        <span
          style={{ background: checked ? 'var(--accent)' : 'transparent' }}
          className="block h-[9px] w-[9px] rounded-xs"
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex h-[18px] w-[18px] box-border items-center justify-center rounded-full border-[1.5px]',
        checked ? 'border-accent bg-[rgba(var(--accent-rgb),0.12)]' : 'border-tertiary bg-transparent',
      )}
    >
      <span
        style={{ background: checked ? 'var(--accent)' : 'transparent' }}
        className="block h-2 w-2 rounded-full"
      />
    </span>
  )
}

export interface AIChatFollowUpCardProps {
  question?: unknown
  questions?: unknown
  suggestions?: unknown
  requestId?: unknown
  onSelectSuggestion?: (payload: unknown) => unknown
}

export default function AIChatFollowUpCard({ question, questions, suggestions, requestId, onSelectSuggestion }: AIChatFollowUpCardProps) {
  const { t } = useTranslation()
  const normalizedQuestions = useMemo(
    () => normalizeFollowUpQuestions(question, questions, suggestions),
    [question, questions, suggestions],
  )
  const followUpSessionIdentity = useMemo(
    () => buildFollowUpSessionIdentity(requestId, normalizedQuestions),
    [normalizedQuestions, requestId],
  )
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [isFrozen, setIsFrozen] = useState(false)
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next')
  const [transitionTick, setTransitionTick] = useState(0)
  const currentQuestionIndexRef = useRef(0)
  const answersRef = useRef<Record<string, string[]>>({})
  const textAnswersRef = useRef<Record<string, string>>({})
  const submittingRef = useRef(false)
  const freezeTimeoutRef = useRef(0)

  const clearFreezeTimeout = useCallback(() => {
    if (freezeTimeoutRef.current) {
      window.clearTimeout(freezeTimeoutRef.current)
      freezeTimeoutRef.current = 0
    }
  }, [])

  const startFreeze = useCallback((durationMs: number) => {
    clearFreezeTimeout()
    setIsFrozen(true)
    freezeTimeoutRef.current = window.setTimeout(() => {
      setIsFrozen(false)
      setSubmitting(false)
      submittingRef.current = false
      freezeTimeoutRef.current = 0
    }, durationMs)
  }, [clearFreezeTimeout])

  useEffect(() => {
    currentQuestionIndexRef.current = 0
    answersRef.current = {}
    textAnswersRef.current = {}
    setCurrentQuestionIndex(0)
    setAnswers({})
    setTextAnswers({})
    setSubmitting(false)
    setIsFrozen(false)
    submittingRef.current = false
    clearFreezeTimeout()
    setTransitionDirection('next')
    setTransitionTick(0)
  }, [clearFreezeTimeout, followUpSessionIdentity])

  useEffect(() => () => clearFreezeTimeout(), [clearFreezeTimeout])

  const currentQuestion = normalizedQuestions[currentQuestionIndex] || null
  const totalQuestions = normalizedQuestions.length
  const currentLabel = String(currentQuestionIndex + 1).padStart(2, '0')
  const totalLabel = String(totalQuestions).padStart(2, '0')
  const canGoPrevious = currentQuestionIndex > 0
  const selectedIds = currentQuestion ? (answers[currentQuestion.id] || []) : []
  const currentTextAnswer = currentQuestion ? (textAnswers[currentQuestion.id] || '') : ''
  const canGoNext = currentQuestion?.type === 'free_text' ? true : selectedIds.length > 0
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1

  const submitResponse = useCallback(async (nextAnswers: Record<string, string[]>, nextTextAnswers: Record<string, string> = textAnswersRef.current || {}) => {
    if (!requestId || typeof onSelectSuggestion !== 'function' || submittingRef.current || isFrozen) {
      return false
    }
    if (!normalizedQuestions.every((item) => item.type === 'free_text' || (Array.isArray(nextAnswers[item.id]) && nextAnswers[item.id].length > 0))) {
      return false
    }
    const payload = buildFollowUpResponse(normalizedQuestions, nextAnswers, nextTextAnswers)
    submittingRef.current = true
    setSubmitting(true)
    try {
      const accepted = await onSelectSuggestion({
        kind: 'followup-response',
        requestId,
        answer: payload,
      })
      if (accepted === false) {
        submittingRef.current = false
        setSubmitting(false)
        return false
      }
      answersRef.current = {}
      textAnswersRef.current = {}
      currentQuestionIndexRef.current = 0
      setAnswers({})
      setTextAnswers({})
      setCurrentQuestionIndex(0)
      setTransitionDirection('next')
      setTransitionTick((current) => current + 1)
      startFreeze(FREEZE_AFTER_SUBMIT_MS)
      return true
    } catch {
      submittingRef.current = false
      setSubmitting(false)
      return false
    }
  }, [isFrozen, normalizedQuestions, onSelectSuggestion, requestId, startFreeze])

  const handleSingleSelect = useCallback(async (questionItem: FollowUpQuestion, optionId: string) => {
    if (!questionItem || submitting || isFrozen) {
      return
    }
    const nextAnswers = {
      ...(answersRef.current || {}),
      [questionItem.id]: [optionId],
    }
    answersRef.current = nextAnswers
    setAnswers(nextAnswers)
    if (currentQuestionIndexRef.current === normalizedQuestions.length - 1) {
      await submitResponse(nextAnswers)
      return
    }
    setTransitionDirection('next')
    setTransitionTick((current) => current + 1)
    setCurrentQuestionIndex((current) => {
      const nextIndex = Math.min(normalizedQuestions.length - 1, current + 1)
      currentQuestionIndexRef.current = nextIndex
      return nextIndex
    })
  }, [isFrozen, normalizedQuestions.length, submitResponse, submitting])

  const handleMultipleToggle = useCallback((questionItem: FollowUpQuestion, optionId: string) => {
    if (!questionItem || submitting || isFrozen) {
      return
    }
    setAnswers((current) => {
      const existing = current[questionItem.id] || []
      const checked = existing.includes(optionId)
      const nextAnswers = {
        ...current,
        [questionItem.id]: checked ? existing.filter((item) => item !== optionId) : [...existing, optionId],
      }
      answersRef.current = nextAnswers
      return nextAnswers
    })
  }, [isFrozen, submitting])

  const handleFreeTextChange = useCallback((questionItem: FollowUpQuestion, value: string) => {
    if (!questionItem || submitting || isFrozen) {
      return
    }
    const nextValue = typeof value === 'string' ? value : ''
    setTextAnswers((current) => {
      const nextTextAnswers = {
        ...current,
        [questionItem.id]: nextValue,
      }
      textAnswersRef.current = nextTextAnswers
      return nextTextAnswers
    })
  }, [isFrozen, submitting])

  const handleGoPrevious = useCallback(() => {
    if (!canGoPrevious || submitting || isFrozen) {
      return
    }
    setTransitionDirection('prev')
    setTransitionTick((current) => current + 1)
    setCurrentQuestionIndex((current) => {
      const nextIndex = Math.max(0, current - 1)
      currentQuestionIndexRef.current = nextIndex
      return nextIndex
    })
  }, [canGoPrevious, isFrozen, submitting])

  const handleGoNext = useCallback(async () => {
    if (!currentQuestion || !canGoNext || submitting || isFrozen) {
      return
    }
    if (isLastQuestion) {
      await submitResponse(answersRef.current || {})
      return
    }
    setTransitionDirection('next')
    setTransitionTick((current) => current + 1)
    setCurrentQuestionIndex((current) => {
      const nextIndex = Math.min(normalizedQuestions.length - 1, current + 1)
      currentQuestionIndexRef.current = nextIndex
      return nextIndex
    })
    if (currentQuestion.type === 'multiple') {
      startFreeze(FREEZE_AFTER_MULTI_NEXT_MS)
    }
  }, [canGoNext, currentQuestion, isFrozen, isLastQuestion, normalizedQuestions.length, startFreeze, submitResponse, submitting])

  if (!currentQuestion) {
    return null
  }

  // 问题切换动画 ai-followup-slide-next / ai-followup-slide-prev（keyframes 已上收全局样式表）
  const prevDisabled = !canGoPrevious || submitting || isFrozen
  const nextActive = canGoNext && !submitting && !isFrozen

  return (
    <div className="grid gap-2.5 rounded-[14px] border border-line bg-overlay p-3">
      <div className="grid gap-1">
        <div className="flex items-center gap-1.5 text-base text-secondary">
          <MessageCircleQuestionMark size={13} />
          <span>{t('追问建议')}</span>
        </div>
        <div className="text-[18px] font-bold leading-[1.4] text-primary">
          <AIChatMarkdown text={currentQuestion.text || ''} />
        </div>
      </div>

      <div
        key={`${currentQuestion.id}-${transitionTick}`}
        className={cn(
          'grid gap-2',
          transitionDirection === 'next'
            ? 'animate-[ai-followup-slide-next_180ms_ease]'
            : 'animate-[ai-followup-slide-prev_180ms_ease]',
        )}
      >
        {currentQuestion.type === 'free_text' ? (
          <textarea
            name="ai-chat-followup-free-text"
            value={currentTextAnswer}
            onChange={(event) => handleFreeTextChange(currentQuestion, event.target.value)}
            disabled={submitting || isFrozen}
            className="min-h-[140px] resize-y rounded-xl border border-line bg-overlay px-3.5 py-3 text-base leading-[1.6] text-primary outline-none"
          />
        ) : currentQuestion.options.map((option) => {
          const checked = selectedIds.includes(option.id)
          const disabled = submitting || isFrozen || option.disabled === true
          const optionType = currentQuestion.type === 'multiple' ? 'multiple' : 'single'
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (optionType === 'single') {
                  void handleSingleSelect(currentQuestion, option.id)
                  return
                }
                handleMultipleToggle(currentQuestion, option.id)
              }}
              className={buildOptionButtonClass(checked, disabled)}
            >
              <OptionIndicator type={optionType} checked={checked} />
              <div className={cn('grid min-w-0', option.mode ? 'gap-1.5' : 'gap-0')}>
                <div className="min-w-0 text-md leading-[1.5] text-primary">
                  {option.recommended ? (
                    <span
                      className="mr-2 inline-flex items-center whitespace-nowrap rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))] bg-[rgba(var(--accent-rgb),0.12)] px-2 py-0.5 align-text-top text-[10px] font-bold leading-[1.4] text-accent"
                    >
                      {t('推荐')}
                    </span>
                  ) : null}
                  <FollowUpSuggestionMarkdown text={option.answer} inline />
                </div>
                {option.mode ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-flex items-center whitespace-nowrap rounded-full border border-line-subtle bg-overlay px-2 py-0.5 text-[10px] font-bold uppercase leading-[1.4] tracking-[0.4px] text-tertiary"
                    >
                      {option.mode}
                    </span>
                  </div>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>

      <div
        className="grid grid-cols-[56px_1fr_56px] items-center gap-2.5 border-t border-t-line-subtle pt-2"
      >
        <button
          type="button"
          disabled={!canGoPrevious || submitting || isFrozen}
          onClick={handleGoPrevious}
          className={cn(
            'h-[34px] rounded-lg border border-line bg-transparent',
            prevDisabled ? 'cursor-not-allowed opacity-50 text-muted' : 'cursor-pointer text-primary',
          )}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center justify-center gap-2">
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
          <span className="text-base font-bold tracking-[0.4px] text-primary">{`${currentLabel} / ${totalLabel}`}</span>
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
        </div>
        <button
          type="button"
          disabled={!canGoNext || submitting || isFrozen}
          onClick={() => void handleGoNext()}
          className={cn(
            'h-[34px] rounded-lg border border-line bg-transparent',
            nextActive ? 'cursor-pointer text-primary' : 'cursor-not-allowed opacity-50 text-muted',
          )}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
