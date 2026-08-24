import { Check, ChevronDown, Copy, FileCode2, FileText, RotateCcw, SquarePen, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Tiptop from '../../Tiptop.tsx'
import { useTranslation, type I18nKey } from '../../../i18n.ts'
import { cn } from '../../../utils/cn.ts'
import AIChatMarkdown from './AIChatMarkdown.tsx'

function normalizeAIMessageStatus(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}

interface ReadFileTokenEstimate {
	path: string
	displayPath: string
	tokenCount: number
	tokenDisplay: string
}

function normalizeReadFileTokenEstimates(value: unknown): ReadFileTokenEstimate[] {
	if (!Array.isArray(value)) {
		return []
	}
	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') {
			return []
		}
		const rawItem = item as Record<string, unknown>
		const path = typeof rawItem.path === 'string' ? rawItem.path.trim() : ''
		if (!path) {
			return []
		}
		const displayPath = typeof rawItem.displayPath === 'string' && rawItem.displayPath.trim()
			? rawItem.displayPath.trim()
			: path
		const parsedTokenCount = Number(rawItem.tokenCount)
		const tokenCount = Number.isFinite(parsedTokenCount) ? Math.max(0, Math.trunc(parsedTokenCount)) : 0
		const tokenDisplay = typeof rawItem.tokenDisplay === 'string' && rawItem.tokenDisplay.trim()
			? rawItem.tokenDisplay.trim()
			: `${(tokenCount / 1000000).toFixed(6)}M`
		return [{ path, displayPath, tokenCount, tokenDisplay }]
	})
}

function ReadFileTokenList({ items, t }: { items: ReadFileTokenEstimate[]; t: (key: I18nKey, vars?: Record<string, unknown>) => string }) {
	const [copiedPathIndex, setCopiedPathIndex] = useState<number | null>(null)
	useEffect(() => {
		if (copiedPathIndex === null) {
			return undefined
		}
		const timeoutId = window.setTimeout(() => {
			setCopiedPathIndex(null)
		}, 1200)
		return () => {
			window.clearTimeout(timeoutId)
		}
	}, [copiedPathIndex])
	if (items.length === 0) {
		return null
	}
	return (
		<div className="mt-1.5 grid gap-0.5">
			{items.map((item, index) => {
				const copied = copiedPathIndex === index
				return (
					<div
						key={`${item.path}-${index}`}
						className="flex min-w-0 items-center justify-between gap-2.5 rounded-md border border-[rgba(var(--accent-rgb),0.75)] bg-canvas px-2.5 py-[7px] font-mono text-sm leading-[1.35] text-secondary">
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<Tiptop text={item.displayPath} style={{ display: 'flex', minWidth: 0, flex: 1 }}>
								<div className="min-w-0 flex-1 overflow-hidden">
									{/* 跑马灯动画 ai-chat-read-file-path-marquee（keyframes 已上收全局样式表） */}
									<div className="flex w-max min-w-full animate-[ai-chat-read-file-path-marquee_4s_linear_infinite] items-center [will-change:transform]">
										<span className="shrink-0 grow-0 basis-auto whitespace-nowrap pr-8">{item.displayPath}</span>
										<span aria-hidden="true" className="shrink-0 grow-0 basis-auto whitespace-nowrap pr-8">{item.displayPath}</span>
									</div>
								</div>
							</Tiptop>
							<Tiptop text={copied ? t('已复制' as I18nKey) : t('复制绝对路径' as I18nKey)} style={{ display: 'inline-flex', flexShrink: 0 }}>
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation()
										void navigator.clipboard.writeText(item.path).then(() => {
											setCopiedPathIndex(index)
										}).catch(() => {})
									}}
									className={cn(
										'inline-flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-md',
										copied
											? 'border border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[color-mix(in_srgb,var(--success)_8%,var(--surface-base))] text-success'
											: 'border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-base))] text-secondary',
									)}>
									{copied ? <Check size={11} color="currentColor" strokeWidth={2.5} /> : <Copy size={11} color="currentColor" strokeWidth={2.5} />}
								</button>
							</Tiptop>
						</div>
						<span className="shrink-0 tabular-nums text-secondary">{item.tokenDisplay}</span>
					</div>
				)
			})}
		</div>
	)
}

function normalizeCompactDiffText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : ''
}

function splitCompactDiffLines(value: unknown) {
  const normalized = normalizeCompactDiffText(value)
  if (normalized === '') {
    return []
  }
  return normalized.split('\n')
}

/** 对齐后的左右行对 */
interface CompactAlignedPair {
  left: string | null
  right: string | null
  equal: boolean
}

/** 紧凑差异预览行 */
type CompactDiffRow =
  | { type: 'file'; text: string; key: string }
  | { type: 'meta'; text: string; key: string; oldLineNumber: null; newLineNumber: null }
  | { type: 'add' | 'remove' | 'context'; text: string; key: string; oldLineNumber: number | null; newLineNumber: number | null }
  | { type: 'hidden'; count: number; key: string }

function buildCompactAlignedLinePairs(leftLines: string[], rightLines: string[]): CompactAlignedPair[] {
  const maxProduct = 32000
  if (leftLines.length * rightLines.length > maxProduct) {
    const prefixPairs = []
    let prefix = 0
    while (prefix < leftLines.length && prefix < rightLines.length && leftLines[prefix] === rightLines[prefix]) {
      prefixPairs.push({ left: leftLines[prefix], right: rightLines[prefix], equal: true })
      prefix += 1
    }
    let leftSuffix = leftLines.length - 1
    let rightSuffix = rightLines.length - 1
    const suffixPairs = []
    while (leftSuffix >= prefix && rightSuffix >= prefix && leftLines[leftSuffix] === rightLines[rightSuffix]) {
      suffixPairs.unshift({ left: leftLines[leftSuffix], right: rightLines[rightSuffix], equal: true })
      leftSuffix -= 1
      rightSuffix -= 1
    }
    const middleLeft = leftLines.slice(prefix, leftSuffix + 1)
    const middleRight = rightLines.slice(prefix, rightSuffix + 1)
    const middlePairs = []
    const maxLength = Math.max(middleLeft.length, middleRight.length)
    for (let index = 0; index < maxLength; index += 1) {
      middlePairs.push({
        left: index < middleLeft.length ? middleLeft[index] : null,
        right: index < middleRight.length ? middleRight[index] : null,
        equal: false,
      })
    }
    return [...prefixPairs, ...middlePairs, ...suffixPairs]
  }
  const dp = Array.from({ length: leftLines.length + 1 }, () => new Array(rightLines.length + 1).fill(0))
  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      if (leftLines[leftIndex] === rightLines[rightIndex]) {
        dp[leftIndex][rightIndex] = dp[leftIndex + 1][rightIndex + 1] + 1
      } else {
        dp[leftIndex][rightIndex] = Math.max(dp[leftIndex + 1][rightIndex], dp[leftIndex][rightIndex + 1])
      }
    }
  }
  const rawPairs = []
  let leftCursor = 0
  let rightCursor = 0
  while (leftCursor < leftLines.length && rightCursor < rightLines.length) {
    if (leftLines[leftCursor] === rightLines[rightCursor]) {
      rawPairs.push({ left: leftLines[leftCursor], right: rightLines[rightCursor], equal: true })
      leftCursor += 1
      rightCursor += 1
      continue
    }
    if (dp[leftCursor + 1][rightCursor] >= dp[leftCursor][rightCursor + 1]) {
      rawPairs.push({ left: leftLines[leftCursor], right: null, equal: false })
      leftCursor += 1
    } else {
      rawPairs.push({ left: null, right: rightLines[rightCursor], equal: false })
      rightCursor += 1
    }
  }
  while (leftCursor < leftLines.length) {
    rawPairs.push({ left: leftLines[leftCursor], right: null, equal: false })
    leftCursor += 1
  }
  while (rightCursor < rightLines.length) {
    rawPairs.push({ left: null, right: rightLines[rightCursor], equal: false })
    rightCursor += 1
  }
  const alignedPairs = []
  let pairCursor = 0
  while (pairCursor < rawPairs.length) {
    if (rawPairs[pairCursor].equal) {
      alignedPairs.push(rawPairs[pairCursor])
      pairCursor += 1
      continue
    }
    const removed = []
    const added = []
    while (pairCursor < rawPairs.length && !rawPairs[pairCursor].equal) {
      if (rawPairs[pairCursor].left !== null) {
        removed.push(rawPairs[pairCursor].left)
      }
      if (rawPairs[pairCursor].right !== null) {
        added.push(rawPairs[pairCursor].right)
      }
      pairCursor += 1
    }
    const maxLength = Math.max(removed.length, added.length)
    for (let index = 0; index < maxLength; index += 1) {
      alignedPairs.push({
        left: index < removed.length ? removed[index] : null,
        right: index < added.length ? added[index] : null,
        equal: false,
      })
    }
  }
  return alignedPairs
}

function buildCompactVisibleRanges(rows: Array<{ equal: boolean }>, contextLines = 4): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  rows.forEach((row, index) => {
    if (row.equal) {
      return
    }
    const start = Math.max(0, index - contextLines)
    const end = Math.min(rows.length - 1, index + contextLines)
    const previousRange = ranges[ranges.length - 1]
    if (previousRange && start <= previousRange.end + 1) {
      previousRange.end = Math.max(previousRange.end, end)
      return
    }
    ranges.push({ start, end })
  })
  return ranges
}

function buildCompactDiffRowsFromBlocks(blocks: unknown, t: (key: I18nKey, vars?: Record<string, unknown>) => string): CompactDiffRow[] {
  const rows: CompactDiffRow[] = []
  const normalizedBlocks = Array.isArray(blocks) ? blocks.filter((block) => block && typeof block === 'object') : []
  normalizedBlocks.forEach((block, blockIndex) => {
    const rawBlock = block as Record<string, unknown>
    const beforeLines = splitCompactDiffLines(rawBlock.before)
    const afterLines = splitCompactDiffLines(rawBlock.after)
    const alignedPairs = buildCompactAlignedLinePairs(beforeLines, afterLines)
    let oldLineNumber = 1
    let newLineNumber = 1
    const pairRows = alignedPairs.map((pair) => {
      const nextRow = {
        equal: pair.equal,
        leftText: pair.left,
        rightText: pair.right,
        oldLineNumber: pair.left !== null ? oldLineNumber : null,
        newLineNumber: pair.right !== null ? newLineNumber : null,
      }
      if (pair.left !== null) {
        oldLineNumber += 1
      }
      if (pair.right !== null) {
        newLineNumber += 1
      }
      return nextRow
    })
    const visibleRanges = buildCompactVisibleRanges(pairRows)
    if (visibleRanges.length === 0) {
      return
    }
    const labelKey = typeof rawBlock.label === 'string' && rawBlock.label.trim() ? rawBlock.label.trim() : '文件 #{count}'
    const labelParams = rawBlock?.labelParams && typeof rawBlock.labelParams === 'object'
      ? rawBlock.labelParams as Record<string, unknown>
      : { count: blockIndex + 1 }
    rows.push({
      type: 'file',
      // labelKey 为 AI 返回动态键（可能不在翻译表），t() 内部有兜底
      text: t(labelKey as I18nKey, labelParams),
      key: `file-${blockIndex}`,
    })
    let previousEnd = -1
    visibleRanges.forEach((range, rangeIndex) => {
      if (range.start > previousEnd + 1) {
        rows.push({
          type: 'hidden',
          count: range.start - previousEnd - 1,
          key: `hidden-${blockIndex}-${rangeIndex}`,
        })
      }
      for (let pairIndex = range.start; pairIndex <= range.end; pairIndex += 1) {
        const pairRow = pairRows[pairIndex]
        if (pairRow.equal) {
          rows.push({
            type: 'context',
            oldLineNumber: pairRow.oldLineNumber,
            newLineNumber: pairRow.newLineNumber,
            text: pairRow.leftText ?? pairRow.rightText ?? '',
            key: `context-${blockIndex}-${pairIndex}`,
          })
          continue
        }
        if (pairRow.leftText !== null) {
          rows.push({
            type: 'remove',
            oldLineNumber: pairRow.oldLineNumber,
            newLineNumber: null,
            text: pairRow.leftText,
            key: `remove-${blockIndex}-${pairIndex}`,
          })
        }
        if (pairRow.rightText !== null) {
          rows.push({
            type: 'add',
            oldLineNumber: null,
            newLineNumber: pairRow.newLineNumber,
            text: pairRow.rightText,
            key: `add-${blockIndex}-${pairIndex}`,
          })
        }
      }
      previousEnd = range.end
    })
    if (previousEnd < pairRows.length - 1) {
      rows.push({
        type: 'hidden',
        count: pairRows.length - previousEnd - 1,
        key: `hidden-tail-${blockIndex}`,
      })
    }
  })
  return rows
}

function buildCompactDiffRowsFromRawDiff(rawDiff: string): CompactDiffRow[] {
  const lines = normalizeCompactDiffText(rawDiff).split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.map((text, index): CompactDiffRow => {
    if (text.startsWith('diff --git')) {
      return { type: 'file', text, key: `raw-file-${index}` }
    }
    if (text.startsWith('@@') || text.startsWith('index ') || text.startsWith('---') || text.startsWith('+++')) {
      return { type: 'meta', oldLineNumber: null, newLineNumber: null, text, key: `raw-meta-${index}` }
    }
    if (text.startsWith('+') && !text.startsWith('+++')) {
      return { type: 'add', oldLineNumber: null, newLineNumber: null, text: text.slice(1), key: `raw-add-${index}` }
    }
    if (text.startsWith('-') && !text.startsWith('---')) {
      return { type: 'remove', oldLineNumber: null, newLineNumber: null, text: text.slice(1), key: `raw-remove-${index}` }
    }
    return {
      type: 'context',
      oldLineNumber: null,
      newLineNumber: null,
      text: text.startsWith(' ') ? text.slice(1) : text,
      key: `raw-context-${index}`,
    }
  })
}

function buildCompactDiffRows(rawDiff: string, reviewBlocks: unknown, t: (key: I18nKey, vars?: Record<string, unknown>) => string): CompactDiffRow[] {
  const blockRows = buildCompactDiffRowsFromBlocks(reviewBlocks, t)
  if (blockRows.length > 0) {
    return blockRows
  }
  return buildCompactDiffRowsFromRawDiff(rawDiff)
}

// 差异行配色随行类型动态切换，保留内联注入
function resolveCompactDiffRowPalette(row: CompactDiffRow) {
  switch (row?.type) {
    case 'file':
      return { color: 'var(--text-primary)', background: 'rgba(var(--accent-rgb), 0.08)' }
    case 'meta':
      return { color: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.08)' }
    case 'add':
      return { color: 'var(--success)', background: 'rgba(var(--success-rgb), 0.10)' }
    case 'remove':
      return { color: 'var(--danger)', background: 'rgba(var(--danger-rgb), 0.10)' }
    default:
      return { color: 'var(--text-primary)', background: 'transparent' }
  }
}

interface CompactDiffPreviewProps {
  reviewBlocks?: unknown
  rawDiff?: string
  loading?: boolean
  t: (key: I18nKey, vars?: Record<string, unknown>) => string
  lang: string
}

function CompactDiffPreview({ reviewBlocks = [], rawDiff = '', loading = false, t, lang }: CompactDiffPreviewProps) {
  const normalizedRawDiff = typeof rawDiff === 'string' ? rawDiff.trim() : ''
  const rows = useMemo(() => buildCompactDiffRows(normalizedRawDiff, reviewBlocks, t), [normalizedRawDiff, reviewBlocks, t, lang])
  if (loading) {
    return (
      <div className="rounded-lg border border-line-subtle bg-canvas px-3 py-2.5 text-sm text-secondary">
        {t('加载中...')}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line-subtle bg-canvas px-3 py-2.5 text-sm text-secondary">
        {t('暂无可预览差异')}
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line-subtle bg-canvas">
      <div className="max-h-[240px] overflow-auto overscroll-contain font-mono text-xs leading-[18px]">
        {rows.map((row, index) => {
          if (row.type === 'hidden') {
            return (
              <div
                key={row.key}
                className="border-y border-y-line-subtle bg-[rgba(var(--accent-rgb),0.04)] px-3 py-1.5 text-center tabular-nums text-tertiary">
                {`··· ${row.count} ···`}
              </div>
            )
          }
          const palette = resolveCompactDiffRowPalette(row)
          if (row.type === 'file') {
            return (
              <div
                key={row.key}
                style={{ background: palette.background, color: palette.color }}
                className={cn('break-all px-2.5 py-1.5 font-bold', index === 0 ? '' : 'border-t border-t-[rgba(255,255,255,0.02)]')}>
                {row.text}
              </div>
            )
          }
          const linePrefix = row.type === 'add' ? '+ ' : row.type === 'remove' ? '- ' : row.type === 'meta' ? '' : '  '
          return (
            <div
              key={row.key}
              style={{ background: palette.background }}
              className={cn('grid min-w-0 grid-cols-[52px_52px_minmax(0,1fr)]', index === 0 ? '' : 'border-t border-t-[rgba(255,255,255,0.02)]')}>
              <div
                className="select-none border-r border-r-line-subtle pl-2.5 pr-2 text-right tabular-nums text-tertiary">
                {row.oldLineNumber ?? ''}
              </div>
              <div
                className="select-none border-r border-r-line-subtle px-2 text-right tabular-nums text-tertiary">
                {row.newLineNumber ?? ''}
              </div>
              <div
                style={{ color: palette.color }}
                className="min-w-0 whitespace-pre-wrap px-2.5 [overflow-wrap:anywhere] [word-break:break-word]">
                {row.type === 'meta' ? row.text : `${linePrefix}${row.text || ' '}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface AIChatToolCardProps {
  restoreArtifactPath?: string
  copyContent?: string
  actionLabel?: string
  title?: string
  summary?: string
  code?: string
  result?: string
  status?: string
  remainingFileEdits?: number
  extra?: Record<string, unknown>
  isLast?: boolean
  hasSubsequentAssistantMessage?: boolean
  onPreviewRestore?: (path: string, targetTerminalId?: string) => void
  onPreviewDiffFetch?: (path: string, targetTerminalId?: string) => Promise<unknown>
  onApplyRestore?: (path: string, targetTerminalId?: string) => boolean | Promise<boolean | null | undefined>
}

export default function AIChatToolCard({ restoreArtifactPath = '', copyContent = '', actionLabel, title, summary, code, result = '', status, remainingFileEdits = 0, extra = {}, isLast = false, hasSubsequentAssistantMessage = false, onPreviewRestore, onPreviewDiffFetch, onApplyRestore }: AIChatToolCardProps) {
  const { t, lang } = useTranslation()
  const [isAutoExpanded, setIsAutoExpanded] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [restored, setRestored] = useState(false)
  const [inlineDiffReview, setInlineDiffReview] = useState<Record<string, unknown> | null>(null)
  const [inlineDiffLoading, setInlineDiffLoading] = useState(false)

  useEffect(() => {
    if (isLast) {
      setIsAutoExpanded(true)
    }
  }, [isLast])

  useEffect(() => {
    if (hasSubsequentAssistantMessage) {
      setIsAutoExpanded(false)
    }
  }, [hasSubsequentAssistantMessage])

  const normalizedRestoreArtifactPath = typeof restoreArtifactPath === 'string' ? restoreArtifactPath.trim() : ''
  const showRevertTitleButton = ['apply_diff', 'write_to_file', 'search_replace', 'edit_file', 'apply_patch'].includes(String(actionLabel || '').trim())
  const showInlineDiffPreview = showRevertTitleButton && extra?.conversationDiffHasPreview === true && Boolean(normalizedRestoreArtifactPath) && typeof onPreviewDiffFetch === 'function'

  useEffect(() => {
    let cancelled = false
    if (!showInlineDiffPreview) {
      setInlineDiffReview(null)
      setInlineDiffLoading(false)
      return undefined
    }
    setInlineDiffLoading(true)
    onPreviewDiffFetch(normalizedRestoreArtifactPath)
      .then((review) => {
        if (cancelled) {
          return
        }
        setInlineDiffReview(review && typeof review === 'object' ? review as Record<string, unknown> : null)
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setInlineDiffReview(null)
      })
      .finally(() => {
        if (!cancelled) {
          setInlineDiffLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [normalizedRestoreArtifactPath, onPreviewDiffFetch, showInlineDiffPreview])

  const normalizedStatus = useMemo(() => normalizeAIMessageStatus(status), [status])
  const expanded = isExpanded || ((isAutoExpanded && !hasSubsequentAssistantMessage) || ((normalizedStatus === '错误' || normalizedStatus === '已终止') && Boolean(result)))
  // 状态徽标配色随状态动态切换，保留内联注入
  const statusPalette = useMemo(() => {
    switch (normalizedStatus) {
      case '待审阅':
      case '待批准':
        return {
          border: '1px solid rgba(var(--warning-rgb), 0.35)',
          background: 'rgba(var(--warning-rgb), 0.08)',
          color: 'var(--warning)',
          tone: 'warning',
        }
      case '执行中':
        return {
          border: '1px solid rgba(var(--accent-rgb), 0.35)',
          background: 'rgba(var(--accent-rgb), 0.08)',
          color: 'var(--accent)',
          tone: 'accent',
        }
      case '错误':
      case '已终止':
      case '已拒绝':
        return {
          border: '1px solid rgba(var(--danger-rgb), 0.35)',
          background: 'rgba(var(--danger-rgb), 0.08)',
          color: 'var(--danger)',
          tone: 'danger',
        }
      default:
        return {
          border: '1px solid rgba(var(--success-rgb), 0.35)',
          background: 'rgba(var(--success-rgb), 0.08)',
          color: 'var(--success)',
          tone: 'success',
        }
    }
  }, [normalizedStatus])

  const normalizedRemainingFileEdits = Number.isFinite(Number(remainingFileEdits)) ? Math.max(0, Math.trunc(Number(remainingFileEdits))) : 0
  const showRemainingFileEdits = normalizedRemainingFileEdits > 0
  const normalizedCopyContent = typeof copyContent === 'string' ? copyContent.trim() : ''
  const copyCharacterCount = normalizedCopyContent ? normalizedCopyContent.length : 0
  const showCopyCharacterCount = copyCharacterCount > 0
  const resultTokenEstimateDisplay = typeof extra?.resultTokenEstimateDisplay === 'string' ? extra.resultTokenEstimateDisplay.trim() : ''
  const readFileTokenEstimates = String(actionLabel || '').trim() === 'read_file' ? normalizeReadFileTokenEstimates(extra?.readFileTokenEstimates) : []
  const inlineDiffRaw = typeof inlineDiffReview?.rawDiff === 'string' ? inlineDiffReview.rawDiff : ''
  const inlineDiffBlocks = Array.isArray(inlineDiffReview?.blocks) ? inlineDiffReview.blocks : []

  const handleToggleExpand = () => {
    setIsAutoExpanded(false)
    setIsExpanded((previous) => !previous)
  }

  const handlePreviewRestore = () => {
    if (restored || !normalizedRestoreArtifactPath) {
      return
    }
    void onPreviewRestore?.(normalizedRestoreArtifactPath)
  }

  const handleApplyRestore = async () => {
    if (restored || !normalizedRestoreArtifactPath) {
      return
    }
    const applied = await onApplyRestore?.(normalizedRestoreArtifactPath)
    if (applied === true) {
      setRestored(true)
    }
  }

  const handleCopyFullContent = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!normalizedCopyContent) {
      return
    }
    try {
      await navigator.clipboard.writeText(normalizedCopyContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="inline-flex min-w-0 flex-wrap items-center gap-2">
          <FileCode2 size={14} color="var(--text-secondary)" />
          {/* title 为 AI 返回动态文案（可能不在翻译表），t() 内部有兜底 */}
          <span className="font-bold text-primary">{t(title as I18nKey)}</span>
          {showCopyCharacterCount ? (
            <Tiptop text={copied ? t('已复制') : t('复制完整 diff/内容')} className="inline-flex">
              <button
                type="button"
                onClick={handleCopyFullContent}
                className={cn(
                  'inline-flex h-[22px] shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-bold',
                  copied
                    ? 'border border-[color-mix(in_srgb,var(--success)_32%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,var(--surface-overlay))] text-success'
                    : 'border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-overlay))] text-secondary',
                )}>
                <FileText size={11} color={copied ? 'currentColor' : 'var(--accent)'} />
                <span>{copied ? t('已复制') : String(copyCharacterCount)}</span>
              </button>
            </Tiptop>
          ) : null}
          {showRevertTitleButton ? (
            <Tiptop text={restored ? t('已还原') : t('左键预览/右键还原')} className="inline-flex">
              <button
                type="button"
                onClick={restored ? undefined : (event) => {
                  event.stopPropagation()
                  handlePreviewRestore()
                }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onContextMenu={restored ? undefined : (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void handleApplyRestore()
                }}
                className={cn(
                  'inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 text-xs font-bold',
                  restored
                    ? 'cursor-default border border-[color-mix(in_srgb,var(--success)_32%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,var(--surface-overlay))] text-success'
                    : 'cursor-pointer border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-overlay))] text-secondary',
                )}>
                <RotateCcw size={11} color={restored ? 'currentColor' : 'var(--accent)'} />
                <span>{restored ? t('已还原') : t('还原')}</span>
              </button>
            </Tiptop>
          ) : null}
        </div>
        <div className="inline-flex shrink-0 items-center gap-2">
          {status ? (
            <div style={{ border: statusPalette.border, background: statusPalette.background, color: statusPalette.color }} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold">
              {statusPalette.tone === 'success' ? <Check size={11} color="currentColor" strokeWidth={2.5} /> : null}
              {statusPalette.tone === 'danger' ? <X size={11} color="currentColor" strokeWidth={2.5} /> : null}
              {/* 同 title：动态状态文案兜底 */}
              <span>{t(normalizedStatus as I18nKey)}</span>
            </div>
          ) : null}
          {resultTokenEstimateDisplay ? (
            <div className="whitespace-nowrap rounded-full border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-overlay))] px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-secondary">
              {resultTokenEstimateDisplay}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleToggleExpand}
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center border-none bg-transparent">
            <ChevronDown
              size={14}
              color="var(--text-tertiary)"
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 300ms ease',
              }}
            />
          </button>
        </div>
      </div>
      <div className="w-full overflow-hidden rounded-xl border border-line bg-overlay">
        <div
          className={cn(
            'grid gap-1 bg-overlay px-3 py-2.5',
            expanded || showInlineDiffPreview ? 'border-b border-b-line-subtle' : '',
          )}>
          {showRemainingFileEdits ? (
            <div
              className="inline-flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-overlay))] px-2 py-1 text-xs font-bold text-primary">
              <SquarePen size={12} color="var(--accent)" />
              <span>{t('预计剩余 {count} 个编辑文件').replace('{count}', String(normalizedRemainingFileEdits))}</span>
            </div>
          ) : (
            <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-tertiary">{actionLabel}</div>
          )}
          {readFileTokenEstimates.length > 0 ? (
            <ReadFileTokenList items={readFileTokenEstimates} t={t} />
          ) : (
            <div className="break-all text-base font-semibold text-primary">
              <AIChatMarkdown text={summary} enableQuoteContextMenu={true} />
            </div>
          )}
        </div>
        {showInlineDiffPreview ? (
          <div className="p-3">
            <CompactDiffPreview reviewBlocks={inlineDiffBlocks} rawDiff={inlineDiffRaw} loading={inlineDiffLoading} t={t} lang={lang} />
          </div>
        ) : null}
        {expanded ? (
          <div className={cn('grid gap-2.5 p-3', showInlineDiffPreview ? 'border-t border-t-line-subtle' : '')}>
            <pre className="m-0 max-h-[260px] overflow-x-auto overflow-y-auto overscroll-contain whitespace-pre-wrap font-mono text-sm leading-[1.65] text-secondary [word-break:break-word]">{code}</pre>
            {result ? (
              <div className="grid gap-1.5">
                <div className="text-xs uppercase tracking-[0.4px] text-tertiary">{t('result')}</div>
                <pre className="m-0 max-h-[320px] overflow-x-auto overflow-y-auto overscroll-contain whitespace-pre-wrap rounded-lg border border-line-subtle bg-canvas px-3 py-2.5 font-mono text-sm leading-[1.65] text-primary [word-break:break-word]">{/* result 为动态内容（可能不在翻译表），t() 内部有兜底 */}{t(result as I18nKey)}</pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
