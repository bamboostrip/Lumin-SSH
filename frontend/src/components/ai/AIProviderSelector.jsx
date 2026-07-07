import { Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../i18n.js'
import AIProviderListRow from './AIProviderListRow.jsx'
import AIProviderQuickEditOverlay from './AIProviderQuickEditOverlay.jsx'
import { getAIProviderState, normalizeAIProviderState, saveAIProviderState } from './aiProviderBridge.js'

const defaultProviders = []
const summaryTooltipDelay = 300

const cacheStrategyLabelKeys = {
  model: '基于模型能力',
  off: '强制关闭',
  '5m': '5分钟',
  '1h': '1小时',
}

function getCacheStrategyLabel(t, value) {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  return t(cacheStrategyLabelKeys[nextValue] || cacheStrategyLabelKeys.model)
}

function getApiKeyPreview(value) {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  if (!nextValue) {
    return ''
  }
  return nextValue.length <= 12 ? nextValue : nextValue.slice(-12)
}

function sortProviders(items) {
  return [...items].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

export default function AIProviderSelector({
  providers = defaultProviders,
  currentProviderId,
  onCurrentProviderChange,
  persistSelectedProviderId = true,
  dismissSignal = 0,
}) {
  const { t } = useTranslation()
  const containerRef = useRef(null)
  const tooltipTimerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [providerList, setProviderList] = useState(sortProviders(providers))
  const [persistedCurrentProviderId, setPersistedCurrentProviderId] = useState(providers[0]?.id || '')
  const [panelBounds, setPanelBounds] = useState(null)
  const [dropdownMetrics, setDropdownMetrics] = useState(null)
  const [triggerRect, setTriggerRect] = useState(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipTriggerRect, setTooltipTriggerRect] = useState(null)
  const expandLeft = triggerRect ? triggerRect.left + 400 > window.innerWidth - 16 : false
  const tooltipExpandLeft = tooltipTriggerRect ? tooltipTriggerRect.left + 280 > window.innerWidth - 16 : false
  const [editingState, setEditingState] = useState({ open: false, mode: 'edit', provider: null })
  const isControlled = typeof currentProviderId === 'string'
  const effectiveSelectedId = isControlled ? currentProviderId : persistedCurrentProviderId

  const selectedProvider = useMemo(
    () => providerList.find((item) => item.id === effectiveSelectedId) || null,
    [providerList, effectiveSelectedId],
  )

  const providerSummaryRows = useMemo(() => ([
    { label: t('供应商'), value: selectedProvider?.name || t('选择供应商') },
    { label: t('模型'), value: selectedProvider?.model || t('未选择模型') },
    { label: t('API兼容方式'), value: selectedProvider?.provider || 'Compatible' },
    { label: t('缓存策略'), value: getCacheStrategyLabel(t, selectedProvider?.cacheStrategy) },
    { label: 'Key', value: getApiKeyPreview(selectedProvider?.apiKey) || '-' },
  ]), [selectedProvider, t])

  const closeTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      window.clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
    setTooltipVisible(false)
  }, [])

  const handleTriggerMouseEnter = useCallback(() => {
    if (open || editingState.open) {
      return
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setTooltipTriggerRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom })
    }
    if (tooltipTimerRef.current) {
      window.clearTimeout(tooltipTimerRef.current)
    }
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltipVisible(true)
      tooltipTimerRef.current = null
    }, summaryTooltipDelay)
  }, [editingState.open, open])

  const filteredProviders = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase()
    const sortedProviders = sortProviders(providerList)
    if (!keyword) {
      return sortedProviders
    }
    return sortedProviders.filter((item) => {
      const haystack = `${item.name} ${item.model || ''} ${item.provider || ''}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [providerList, searchValue])

  const pinnedProviders = useMemo(
    () => filteredProviders.filter((item) => item.pinned),
    [filteredProviders],
  )

  const normalProviders = useMemo(
    () => filteredProviders.filter((item) => !item.pinned),
    [filteredProviders],
  )

  const persistRegistryState = useCallback(async (nextProviders, nextPersistedId) => {
    const savedState = await saveAIProviderState({
      currentProviderId: nextPersistedId,
      providers: nextProviders,
    })
    const sortedProviders = sortProviders(savedState.providers)
    const sortedCurrentProviderId = savedState.currentProviderId || nextPersistedId || sortedProviders[0]?.id || ''
    setProviderList(sortedProviders)
    setPersistedCurrentProviderId(sortedCurrentProviderId)
    return {
      providers: sortedProviders,
      currentProviderId: sortedCurrentProviderId,
    }
  }, [])

  const getPersistedSelectionId = useCallback((nextProviders, preferredId) => {
    if (persistSelectedProviderId || !isControlled) {
      return preferredId
    }
    if (persistedCurrentProviderId && nextProviders.some((item) => item.id === persistedCurrentProviderId)) {
      return persistedCurrentProviderId
    }
    return nextProviders[0]?.id || ''
  }, [isControlled, persistSelectedProviderId, persistedCurrentProviderId])

  useEffect(() => {
    let cancelled = false

    getAIProviderState()
      .then(async (state) => {
        if (cancelled) {
          return
        }
        const hasPersistedProviders = Array.isArray(state.providers) && state.providers.length > 0
        const nextState = hasPersistedProviders
          ? state
          : normalizeAIProviderState({ currentProviderId: providers[0]?.id || '', providers })
        const nextProviders = sortProviders(nextState.providers)
        const nextSelectedId = nextState.currentProviderId || nextProviders[0]?.id || ''

        setProviderList(nextProviders)
        setPersistedCurrentProviderId(nextSelectedId)

        if (!hasPersistedProviders) {
          await persistRegistryState(nextProviders, nextSelectedId)
        }
      })
      .catch(async () => {
        if (cancelled) {
          return
        }
        const nextState = normalizeAIProviderState({ currentProviderId: providers[0]?.id || '', providers })
        const nextProviders = sortProviders(nextState.providers)
        const nextSelectedId = nextState.currentProviderId || nextProviders[0]?.id || ''
        setProviderList(nextProviders)
        setPersistedCurrentProviderId(nextSelectedId)
        await persistRegistryState(nextProviders, nextSelectedId)
      })

    return () => {
      cancelled = true
    }
  }, [persistRegistryState, providers])

  useEffect(() => () => closeTooltip(), [closeTooltip])

  useEffect(() => {
    if (!tooltipVisible) {
      return undefined
    }

    const updateTooltipRect = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        setTooltipVisible(false)
        return
      }
      setTooltipTriggerRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom })
    }

    updateTooltipRect()
    window.addEventListener('resize', updateTooltipRect)
    window.addEventListener('scroll', updateTooltipRect, true)

    return () => {
      window.removeEventListener('resize', updateTooltipRect)
      window.removeEventListener('scroll', updateTooltipRect, true)
    }
  }, [tooltipVisible])

  useEffect(() => {
    if (open || editingState.open) {
      closeTooltip()
    }
  }, [closeTooltip, editingState.open, open])

  useEffect(() => {
    if (!open || editingState.open) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open, editingState.open])

  useEffect(() => {
    if (!editingState.open && !open) {
      setTriggerRect(null)
      return undefined
    }

    const updatePanelBounds = () => {
      const root = containerRef.current?.closest('[data-ai-panel-root="true"]')
      const chatStage = root?.querySelector('[data-ai-chat-stage="true"]')
      const composerInputZone = root?.querySelector('[data-ai-composer-input-zone="true"]')
      const fallbackPanel = root || chatStage || composerInputZone

      if (!fallbackPanel) {
        setPanelBounds(null)
        setDropdownMetrics(null)
        return
      }

      const fallbackRect = fallbackPanel.getBoundingClientRect()
      const chatRect = chatStage?.getBoundingClientRect()
      const composerRect = composerInputZone?.getBoundingClientRect()

      const top = Math.min(chatRect?.top ?? fallbackRect.top, composerRect?.top ?? fallbackRect.top)
      const left = Math.min(chatRect?.left ?? fallbackRect.left, composerRect?.left ?? fallbackRect.left)
      const right = Math.max(chatRect?.right ?? fallbackRect.right, composerRect?.right ?? fallbackRect.right)
      const bottom = Math.max(chatRect?.bottom ?? fallbackRect.bottom, composerRect?.bottom ?? fallbackRect.bottom)

      setPanelBounds({
        top,
        left,
        width: right - left,
        height: bottom - top,
      })

      const triggerRectData = containerRef.current?.getBoundingClientRect()
      if (triggerRectData) {
        setDropdownMetrics({
          width: Math.min(400, window.innerWidth - triggerRectData.left - 16),
          maxHeight: Math.max(120, triggerRectData.top - top - 8),
        })
        setTriggerRect({ top: triggerRectData.top, left: triggerRectData.left, right: triggerRectData.right, bottom: triggerRectData.bottom })
      }
    }

    updatePanelBounds()
    window.addEventListener('resize', updatePanelBounds)
    window.addEventListener('scroll', updatePanelBounds, true)

    return () => {
      window.removeEventListener('resize', updatePanelBounds)
      window.removeEventListener('scroll', updatePanelBounds, true)
    }
  }, [editingState.open, open])

  useEffect(() => {
    closeTooltip()
    setOpen(false)
    setTriggerRect(null)
    setTooltipTriggerRect(null)
    setDropdownMetrics(null)
    setPanelBounds(null)
    setEditingState({ open: false, mode: 'edit', provider: null })
  }, [closeTooltip, dismissSignal])

  const notifySelectionChange = useCallback(async (providerId) => {
    if (typeof onCurrentProviderChange === 'function') {
      await onCurrentProviderChange(providerId)
    }
  }, [onCurrentProviderChange])

  const handleOpenEditor = (mode, provider = null) => {
    setOpen(false)
    setEditingState({ open: true, mode, provider })
  }

  const handleSelectProvider = async (providerId) => {
    setOpen(false)
    if (!isControlled || persistSelectedProviderId) {
      await persistRegistryState(providerList, providerId)
    } else if (!isControlled) {
      setPersistedCurrentProviderId(providerId)
    }
    await notifySelectionChange(providerId)
  }

  const handleSaveProvider = async (draft) => {
    const savedProvider = {
      id: draft.id || `ai-provider-${Date.now()}`,
      name: draft.name?.trim() || t('未命名供应商'),
      provider: draft.provider?.trim() || 'Compatible',
      model: draft.model?.trim() || t('未选择模型'),
      baseUrl: draft.baseUrl?.trim() || '',
      apiKey: draft.apiKey?.trim() || '',
      cacheStrategy: draft.cacheStrategy || 'model',
      webSearchEnabled: Boolean(draft.webSearchEnabled),
      dedicatedWebSearchEnabled: Boolean(draft.dedicatedWebSearchEnabled),
      dedicatedWebSearchProviderId: draft.dedicatedWebSearchProviderId || '',
      reasoningEffort: draft.reasoningEffort || 'disable',
      enableReasoningEffort: Boolean(draft.enableReasoningEffort),
      modelMaxTokens: Number.isFinite(Number(draft.modelMaxTokens)) && Number(draft.modelMaxTokens) > 0
        ? Math.floor(Number(draft.modelMaxTokens))
        : 0,
      modelMaxThinkingTokens: Number.isFinite(Number(draft.modelMaxThinkingTokens)) && Number(draft.modelMaxThinkingTokens) > 0
        ? Math.floor(Number(draft.modelMaxThinkingTokens))
        : 0,
      pinned: Boolean(draft.pinned),
      updatedAt: Date.now(),
    }

    const nextBaseProviders = providerList.some((item) => item.id === savedProvider.id)
      ? providerList.map((item) => (item.id === savedProvider.id ? { ...item, ...savedProvider } : item))
      : [savedProvider, ...providerList]

    const normalizedState = normalizeAIProviderState({
      currentProviderId: getPersistedSelectionId(nextBaseProviders, savedProvider.id),
      providers: nextBaseProviders,
    })
    const nextProviders = sortProviders(normalizedState.providers)

    await persistRegistryState(nextProviders, normalizedState.currentProviderId)
    setOpen(false)
    setEditingState({ open: false, mode: 'edit', provider: null })
    await notifySelectionChange(savedProvider.id)
  }

  const handleDeleteProvider = async (provider) => {
    if (!provider) {
      return
    }
    const confirmed = await window.luminDialog?.confirm(`${t('确定删除供应商')}「${provider.name || provider.provider || provider.id}」？${t('此操作不可撤销')}`)
    if (!confirmed) {
      return
    }

    const nextBaseProviders = providerList.filter((item) => item.id !== provider.id)
    const fallbackSelectedId = nextBaseProviders[0]?.id || ''
    const normalizedState = normalizeAIProviderState({
      currentProviderId: getPersistedSelectionId(
        nextBaseProviders,
        persistedCurrentProviderId === provider.id ? fallbackSelectedId : persistedCurrentProviderId,
      ),
      providers: nextBaseProviders,
    })
    const nextProviders = sortProviders(normalizedState.providers)

    await persistRegistryState(nextProviders, normalizedState.currentProviderId)
    setOpen(false)
    setEditingState({ open: false, mode: 'edit', provider: null })

    if (effectiveSelectedId === provider.id) {
      await notifySelectionChange(fallbackSelectedId)
    }
  }

  const handleTogglePin = async (item) => {
    const nextBaseProviders = providerList.map((entry) => (
      entry.id === item.id ? { ...entry, pinned: !entry.pinned, updatedAt: Date.now() } : entry
    ))
    const normalizedState = normalizeAIProviderState({
      currentProviderId: getPersistedSelectionId(nextBaseProviders, persistedCurrentProviderId || nextBaseProviders[0]?.id || ''),
      providers: nextBaseProviders,
    })
    await persistRegistryState(sortProviders(normalizedState.providers), normalizedState.currentProviderId)
  }

  const renderRows = (items) => (
    <div>
      {items.map((item) => (
        <AIProviderListRow
          key={item.id}
          item={item}
          active={item.id === effectiveSelectedId}
          onSelect={() => handleSelectProvider(item.id)}
          onEdit={() => handleOpenEditor('edit', item)}
          onTogglePin={() => handleTogglePin(item)}
        />
      ))}
    </div>
  )

  return (
    <>
      <div ref={containerRef} style={{ position: 'relative', flexShrink: 0, overflow: 'visible', zIndex: open ? 40 : 'auto' }}>
        <button
          type="button"
          onClick={() => {
            closeTooltip()
            setOpen((prev) => !prev)
          }}
          onMouseEnter={handleTriggerMouseEnter}
          onMouseLeave={closeTooltip}
          onFocus={handleTriggerMouseEnter}
          onBlur={closeTooltip}
          style={{
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 10px',
            borderRadius: 8,
            border: `1px solid ${open ? 'var(--accent-border)' : 'var(--border)'}`,
            background: open ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 500,
            transition: 'var(--transition)',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{selectedProvider?.name || t('选择供应商')}</span>
        </button>

        {tooltipVisible && tooltipTriggerRect && !open && !editingState.open ? (
          <div
            style={{
              position: 'fixed',
              ...(tooltipExpandLeft
                ? { right: Math.max(16, window.innerWidth - tooltipTriggerRect.right) }
                : { left: Math.max(16, tooltipTriggerRect.left) }),
              bottom: window.innerHeight - tooltipTriggerRect.top + 8,
              width: 'max-content',
              maxWidth: Math.max(180, (tooltipExpandLeft ? tooltipTriggerRect.right : window.innerWidth - tooltipTriggerRect.left) - 16),
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-overlay)',
              boxShadow: 'var(--shadow-xl)',
              display: 'grid',
              gap: 6,
              zIndex: 10001,
              pointerEvents: 'none',
            }}
          >
            {providerSummaryRows.map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.label}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    maxWidth: '100%',
                    fontSize: 11.5,
                    color: 'var(--text-primary)',
                    lineHeight: 1.45,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
            <div
              style={{
                position: 'absolute',
                bottom: -6,
                ...(tooltipExpandLeft ? { right: 20 } : { left: 20 }),
                width: 10,
                height: 10,
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-overlay)',
                transform: 'rotate(45deg)',
              }}
            />
          </div>
        ) : null}

        {open && triggerRect && (
          <div
            style={{
              position: 'fixed',
              ...(expandLeft ? { right: window.innerWidth - triggerRect.right } : { left: triggerRect.left }),
              bottom: window.innerHeight - triggerRect.top + 8,
              width: 400,
              maxWidth: 'min(400px, calc(100vw - 32px))',
              maxHeight: dropdownMetrics?.maxHeight ?? 320,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface-overlay)',
              boxShadow: 'var(--shadow-xl)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 10000,
            }}
          >
            <div style={{ padding: 10, display: 'grid', gap: 8, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{t('供应商列表')}</div>
                <button
                  type="button"
                  title={t('添加供应商')}
                  aria-label={t('添加供应商')}
                  onClick={() => handleOpenEditor('create', null)}
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 0,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    transition: 'var(--transition)',
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-tertiary)' }} />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t('搜索...')}
                  style={{
                    width: '100%',
                    height: 36,
                    borderRadius: 0,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-base)',
                    color: 'var(--text-primary)',
                    padding: '0 10px 0 32px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {filteredProviders.length === 0 ? (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {t('没有匹配的供应商')}
                </div>
              ) : (
                <>
                  {pinnedProviders.length > 0 ? (
                    <div style={{ flexShrink: 0, borderBottom: normalProviders.length > 0 ? '1px solid var(--border-subtle)' : 'none', background: 'var(--surface-overlay)' }}>
                      {renderRows(pinnedProviders)}
                    </div>
                  ) : null}
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {normalProviders.length > 0 ? renderRows(normalProviders) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <AIProviderQuickEditOverlay
        open={editingState.open}
        mode={editingState.mode}
        provider={editingState.provider}
        providers={providerList}
        panelBounds={panelBounds}
        onClose={() => setEditingState({ open: false, mode: 'edit', provider: null })}
        onSave={handleSaveProvider}
        onDelete={handleDeleteProvider}
      />
    </>
  )
}