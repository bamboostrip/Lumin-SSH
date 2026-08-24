import { ArrowLeft, Check, CircleHelp, Globe, Save, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Z } from '../../constants/zIndex.ts'
import { useTranslation, t as translate, type I18nKey } from '../../i18n.ts'
import { getAIGlobalSettings } from './aiGlobalSettingsBridge.ts'
import { getAIProviderPromptCachePolicy, type AIProviderPromptCachePolicy } from './aiProviderBridge.ts'
import {
  availableAIProviders,
  canUseDedicatedWebSearchCandidate,
  getAIProviderDefinition,
} from './providers/index.ts'
import { handleInputDragSelectAll } from './inputDragSelect.ts'
import type { AIProviderLike } from './AIProviderSelector.tsx'

const defaultCacheOptions: Array<{ value: string; labelKey: I18nKey }> = [
  { value: 'model', labelKey: '基于模型能力' },
  { value: 'off', labelKey: '强制关闭' },
  { value: '5m', labelKey: '5分钟' },
  { value: '1h', labelKey: '1小时' },
]

const reasoningEffortLabels: Record<string, I18nKey> = {
  disable: '无',
  none: '无',
  minimal: '最少',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最高',
}

const DEFAULT_MAX_OUTPUT_TOKENS = 16384
const DEFAULT_MAX_THINKING_TOKENS = 8192
const DEFAULT_EFFORT_REASONING_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max']
const providerHighlightLabelKeys: Record<string, I18nKey> = {
  Compatible: '高兼容',
  Responses: '高缓存',
}
const selfWebSearchProviderValue = '__self__'
const responsePromptCacheStrategyLabelKeys: Record<string, I18nKey> = {
  off: '强制关闭',
  model: '基于模型能力',
  '30m': '30分钟',
  in_memory: '内存缓存',
  '24h': '24小时',
}

function getProviderDisplayLabel(provider: { value?: string; label?: string } | null | undefined, t: (key: I18nKey) => string) {
  if (!provider || typeof provider !== 'object') {
    return ''
  }
  const providerValue = typeof provider.value === 'string' ? provider.value : ''
  const highlightLabelKey = providerValue ? providerHighlightLabelKeys[providerValue] : undefined
  if (!highlightLabelKey) {
    return provider.label || ''
  }
  return `(${t(highlightLabelKey as I18nKey)})${provider.label || ''}`
}

function getAppBridge() {
  return window?.go?.wailsapp?.AIBindings || window?.go?.wailsapp?.AIProviderBindings || window?.go?.wailsapp?.App
}

function normalizePositiveInteger(value: unknown, fallback = 0) {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return fallback
  }
  return Math.floor(nextValue)
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null
  }
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : null
}

function buildInitialModelOptions(providerDefinition: unknown, model: string) {
  const trimmedModel = typeof model === 'string' ? model.trim() : ''
  const initialModels = Array.isArray((providerDefinition as Record<string, unknown> | null)?.initialModels)
    ? (providerDefinition as Record<string, unknown>).initialModels
    : []
  const options: string[] = [...initialModels as string[]]
  if (trimmedModel && !options.includes(trimmedModel)) {
    options.unshift(trimmedModel)
  }
  return options
}

function buildReasoningOptionsForCapability(capability: Record<string, unknown> | null | undefined) {
  if (capability?.reasoningMode !== 'effort') {
    return []
  }
  const supportedValues = Array.isArray(capability?.supportsReasoningEffort)
    ? capability.supportsReasoningEffort.filter((value) => typeof value === 'string' && value.trim())
    : []
  const nextOptions = capability?.requiredReasoningEffort
    ? supportedValues
    : ['disable', ...supportedValues.filter((value) => value !== 'disable')]
  return [...new Set(nextOptions)]
}

function getReasoningOptionLabel(value: string) {
  const nextValue = typeof value === 'string' ? value.trim().toLowerCase() : ''
  // 动态 key：reasoningEffortLabels 的值均为合法 i18n 键，未知值原样兜底
  return translate((reasoningEffortLabels[nextValue] || nextValue || '无') as I18nKey)
}

function supportsUnifiedEffortReasoning(providerValue: string) {
  return providerValue === 'Compatible' || providerValue === 'Responses' || providerValue === 'Messages'
}

interface ModelCapabilityLike {
  modelId?: string
  reasoningMode?: string
  reasoningEffort?: string
  supportsReasoningEffort?: string[]
  maxTokens?: number
  maxThinkingTokens?: number
  requiredReasoningBudget?: boolean
  requiredReasoningEffort?: boolean
  [key: string]: unknown
}

function buildDisplayModelCapability(providerValue: string, capability: ModelCapabilityLike): ModelCapabilityLike {
  if (!supportsUnifiedEffortReasoning(providerValue)) {
    return capability
  }
  return {
    ...capability,
    supportsReasoningBinary: false,
    supportsReasoningBudget: false,
    requiredReasoningBudget: false,
    supportsReasoningEffort: [...DEFAULT_EFFORT_REASONING_OPTIONS],
    requiredReasoningEffort: false,
    reasoningMode: 'effort',
    reasoningEffort: typeof capability?.reasoningEffort === 'string' && capability.reasoningEffort.trim()
      ? capability.reasoningEffort.trim().toLowerCase()
      : 'medium',
    maxTokens: 0,
    maxThinkingTokens: 0,
  }
}

function resolveEffortReasoningSelection(draft: ProviderDraft | Record<string, unknown>, capability: Record<string, unknown> | null | undefined) {
  if (capability?.reasoningMode !== 'effort') {
    return 'disable'
  }
  const availableOptions = buildReasoningOptionsForCapability(capability)
  const storedValue = typeof (draft as Record<string, unknown>).reasoningEffort === 'string' ? String((draft as Record<string, unknown>).reasoningEffort).trim().toLowerCase() : ''

  if (capability?.requiredReasoningEffort) {
    if (storedValue && availableOptions.includes(storedValue)) {
      return storedValue
    }
    return typeof capability?.reasoningEffort === 'string' ? capability.reasoningEffort : (availableOptions[0] || 'high')
  }

  if ((draft as Record<string, unknown>).enableReasoningEffort === false) {
    return 'disable'
  }

  if (storedValue && availableOptions.includes(storedValue)) {
    return storedValue
  }

  return storedValue || 'disable'
}

interface ProviderDraft {
  id: string
  name: string
  provider: string
  cacheStrategy: string
  openAiResponsesUsePromptCacheRetention: boolean
  modelTemperature: number | null
  modelTopP: number | null
  baseUrl: string
  apiKey: string
  model: string
  webSearchEnabled: boolean
  dedicatedWebSearchEnabled: boolean
  dedicatedWebSearchProviderId: string
  dedicatedProxyEnabled: boolean
  dedicatedProxyId: string
  reasoningEffort: string
  enableReasoningEffort: boolean
  openAiLegacyReasoningFormatEnabled: boolean
  modelMaxTokens: number
  modelMaxThinkingTokens: number
  pinned: boolean
}

function buildDraft(provider?: AIProviderLike | null): ProviderDraft {
  const providerDefinition = getAIProviderDefinition(provider?.provider || 'Compatible')
  const resolvedModel = typeof provider?.model === 'string' && provider.model.trim()
    ? provider.model.trim()
    : ''
  const capability = providerDefinition.getModelCapability(resolvedModel)

  return {
    id: typeof provider?.id === 'string' && provider.id.trim() ? provider.id.trim() : '',
    name: typeof provider?.name === 'string' ? provider.name : '',
    provider: providerDefinition.value,
    cacheStrategy: typeof provider?.cacheStrategy === 'string' && provider.cacheStrategy.trim()
      ? provider.cacheStrategy.trim()
      : (providerDefinition.value === 'Responses' ? 'model' : '5m'),
    openAiResponsesUsePromptCacheRetention: provider?.openAiResponsesUsePromptCacheRetention === true,
    modelTemperature: normalizeOptionalNumber(provider?.modelTemperature),
    modelTopP: normalizeOptionalNumber(provider?.modelTopP),
    baseUrl: typeof provider?.baseUrl === 'string' ? provider.baseUrl : '',
    apiKey: typeof provider?.apiKey === 'string' ? provider.apiKey : '',
    model: resolvedModel,
    webSearchEnabled: provider?.webSearchEnabled !== false,
    dedicatedWebSearchEnabled: Boolean(provider?.dedicatedWebSearchEnabled),
    dedicatedWebSearchProviderId: provider?.dedicatedWebSearchEnabled === true && typeof provider?.dedicatedWebSearchProviderId === 'string' && provider.dedicatedWebSearchProviderId.trim()
      ? provider.dedicatedWebSearchProviderId.trim()
      : selfWebSearchProviderValue,
    dedicatedProxyEnabled: Boolean(provider?.dedicatedProxyEnabled),
    dedicatedProxyId: typeof provider?.dedicatedProxyId === 'string' ? provider.dedicatedProxyId.trim() : '',
    reasoningEffort: typeof provider?.reasoningEffort === 'string' && provider.reasoningEffort.trim()
      ? provider.reasoningEffort.trim().toLowerCase()
      : (typeof capability.reasoningEffort === 'string' ? capability.reasoningEffort : 'disable'),
    enableReasoningEffort: provider?.enableReasoningEffort === true
      || (typeof provider?.reasoningEffort === 'string' && provider.reasoningEffort.trim().toLowerCase() !== 'disable')
      || normalizePositiveInteger(provider?.modelMaxTokens) > 0
      || normalizePositiveInteger(provider?.modelMaxThinkingTokens) > 0
      || capability.requiredReasoningBudget === true
      || capability.requiredReasoningEffort === true,
    openAiLegacyReasoningFormatEnabled: provider?.openAiLegacyReasoningFormatEnabled === true,
    modelMaxTokens: normalizePositiveInteger(provider?.modelMaxTokens, capability.maxTokens || DEFAULT_MAX_OUTPUT_TOKENS),
    modelMaxThinkingTokens: normalizePositiveInteger(provider?.modelMaxThinkingTokens, capability.maxThinkingTokens || DEFAULT_MAX_THINKING_TOKENS),
    pinned: Boolean(provider?.pinned),
  }
}

interface SelectMenuOption {
  value: string
  label: string
}

function SelectMenu({ value, options, open, onToggle, onSelect, menuRef, menuWidth = '100%', showSelectedIcon = true, disabled = false, id, 'aria-labelledby': ariaLabelledBy, 'aria-label': ariaLabel }: {
  value: string
  options: SelectMenuOption[]
  open: boolean
  onToggle?: () => void
  onSelect: (value: string) => void
  menuRef?: React.Ref<HTMLDivElement>
  menuWidth?: string
  showSelectedIcon?: boolean
  disabled?: boolean
  id?: string
  'aria-labelledby'?: string
  'aria-label'?: string
}) {
  const currentOption = options.find((option) => option.value === value) || options[0]

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        id={id}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return
          }
          onToggle?.()
        }}
        className={`h-[34px] w-full box-border flex items-center justify-between px-3 rounded-[18px] border text-primary transition-[color,background-color,border-color,opacity] duration-[120ms] ${open ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)]' : 'border-line bg-canvas'} ${disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="min-w-0 truncate text-base font-medium">
          {currentOption?.label || value}
        </span>
        <span className={`text-tertiary text-xs ${open ? 'rotate-180' : 'rotate-0'}`}>▾</span>
      </button>

      {open && !disabled ? (
        <div
          style={{ width: menuWidth, zIndex: Z.COMPONENT_OVERLAY }}
          className="absolute left-0 top-[calc(100%_+_6px)] p-1 rounded-lg border border-line bg-overlay shadow-lg grid gap-0.5">
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
                className={`min-h-8 flex items-center justify-between gap-2 px-2.5 rounded-lg text-base text-left transition-colors duration-[120ms] cursor-pointer ${active ? 'bg-[rgba(var(--accent-rgb),0.12)] text-primary' : 'bg-transparent text-secondary'}`}>
                <span className="min-w-0 truncate">{option.label}</span>
                {active && showSelectedIcon ? <Check size={13} color="var(--accent)" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function StyledCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}) {
  const [focused, setFocused] = useState(false)
  return (
    <label className="inline-flex items-center gap-[7px] text-secondary text-sm leading-[1.2] cursor-pointer select-none">
      <span className="relative w-[18px] h-[18px] shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ zIndex: Z.CONTENT }}
          className="absolute inset-0 w-[18px] h-[18px] m-0 opacity-0 cursor-pointer"
        />
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center w-[18px] h-[18px] box-border rounded-sm text-white transition-colors duration-[80ms] ${checked ? 'border border-accent bg-accent' : 'border border-line bg-sunken'} ${focused ? 'shadow-[0_0_0_3px_var(--accent-dim)]' : ''}`}>
          {checked ? <Check size={12} strokeWidth={3} /> : null}
        </span>
      </span>
      <span>{children}</span>
    </label>
  )
}

export interface AIProviderQuickEditOverlayProps {
  open: boolean
  mode?: 'create' | 'edit'
  provider?: AIProviderLike | null
  providers?: AIProviderLike[]
  panelBounds?: { top: number; left: number; width: number; height: number } | null
  onClose: () => void
  onSave?: (draft: Record<string, unknown>) => void | Promise<void>
  onDelete?: (provider: AIProviderLike) => void | Promise<void>
}

export default function AIProviderQuickEditOverlay({ open, mode = 'edit', provider, providers = [], panelBounds, onClose, onSave, onDelete }: AIProviderQuickEditOverlayProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ProviderDraft>(buildDraft())
  const [modelQuery, setModelQuery] = useState('')
  const [modelOptions, setModelOptions] = useState<string[]>(buildInitialModelOptions(getAIProviderDefinition('Compatible'), ''))
  const [modelRefreshError, setModelRefreshError] = useState('')
  const [modelRefreshing, setModelRefreshing] = useState(false)
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [dedicatedProviderMenuOpen, setDedicatedProviderMenuOpen] = useState(false)
  const [dedicatedProviderSearch, setDedicatedProviderSearch] = useState('')
  const [validatingWebSearch, setValidatingWebSearch] = useState(false)
  const [webSearchValidationMessage, setWebSearchValidationMessage] = useState('')
  const [webSearchValidationPassed, setWebSearchValidationPassed] = useState(false)
  const [proxyNodes, setProxyNodes] = useState<Array<{ id?: string; name?: string; type?: string; host?: string; port?: number }>>([])
  const [proxyMenuOpen, setProxyMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic')
  const [modelPromptCachePolicy, setModelPromptCachePolicy] = useState<AIProviderPromptCachePolicy | null>(null)
  const providerFieldRef = useRef<HTMLDivElement | null>(null)
  const dedicatedProviderFieldRef = useRef<HTMLDivElement | null>(null)
  const dedicatedProxyFieldRef = useRef<HTMLDivElement | null>(null)
  const autoRefreshTimerRef = useRef<number | null>(null)
  const lastAutoRefreshKeyRef = useRef('')
  const providerDefinition = useMemo(
    () => getAIProviderDefinition(draft.provider),
    [draft.provider],
  )

  const providerOptions = useMemo(
    () => availableAIProviders.map((provider: { value: string; label?: string }) => ({
      value: provider.value,
      label: getProviderDisplayLabel(provider, t),
    })),
    [t],
  )

  const modelCapability = useMemo(() => {
    const baseCapability = providerDefinition.getModelCapability(draft.model || '')
    return buildDisplayModelCapability(draft.provider, baseCapability)
  }, [draft.provider, providerDefinition, draft.model])

  const effortReasoningOptions = useMemo(
    () => buildReasoningOptionsForCapability(modelCapability),
    [modelCapability],
  )

  const currentEffortReasoningSelection = useMemo(
    () => resolveEffortReasoningSelection(draft, modelCapability),
    [draft, modelCapability],
  )

  const resolvedMaxTokens = useMemo(
    () => normalizePositiveInteger(draft.modelMaxTokens, modelCapability.maxTokens || DEFAULT_MAX_OUTPUT_TOKENS),
    [draft.modelMaxTokens, modelCapability.maxTokens],
  )

  const maxThinkingTokenLimit = useMemo(
    () => Math.max(1024, Math.floor(resolvedMaxTokens * 0.8)),
    [resolvedMaxTokens],
  )

  const resolvedThinkingTokens = useMemo(() => {
    const fallbackValue = modelCapability.maxThinkingTokens || DEFAULT_MAX_THINKING_TOKENS
    return Math.min(
      normalizePositiveInteger(draft.modelMaxThinkingTokens, fallbackValue),
      maxThinkingTokenLimit,
    )
  }, [draft.modelMaxThinkingTokens, maxThinkingTokenLimit, modelCapability.maxThinkingTokens])

  const supportsPromptCacheSettings = providerDefinition.supportsPromptCacheSettings === true
  const usePromptCacheRetention =
    providerDefinition.value === 'Responses' && draft.openAiResponsesUsePromptCacheRetention === true
  const activeModelPromptCachePolicy = useMemo(() => {
    const currentModelId = draft.model.trim().toLowerCase()
    if (!currentModelId || modelPromptCachePolicy?.modelId.trim().toLowerCase() !== currentModelId) {
      return null
    }
    return modelPromptCachePolicy
  }, [draft.model, modelPromptCachePolicy])
  const responsePromptCacheOptionsReady =
    providerDefinition.value !== 'Responses' || (activeModelPromptCachePolicy?.availableFormats?.length ?? 0) > 0
  const promptCacheOptions = useMemo(() => {
    if (!supportsPromptCacheSettings) {
      return [] as Array<{ value: string; labelKey: I18nKey }>
    }
    if (providerDefinition.value === 'Responses') {
      const format = usePromptCacheRetention ? 'prompt_cache_retention' : 'prompt_cache_options'
      const durations = activeModelPromptCachePolicy?.availableFormats
        .find((option) => option.format === format)
        ?.durations || []
      return ['off', 'model', ...durations].map((value) => ({
        value,
        labelKey: responsePromptCacheStrategyLabelKeys[value] || value,
      }))
    }
    return defaultCacheOptions
  }, [activeModelPromptCachePolicy, providerDefinition, supportsPromptCacheSettings, usePromptCacheRetention])
  const selectedPromptCacheStrategy = useMemo(() => {
    const values = promptCacheOptions.map((option) => option.value)
    if (providerDefinition.value === 'Responses' && !responsePromptCacheOptionsReady && draft.cacheStrategy) {
      return draft.cacheStrategy
    }
    if (values.includes(draft.cacheStrategy)) {
      return draft.cacheStrategy
    }
    if (values.includes('model')) {
      return 'model'
    }
    return values[0] || 'model'
  }, [draft.cacheStrategy, promptCacheOptions, providerDefinition.value, responsePromptCacheOptionsReady])
  const promptCacheOfficialSupport = useMemo(() => {
    if (providerDefinition.value !== 'Responses' || !/^gpt-/i.test(draft.model.trim())) {
      return ''
    }
    if (!activeModelPromptCachePolicy?.known || !activeModelPromptCachePolicy.format || activeModelPromptCachePolicy.supportedDurations.length === 0) {
      return t('当前模型暂无已维护的官方缓存时长')
    }
    const defaultDuration = activeModelPromptCachePolicy.defaultDuration
      ? `,${t('模型默认')}:${activeModelPromptCachePolicy.defaultDuration}`
      : ''
    return `${t('当前模型官方支持')}:${activeModelPromptCachePolicy.format}=${activeModelPromptCachePolicy.supportedDurations.join('/')}${defaultDuration}`
  }, [activeModelPromptCachePolicy, draft.model, providerDefinition.value, t])
  const supportsWebSearch = providerDefinition.supportsWebSearch === true
  const dedicatedProviderOptions = useMemo(
    () => ([
      { value: selfWebSearchProviderValue, label: t('自身') },
      ...providers
        .filter((item) => item.id !== draft.id)
        .filter((item) => canUseDedicatedWebSearchCandidate(item.provider))
        .map((item) => ({
          value: item.id || '',
          label: item.model ? `${item.name || ''} · ${item.model}` : (item.name || ''),
        })),
    ]),
    [providers, draft.id, t],
  )

  const filteredDedicatedProviderOptions = useMemo(() => {
    const keyword = dedicatedProviderSearch.trim().toLowerCase()
    if (!keyword) {
      return dedicatedProviderOptions
    }
    return dedicatedProviderOptions.filter((item) => item.label.toLowerCase().includes(keyword))
  }, [dedicatedProviderOptions, dedicatedProviderSearch])

  const currentDedicatedProviderOption = useMemo(
    () => dedicatedProviderOptions.find((item) => item.value === draft.dedicatedWebSearchProviderId) || dedicatedProviderOptions[0] || null,
    [dedicatedProviderOptions, draft.dedicatedWebSearchProviderId],
  )

  const dedicatedProxyOptions = useMemo(() => ([
    { value: '', label: t('不使用') },
    ...proxyNodes.map((node) => ({
      value: node.id || '',
      label: [
        node.name || t('未命名节点'),
        `${node.type === 'http' ? 'http' : 'socks5'}://${node.host}:${node.port}`,
      ].join(' · '),
    })),
  ]), [proxyNodes, t])

  const currentDedicatedProxyOption = useMemo(
    () => dedicatedProxyOptions.find((item) => item.value === draft.dedicatedProxyId) || dedicatedProxyOptions[0] || null,
    [dedicatedProxyOptions, draft.dedicatedProxyId],
  )

  const selectedWebSearchProviderValue = currentDedicatedProviderOption?.value || selfWebSearchProviderValue
  const usingDedicatedWebSearchProvider = selectedWebSearchProviderValue !== selfWebSearchProviderValue
  const canValidateWebSearch = draft.webSearchEnabled && (
    usingDedicatedWebSearchProvider
      ? Boolean(selectedWebSearchProviderValue)
      : Boolean(draft.baseUrl && draft.apiKey && draft.model)
  )

  const title = draft.name || (mode === 'create' ? t('新增供应商') : t('编辑供应商'))
  const subtitle = mode === 'create' ? t('创建供应商配置...') : t('编辑...')


  const refreshModelsWithCredentials = async (providerValue: string, baseUrlValue: string, apiKeyValue: string, selectedModel = '') => {
    const trimmedProvider = typeof providerValue === 'string' ? providerValue.trim() : ''
    const trimmedBaseUrl = typeof baseUrlValue === 'string' ? baseUrlValue.trim() : ''
    const trimmedApiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : ''

    if (!trimmedBaseUrl || !trimmedApiKey) {
      setModelRefreshError('')
      return false
    }

    const refreshKey = `${trimmedProvider}::${trimmedBaseUrl}::${trimmedApiKey}`
    lastAutoRefreshKeyRef.current = refreshKey
    setModelRefreshing(true)
    setModelRefreshError('')

    const bridge = getAppBridge()
    if (!bridge?.RequestAIProviderModels) {
      setModelRefreshing(false)
      setModelRefreshError(t('当前环境不支持刷新模型'))
      return false
    }

    try {
      const requestProfile = {
        ...draft,
        provider: trimmedProvider || draft.provider,
        baseUrl: trimmedBaseUrl,
        apiKey: trimmedApiKey,
        model: selectedModel || draft.model,
        dedicatedProxyEnabled: Boolean(draft.dedicatedProxyEnabled),
        dedicatedProxyId: draft.dedicatedProxyId || '',
      }
      const models = bridge?.RequestAIProviderModelsWithProfile
        ? await bridge.RequestAIProviderModelsWithProfile(JSON.stringify(requestProfile))
        : await bridge.RequestAIProviderModels(trimmedBaseUrl, trimmedApiKey)
      const normalizedModels = Array.isArray(models)
        ? models.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
        : []

      if (normalizedModels.length === 0) {
        throw new Error(t('未获取到任何模型'))
      }

      const nextModels = selectedModel && !normalizedModels.includes(selectedModel)
        ? [selectedModel, ...normalizedModels]
        : normalizedModels

      setModelOptions(nextModels)

      return true
    } catch (error) {
      setModelOptions(buildInitialModelOptions(getAIProviderDefinition(trimmedProvider || draft.provider), selectedModel || draft.model))
      setModelRefreshError(error instanceof Error ? error.message : t('刷新模型失败'))
      return false
    } finally {
      setModelRefreshing(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const initialDraft = buildDraft(provider)
    const initialProviderDefinition = getAIProviderDefinition(initialDraft.provider)
    setDraft(initialDraft)
    setModelOptions(buildInitialModelOptions(initialProviderDefinition, initialDraft.model))
    setModelRefreshError('')
    setModelRefreshing(false)
    setModelQuery('')
    setProviderMenuOpen(false)
    setDedicatedProviderMenuOpen(false)
    setDedicatedProviderSearch('')
    setProxyMenuOpen(false)
    setActiveTab('basic')
    setValidatingWebSearch(false)
    setWebSearchValidationMessage('')
    setWebSearchValidationPassed(false)
    getAIGlobalSettings()
      .then((settings) => {
        const nextProxyNodes = Array.isArray(settings?.proxyNodes) ? settings.proxyNodes : []
        setProxyNodes(nextProxyNodes)
      })
      .catch(() => {
        setProxyNodes([])
      })
    if (initialDraft.baseUrl.trim() && initialDraft.apiKey.trim()) {
      void refreshModelsWithCredentials(initialDraft.provider, initialDraft.baseUrl, initialDraft.apiKey, initialDraft.model)
    } else {
      lastAutoRefreshKeyRef.current = ''
    }
  }, [open, provider])

  useEffect(() => {
    let cancelled = false
    if (!open || providerDefinition.value !== 'Responses' || !draft.model.trim()) {
      setModelPromptCachePolicy(null)
      return () => {
        cancelled = true
      }
    }
    void getAIProviderPromptCachePolicy(draft.model).then((policy) => {
      if (!cancelled) {
        setModelPromptCachePolicy(policy)
      }
    })
    return () => {
      cancelled = true
    }
  }, [draft.model, open, providerDefinition.value])

  // 代理节点变更时实时刷新下拉列表
  useEffect(() => {
    if (!open) return undefined
    const handler = (event: Event) => {
      const newProxyNodes = (event as CustomEvent<unknown>).detail
      if (Array.isArray(newProxyNodes)) setProxyNodes(newProxyNodes as Array<{ id?: string; name?: string; type?: string; host?: string; port?: number }>)
    }
    window.addEventListener('lumin:proxy-nodes-changed', handler)
    return () => window.removeEventListener('lumin:proxy-nodes-changed', handler)
  }, [open])


  useEffect(() => {
    if (!providerMenuOpen && !dedicatedProviderMenuOpen && !proxyMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (providerFieldRef.current && !providerFieldRef.current.contains(event.target as Node)) {
        setProviderMenuOpen(false)
      }
      if (dedicatedProviderFieldRef.current && !dedicatedProviderFieldRef.current.contains(event.target as Node)) {
        setDedicatedProviderMenuOpen(false)
      }
      if (dedicatedProxyFieldRef.current && !dedicatedProxyFieldRef.current.contains(event.target as Node)) {
        setProxyMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [providerMenuOpen, dedicatedProviderMenuOpen, proxyMenuOpen])

  useEffect(() => {
    setWebSearchValidationMessage('')
    setWebSearchValidationPassed(false)
  }, [
    draft.provider,
    draft.baseUrl,
    draft.apiKey,
    draft.model,
    draft.webSearchEnabled,
    draft.dedicatedWebSearchEnabled,
    draft.dedicatedWebSearchProviderId,
  ])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const trimmedBaseUrl = draft.baseUrl.trim()
    const trimmedApiKey = draft.apiKey.trim()

    if (!trimmedBaseUrl || !trimmedApiKey) {
      lastAutoRefreshKeyRef.current = ''
      if (autoRefreshTimerRef.current) {
        window.clearTimeout(autoRefreshTimerRef.current)
      }
      return undefined
    }

    const refreshKey = `${draft.provider.trim()}::${trimmedBaseUrl}::${trimmedApiKey}`
    if (refreshKey === lastAutoRefreshKeyRef.current) {
      return undefined
    }

    if (autoRefreshTimerRef.current) {
      window.clearTimeout(autoRefreshTimerRef.current)
    }

    autoRefreshTimerRef.current = window.setTimeout(() => {
      void refreshModelsWithCredentials(draft.provider, trimmedBaseUrl, trimmedApiKey, draft.model)
    }, 1000)

    return () => {
      if (autoRefreshTimerRef.current) {
        window.clearTimeout(autoRefreshTimerRef.current)
      }
    }
  }, [open, draft.provider, draft.baseUrl, draft.apiKey, draft.model])

  const filteredModels = useMemo(() => {
    const keyword = modelQuery.trim().toLowerCase()
    if (!keyword) {
      return modelOptions
    }
    return modelOptions.filter((item) => item.toLowerCase().includes(keyword))
  }, [modelOptions, modelQuery])

  if (!open) {
    return null
  }

  const handleProviderSelect = (nextProvider: string) => {
    const nextProviderDefinition = getAIProviderDefinition(nextProvider)
    setDraft((prev) => {
      const nextModel = typeof prev.model === 'string' ? prev.model.trim() : ''
      const nextCapability = nextProviderDefinition.getModelCapability(nextModel)
      return {
        ...prev,
        provider: nextProviderDefinition.value,
        model: nextModel,
        cacheStrategy: nextProviderDefinition.value === 'Responses' && prev.provider !== 'Responses'
          ? 'model'
          : (prev.cacheStrategy || '5m'),
        reasoningEffort: prev.reasoningEffort || (typeof nextCapability.reasoningEffort === 'string' ? nextCapability.reasoningEffort : '') || 'disable',
        enableReasoningEffort: nextCapability.requiredReasoningBudget || nextCapability.requiredReasoningEffort
          ? true
          : prev.enableReasoningEffort,
        modelMaxTokens: prev.modelMaxTokens || nextCapability.maxTokens || DEFAULT_MAX_OUTPUT_TOKENS,
        modelMaxThinkingTokens: prev.modelMaxThinkingTokens || nextCapability.maxThinkingTokens || DEFAULT_MAX_THINKING_TOKENS,
      }
    })
    setModelOptions(buildInitialModelOptions(nextProviderDefinition, typeof draft.model === 'string' ? draft.model.trim() : ''))
    setModelQuery('')
    setProviderMenuOpen(false)
  }

  const handleWebSearchProviderSelect = (nextProviderId: string) => {
    const normalizedProviderId = dedicatedProviderOptions.some((item) => item.value === nextProviderId)
      ? nextProviderId
      : selfWebSearchProviderValue
    setDraft((prev) => ({
      ...prev,
      dedicatedWebSearchEnabled: normalizedProviderId !== selfWebSearchProviderValue,
      dedicatedWebSearchProviderId: normalizedProviderId,
    }))
    setDedicatedProviderMenuOpen(false)
    setDedicatedProviderSearch('')
  }

  const handleWebSearchToggle = () => {
    setDraft((prev) => ({
      ...prev,
      webSearchEnabled: !prev.webSearchEnabled,
    }))
  }

  const handleRefreshModels = async () => {
    const trimmedBaseUrl = draft.baseUrl.trim()
    const trimmedApiKey = draft.apiKey.trim()

    if (!trimmedBaseUrl) {
      setModelRefreshError(t('请先填写基础 URL'))
      return
    }

    if (!trimmedApiKey) {
      setModelRefreshError(t('请先填写 API 密钥'))
      return
    }

    await refreshModelsWithCredentials(draft.provider, trimmedBaseUrl, trimmedApiKey, draft.model)
  }

  const handleValidateWebSearch = async () => {
    if (!canValidateWebSearch || validatingWebSearch) {
      return
    }
    const bridge = getAppBridge()
    if (!bridge?.ValidateAIProviderWebSearch) {
      setWebSearchValidationPassed(false)
      setWebSearchValidationMessage(t('不支持'))
      return
    }

    setValidatingWebSearch(true)
    setWebSearchValidationPassed(false)
    setWebSearchValidationMessage('')

    try {
      const resolvedWebSearchProviderValue = dedicatedProviderOptions.some((item) => item.value === draft.dedicatedWebSearchProviderId)
        ? draft.dedicatedWebSearchProviderId
        : selfWebSearchProviderValue
      const useDedicatedWebSearchProvider = resolvedWebSearchProviderValue !== selfWebSearchProviderValue
      const result = await bridge.ValidateAIProviderWebSearch(JSON.stringify({
        ...draft,
        provider: providerDefinition.value,
        model: draft.model?.trim() || '',
        webSearchEnabled: draft.webSearchEnabled,
        dedicatedWebSearchEnabled: useDedicatedWebSearchProvider,
        dedicatedWebSearchProviderId: useDedicatedWebSearchProvider ? resolvedWebSearchProviderValue : '',
        reasoningEffort: draft.reasoningEffort || 'disable',
        enableReasoningEffort: Boolean(draft.enableReasoningEffort),
        modelMaxTokens: normalizePositiveInteger(draft.modelMaxTokens),
        modelMaxThinkingTokens: normalizePositiveInteger(draft.modelMaxThinkingTokens),
        openAiLegacyReasoningFormatEnabled: draft.openAiLegacyReasoningFormatEnabled === true,
      }))
      const passed = result?.success === true
      setWebSearchValidationPassed(passed)
      setWebSearchValidationMessage(passed ? t('支持') : t('不支持'))
    } catch {
      setWebSearchValidationPassed(false)
      setWebSearchValidationMessage(t('不支持'))
    } finally {
      setValidatingWebSearch(false)
    }
  }

  const handleSave = () => {
    let reasoningEffort = draft.reasoningEffort || 'disable'
    let enableReasoningEffort = Boolean(draft.enableReasoningEffort)
    let modelMaxTokens = normalizePositiveInteger(draft.modelMaxTokens)
    let modelMaxThinkingTokens = normalizePositiveInteger(draft.modelMaxThinkingTokens)

    switch (modelCapability.reasoningMode) {
      case 'binary':
        reasoningEffort = 'disable'
        modelMaxTokens = 0
        modelMaxThinkingTokens = 0
        break
      case 'effort': {
        const nextSelection = currentEffortReasoningSelection
        reasoningEffort = nextSelection
        enableReasoningEffort = nextSelection !== 'disable'
        modelMaxTokens = 0
        modelMaxThinkingTokens = 0
        break
      }
      case 'budget':
        reasoningEffort = 'disable'
        enableReasoningEffort = modelCapability.requiredReasoningBudget ? true : Boolean(draft.enableReasoningEffort)
        if (!enableReasoningEffort && !modelCapability.requiredReasoningBudget) {
          modelMaxTokens = 0
          modelMaxThinkingTokens = 0
        } else {
          modelMaxTokens = resolvedMaxTokens
          modelMaxThinkingTokens = resolvedThinkingTokens
        }
        break
      default:
        reasoningEffort = 'disable'
        enableReasoningEffort = false
        modelMaxTokens = 0
        modelMaxThinkingTokens = 0
        break
    }

    const resolvedWebSearchProviderValue = dedicatedProviderOptions.some((item) => item.value === draft.dedicatedWebSearchProviderId)
      ? draft.dedicatedWebSearchProviderId
      : selfWebSearchProviderValue
    const useDedicatedWebSearchProvider = resolvedWebSearchProviderValue !== selfWebSearchProviderValue

    onSave?.({
      ...draft,
      provider: providerDefinition.value,
      cacheStrategy: selectedPromptCacheStrategy,
      openAiResponsesUsePromptCacheRetention: providerDefinition.value === 'Responses' && draft.openAiResponsesUsePromptCacheRetention === true,
      modelTemperature: normalizeOptionalNumber(draft.modelTemperature),
      modelTopP: normalizeOptionalNumber(draft.modelTopP),
      webSearchEnabled: draft.webSearchEnabled,
      dedicatedWebSearchEnabled: useDedicatedWebSearchProvider,
      dedicatedWebSearchProviderId: useDedicatedWebSearchProvider ? resolvedWebSearchProviderValue : '',
      dedicatedProxyEnabled: draft.dedicatedProxyEnabled,
      dedicatedProxyId: draft.dedicatedProxyEnabled ? draft.dedicatedProxyId : '',
      reasoningEffort,
      enableReasoningEffort,
      openAiLegacyReasoningFormatEnabled: draft.openAiLegacyReasoningFormatEnabled === true,
      modelMaxTokens,
      modelMaxThinkingTokens,
    })
  }

  const renderBudgetSection = () => {
    const budgetEnabled = modelCapability.requiredReasoningBudget || draft.enableReasoningEffort
    return (
      <div className="grid gap-2">
        {!modelCapability.requiredReasoningBudget ? (
          <div className="flex items-center justify-between gap-2.5 py-2.5 px-3 border border-line rounded-xl bg-overlay">
            <span className="text-sm text-primary font-semibold">{t('启用推理')}</span>
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, enableReasoningEffort: !prev.enableReasoningEffort }))}
              className={`w-[34px] h-5 rounded-full border border-line p-0.5 relative transition-colors duration-[120ms] ${draft.enableReasoningEffort ? 'bg-[rgba(var(--accent-rgb),0.52)]' : 'bg-hover'}`}>
              <span
                className="block w-3.5 h-3.5 rounded-full bg-raised"
                style={{ transform: draft.enableReasoningEffort ? 'translateX(14px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        ) : null}

        {budgetEnabled ? (
          <div className="grid gap-2.5 px-3 pt-3 pb-3.5 border border-line rounded-xl bg-overlay">
            <div className="grid gap-1">
              <div className="text-sm font-semibold text-primary">{t('最大输出 Token')}</div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-2.5">
                <input
                  id="ai-qedit-max-tokens"
                  name="ai-qedit-max-tokens"
                  autoComplete="off"
                  type="range"
                  min={8192}
                  max={Math.max(resolvedMaxTokens, modelCapability.maxTokens || DEFAULT_MAX_OUTPUT_TOKENS)}
                  step={1024}
                  value={resolvedMaxTokens}
                  onChange={(event) => setDraft((prev) => ({ ...prev, modelMaxTokens: Number(event.target.value) }))}
                />
                <div className="min-w-[56px] text-right text-sm text-secondary">
                  {resolvedMaxTokens}
                </div>
              </div>
            </div>

            <div className="grid gap-1">
              <div className="text-sm font-semibold text-primary">{t('思考 Token 预算')}</div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-2.5">
                <input
                  id="ai-qedit-thinking-tokens"
                  name="ai-qedit-thinking-tokens"
                  autoComplete="off"
                  type="range"
                  min={1024}
                  max={maxThinkingTokenLimit}
                  step={1024}
                  value={resolvedThinkingTokens}
                  onChange={(event) => setDraft((prev) => ({ ...prev, modelMaxThinkingTokens: Number(event.target.value) }))}
                />
                <div className="min-w-[56px] text-right text-sm text-secondary">
                  {resolvedThinkingTokens}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const renderReasoningSection = () => {
    switch (modelCapability.reasoningMode) {
      case 'binary':
        return (
          <div className="flex items-center justify-between gap-2.5 py-2.5 px-3 border border-line rounded-xl bg-overlay">
            <span className="text-sm text-primary font-semibold">{t('启用推理')}</span>
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, enableReasoningEffort: !prev.enableReasoningEffort }))}
              className={`w-[34px] h-5 rounded-full border border-line p-0.5 relative transition-colors duration-[120ms] ${draft.enableReasoningEffort ? 'bg-[rgba(var(--accent-rgb),0.52)]' : 'bg-hover'}`}>
              <span
                className="block w-3.5 h-3.5 rounded-full bg-raised"
                style={{ transform: draft.enableReasoningEffort ? 'translateX(14px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        )
      case 'budget':
        return renderBudgetSection()
      case 'effort':
        return (
          <div className="grid gap-2.5">
            <div className="grid gap-[3px]">
              <div className="text-sm font-semibold text-primary">{t('思考深度')}</div>
              <div className="flex items-center gap-[18px] flex-wrap">
                {effortReasoningOptions.map((option) => {
                  const active = currentEffortReasoningSelection === option
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        if (option === 'disable') {
                          setDraft((prev) => ({
                            ...prev,
                            reasoningEffort: 'disable',
                            enableReasoningEffort: false,
                          }))
                          return
                        }
                        setDraft((prev) => ({
                          ...prev,
                          reasoningEffort: option,
                          enableReasoningEffort: true,
                        }))
                      }}
                      className={`inline-flex items-center gap-2 border-none bg-transparent p-0 text-sm ${active ? 'text-primary font-bold' : 'text-secondary font-medium'}`}>
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded-full box-border border ${active ? 'border-[rgba(var(--accent-rgb),0.65)] bg-[rgba(var(--accent-rgb),0.18)]' : 'border-line bg-transparent'}`}>
                        {active ? <span className="block w-2 h-2 rounded-full bg-accent" /> : null}
                      </span>
                      <span>{getReasoningOptionLabel(option)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {draft.provider === 'Messages' ? (
              <div className="flex items-center justify-between gap-2.5 py-2.5 px-3 border border-line rounded-xl bg-overlay">
                <div className="min-w-0 grid gap-0.5">
                  <div className="text-sm text-primary font-semibold">{t('旧推理格式')}</div>
                  <div className="text-xs text-tertiary leading-[1.4]">{t('为 Messages 使用旧式 thinking budget 负载，而不是 adaptive effort。')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, openAiLegacyReasoningFormatEnabled: !prev.openAiLegacyReasoningFormatEnabled }))}
                  className={`w-[34px] h-5 shrink-0 rounded-full border border-line p-0.5 relative transition-colors duration-[120ms] ${draft.openAiLegacyReasoningFormatEnabled ? 'bg-[rgba(var(--accent-rgb),0.52)]' : 'bg-hover'}`}>
                  <span
                    className="block w-3.5 h-3.5 rounded-full bg-raised"
                    style={{ transform: draft.openAiLegacyReasoningFormatEnabled ? 'translateX(14px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            ) : null}
          </div>
        )
      default:
        return null
    }
  }

  const validationButtonVariant = webSearchValidationMessage
    ? (webSearchValidationPassed ? 'success' : 'error')
    : 'default'

  return (
    <div
      onClick={onClose}
      style={{
        top: panelBounds?.top ?? 0,
        left: panelBounds?.left ?? 0,
        width: panelBounds?.width ?? '100vw',
        height: panelBounds?.height ?? '100vh',
        zIndex: Z.DIALOG,
      }}
      className="fixed max-w-screen max-h-screen overflow-hidden flex justify-center items-stretch bg-[rgba(5,10,18,0.62)] backdrop-blur-[4px]">
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full h-full bg-canvas flex flex-col text-primary overflow-hidden">
        <div className="h-[46px] flex items-center justify-between gap-2 px-2.5 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="w-[30px] h-[30px] inline-flex items-center justify-center rounded-full border-none bg-transparent text-secondary transition-colors duration-[120ms]">
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 grid gap-0">
              <div className="text-[16px] font-bold text-primary leading-[1.2] whitespace-nowrap overflow-hidden text-ellipsis">{title}</div>
              <div className="text-sm text-tertiary leading-[1.2]">{subtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mode === 'edit' ? (
              <button
                type="button"
                onClick={() => { if (provider) onDelete?.(provider) }}
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-transparent bg-transparent text-danger transition-colors duration-[120ms]">
                <Trash2 size={15} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              className="h-[34px] inline-flex items-center justify-center gap-2 px-3 rounded-lg border border-accent-border bg-[rgba(var(--accent-rgb),0.14)] text-accent text-sm font-bold transition-colors duration-[120ms]">
              <Save size={14} />
              {t('保存')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-line">
          {(['basic', 'advanced'] as const).map((tab) => {
            const active = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-[34px] border-solid border-x-0 border-t-0 border-b-2 text-sm transition-colors duration-[120ms] ${active ? 'border-b-accent bg-[rgba(var(--accent-rgb),0.10)] text-primary font-bold' : 'border-b-transparent bg-transparent text-secondary font-medium'}`}>
                {tab === 'basic' ? t('基本') : t('高级选项')}
              </button>
            )
          })}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-1.5 flex flex-col gap-1">
          <div className={`${activeTab === 'basic' ? 'grid' : 'hidden'} gap-1`}>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="grid gap-0.5">
              <label htmlFor="ai-provider-config-name" className="text-sm font-semibold text-primary">{t('配置文件')}</label>
              <input
                id="ai-provider-config-name"
                name="ai-provider-config-name"
                autoComplete="off"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                onMouseLeave={handleInputDragSelectAll}
                placeholder={t('输入配置名')}
                className="h-[34px] w-full rounded-lg border border-line bg-sunken text-primary px-2.5 box-border outline-none"
              />
            </div>

            <div className="grid gap-0.5">
              <label id="ai-provider-select-label" htmlFor="ai-provider-select" className="text-sm font-semibold text-primary">{t('API提供商')}</label>
              <SelectMenu
                id="ai-provider-select"
                aria-labelledby="ai-provider-select-label"
                value={draft.provider}
                options={providerOptions}
                open={providerMenuOpen}
                onToggle={() => setProviderMenuOpen((prev) => !prev)}
                onSelect={handleProviderSelect}
                menuRef={providerFieldRef}
                showSelectedIcon={false}
              />
            </div>
          </div>

          {supportsPromptCacheSettings ? (
            <div className="grid gap-[3px]">
              <div className="flex items-center justify-between gap-2.5">
                <div className="text-sm font-semibold text-primary leading-[1.2]">{t('缓存策略')}</div>
                {providerDefinition.value === 'Responses' ? (
                  <StyledCheckbox
                    checked={usePromptCacheRetention}
                    onChange={(nextUseRetention) => {
                      const nextFormat = nextUseRetention ? 'prompt_cache_retention' : 'prompt_cache_options'
                      const supportedDurations = activeModelPromptCachePolicy?.availableFormats
                        .find((option) => option.format === nextFormat)
                        ?.durations || []
                      const supportedOptions = ['off', 'model', ...supportedDurations]
                      setDraft((prev) => ({
                        ...prev,
                        openAiResponsesUsePromptCacheRetention: nextUseRetention,
                        cacheStrategy: !responsePromptCacheOptionsReady || supportedOptions.includes(prev.cacheStrategy)
                          ? prev.cacheStrategy
                          : 'model',
                      }))
                    }}>
                    {usePromptCacheRetention ? `${t('当前格式')}:prompt_cache_retention` : `${t('当前格式')}:prompt_cache_options`}
                  </StyledCheckbox>
                ) : null}
              </div>
              <div
                style={{ gridTemplateColumns: `repeat(${Math.max(promptCacheOptions.length, 1)}, minmax(0, 1fr))` }}
                className="grid border border-line rounded-lg overflow-hidden">
                {promptCacheOptions.map((option: { value: string; labelKey: string }, index: number) => {
                  const active = selectedPromptCacheStrategy === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, cacheStrategy: option.value }))}
                      className={`h-[34px] border-solid text-sm transition-colors duration-[120ms] ${index < promptCacheOptions.length - 1 ? 'border-y-0 border-l-0 border-r border-line-subtle' : 'border-0'} ${active ? 'bg-[rgba(var(--accent-rgb),0.14)] text-primary font-bold' : 'bg-transparent text-secondary font-medium'}`}>
                      {t(option.labelKey as I18nKey)}
                    </button>
                  )
                })}
              </div>
              {promptCacheOfficialSupport ? (
                <div className="text-tertiary text-xs leading-[1.4] [overflow-wrap:anywhere]">
                  {promptCacheOfficialSupport}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-0.5">
            <label htmlFor="ai-provider-base-url" className="text-sm font-semibold text-primary leading-[1.2]">{t('基础 URL')}</label>
            <input
              id="ai-provider-base-url"
              name="ai-provider-base-url"
              autoComplete="off"
              value={draft.baseUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
              onMouseLeave={handleInputDragSelectAll}
              placeholder="https://api.example.com/v1"
              className="h-[34px] w-full rounded-none border border-line bg-sunken text-primary px-2.5 box-border outline-none"
            />
          </div>

          <div className="grid gap-0.5">
            <div className="flex items-center gap-1.5">
              <label htmlFor="ai-provider-api-key" className="text-sm font-semibold text-primary leading-[1.2]">{t('API 密钥')}</label>
            </div>
            <input
              id="ai-provider-api-key"
              name="ai-provider-api-key"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(event) => setDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
              onMouseLeave={handleInputDragSelectAll}
              placeholder={t('输入 API Key')}
              className="h-[34px] w-full rounded-none border border-line bg-sunken text-primary px-2.5 box-border outline-none"
            />
          </div>

          {supportsWebSearch ? (
            <div className="grid py-2.5 px-3 border border-line rounded-xl bg-overlay">
              <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                <div className="flex items-center justify-between gap-2.5 min-h-8">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-[rgba(var(--accent-rgb),0.12)] text-accent shrink-0">
                      <Globe size={14} />
                    </div>
                    <div className="min-w-0 grid gap-px">
                      <div className="text-base font-semibold text-primary">{t('联网搜索')}</div>
                      <div className="text-xs text-tertiary leading-[1.2]">{t('启用后通过所选供应商执行联网搜索')}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <CircleHelp size={14} color="var(--text-tertiary)" />
                    <button
                      type="button"
                      onClick={handleWebSearchToggle}
                      className={`w-[34px] h-5 rounded-full border border-line p-0.5 relative transition-colors duration-[120ms] ${draft.webSearchEnabled ? 'bg-[rgba(var(--accent-rgb),0.52)]' : 'bg-hover'}`}>
                      <span
                        className="block w-3.5 h-3.5 rounded-full bg-raised"
                        style={{ transform: draft.webSearchEnabled ? 'translateX(14px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleValidateWebSearch}
                  disabled={!canValidateWebSearch || validatingWebSearch}
                  style={{ opacity: canValidateWebSearch ? 1 : 0.6 }}
                  className={`min-w-[74px] min-h-10 px-2.5 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-1.5 ${validationButtonVariant === 'success'
                    ? 'border-[rgba(var(--success-rgb),0.35)] bg-[rgba(var(--success-rgb),0.10)] text-success'
                    : validationButtonVariant === 'error'
                      ? 'border-[rgba(var(--danger-rgb),0.30)] bg-[rgba(var(--danger-rgb),0.08)] text-danger'
                      : !canValidateWebSearch
                        ? 'border-line bg-canvas text-tertiary'
                        : 'border-line bg-canvas text-primary'}`}>
                  {validatingWebSearch ? t('验证中...') : (
                    <>
                      {webSearchValidationPassed ? <Check size={13} /> : null}
                      <span className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {webSearchValidationMessage || t('验证')}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid gap-1.5 pt-2 border-t border-line-subtle">
                <div ref={dedicatedProviderFieldRef} className="relative min-w-0">
                  <button
                    type="button"
                    disabled={!draft.webSearchEnabled}
                    onClick={() => {
                      if (!draft.webSearchEnabled) {
                        return
                      }
                      setDedicatedProviderMenuOpen((prev) => !prev)
                    }}
                    style={{ opacity: draft.webSearchEnabled ? 1 : 0.6 }}
                    className={`h-[30px] w-full flex items-center justify-between gap-2 px-2.5 rounded-full box-border border text-sm text-secondary transition-[color,background-color,border-color] duration-[120ms] ${dedicatedProviderMenuOpen ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)]' : 'border-line bg-canvas'} ${draft.webSearchEnabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                    <span className="min-w-0 truncate">
                      {currentDedicatedProviderOption?.label || t('自身')}
                    </span>
                    <span className={`text-tertiary text-[10px] ${dedicatedProviderMenuOpen ? 'rotate-180' : 'rotate-0'}`}>▾</span>
                  </button>
                  {dedicatedProviderMenuOpen && draft.webSearchEnabled ? (
                    <div
                      style={{ zIndex: Z.POPUP }}
                      className="absolute right-0 top-[calc(100%_+_8px)] w-[320px] max-w-[min(100%,320px)] max-h-[320px] rounded-none border border-accent-border bg-overlay shadow-xl overflow-hidden">
                      <div className="relative border-b border-line-subtle">
                        <Search size={14} className="absolute left-2.5 top-[9px] text-tertiary" />
                        <input
                          name="ai-provider-global-search"
                          autoComplete="off"
                          aria-label={t('搜索全局配置')}
                          value={dedicatedProviderSearch}
                          onChange={(event) => setDedicatedProviderSearch(event.target.value)}
                          onMouseLeave={handleInputDragSelectAll}
                          placeholder={t('搜索全局配置')}
                          className="w-full h-[34px] border-none outline-none bg-canvas text-primary pt-0 pb-0 pl-8 pr-2.5 box-border text-base"
                        />
                      </div>
                      <div className="max-h-[285px] overflow-y-auto">
                        {filteredDedicatedProviderOptions.length > 0 ? (
                          filteredDedicatedProviderOptions.map((option) => {
                            const active = option.value === selectedWebSearchProviderValue
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleWebSearchProviderSelect(option.value)}
                                className={`w-full min-h-[34px] flex items-center justify-between gap-3 px-2.5 border-solid border-x-0 border-t-0 border-b border-line-subtle text-sm text-left cursor-pointer ${active ? 'bg-[rgba(var(--accent-rgb),0.16)] text-primary' : 'bg-transparent text-secondary'}`}>
                                <span className="min-w-0 truncate">{option.label}</span>
                                {active ? <Check size={12} color="var(--text-primary)" /> : null}
                              </button>
                            )
                          })
                        ) : (
                          <div className="py-3.5 px-2.5 text-center text-sm text-tertiary">
                            {t('没有匹配的供应商')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <div
              style={{ gridTemplateColumns: draft.dedicatedProxyEnabled ? '1fr auto auto' : '1fr auto' }}
              className="grid items-center gap-2.5 py-2.5 px-3 border border-line rounded-xl bg-overlay">
              <span className="text-sm text-primary">{t('专属代理服务器')}</span>

              {draft.dedicatedProxyEnabled ? (
                <div ref={dedicatedProxyFieldRef} className="relative min-w-0 max-w-[320px]">
                  <button
                    type="button"
                    onClick={() => setProxyMenuOpen((prev) => !prev)}
                    className={`h-[30px] min-w-[220px] max-w-[320px] flex items-center justify-between gap-2 px-2.5 rounded-full box-border border text-sm text-secondary cursor-pointer transition-colors duration-[120ms] ${proxyMenuOpen ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)]' : 'border-line bg-canvas'}`}>
                    <span className="min-w-0 truncate">
                      {currentDedicatedProxyOption?.label || t('不使用')}
                    </span>
                    <span className={`text-tertiary text-[10px] ${proxyMenuOpen ? 'rotate-180' : 'rotate-0'}`}>▾</span>
                  </button>
                  {proxyMenuOpen ? (
                    <div
                      style={{ zIndex: Z.POPUP }}
                      className="absolute right-0 top-[calc(100%_+_8px)] w-[320px] max-w-[320px] max-h-[320px] rounded-none border border-accent-border bg-overlay shadow-xl overflow-hidden">
                      <div className="max-h-[285px] overflow-y-auto">
                        {dedicatedProxyOptions.map((option) => {
                          const active = option.value === draft.dedicatedProxyId
                          return (
                            <button
                              key={option.value || '__none__'}
                              type="button"
                              onClick={() => {
                                setDraft((prev) => ({
                                  ...prev,
                                  dedicatedProxyId: option.value,
                                  dedicatedProxyEnabled: true,
                                }))
                                setProxyMenuOpen(false)
                              }}
                              className={`w-full min-h-[34px] flex items-center justify-between gap-3 px-2.5 border-solid border-x-0 border-t-0 border-b border-line-subtle text-sm text-left cursor-pointer ${active ? 'bg-[rgba(var(--accent-rgb),0.16)] text-primary' : 'bg-transparent text-secondary'}`}>
                              <span className="min-w-0 truncate">{option.label}</span>
                              {active ? <Check size={12} color="var(--text-primary)" /> : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, dedicatedProxyEnabled: !prev.dedicatedProxyEnabled }))}
                className={`w-[34px] h-5 rounded-full border border-line p-0.5 relative transition-colors duration-[120ms] ${draft.dedicatedProxyEnabled ? 'bg-[rgba(var(--accent-rgb),0.52)]' : 'bg-hover'}`}>
                <span
                  className="block w-3.5 h-3.5 rounded-full bg-raised"
                  style={{ transform: draft.dedicatedProxyEnabled ? 'translateX(14px)' : 'translateX(0)' }}
                />
              </button>
            </div>
            <div className="text-xs text-tertiary leading-normal">
              {t('开启后为当前供应商单独指定代理；关闭后跟随全局 AI 请求代理。')}
            </div>
          </div>

          {renderReasoningSection()}

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2.5">
              <label htmlFor="ai-provider-model-query" className="text-sm font-semibold text-primary">{t('模型')}</label>
              <button
                type="button"
                onClick={handleRefreshModels}
                disabled={modelRefreshing}
                style={{ opacity: modelRefreshing ? 0.7 : 1 }}
                className={`border-none bg-transparent text-sm p-0 ${modelRefreshing ? 'text-muted' : 'text-tertiary'}`}>
                {modelRefreshing ? t('刷新中...') : t('刷新模型')}
              </button>
            </div>

            {modelRefreshError ? (
              <div
                role="alert"
                className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2 py-[7px] px-[9px] border border-[rgba(var(--danger-rgb),0.28)] rounded-lg bg-danger-dim text-danger">
                <span
                  aria-hidden="true"
                  className="w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-[rgba(var(--danger-rgb),0.16)] text-sm font-extrabold leading-none">
                  !
                </span>
                <div className="min-w-0 grid gap-0.5">
                  <div className="text-xs font-bold leading-[1.3]">{t('刷新模型失败')}</div>
                  <div className="text-secondary font-mono text-[10px] leading-[1.45] [overflow-wrap:anywhere] select-text">
                    {modelRefreshError}
                  </div>
                </div>
              </div>
            ) : null}

            <input
              id="ai-provider-model-query"
              name="ai-provider-model-query"
              autoComplete="off"
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              onMouseLeave={handleInputDragSelectAll}
              placeholder={t('筛选模型或输入以指定模型')}
              className="h-[34px] w-full rounded-none border border-line bg-sunken text-primary px-2.5 box-border outline-none"
            />

            <div className="min-h-[200px] border border-line bg-canvas flex flex-col">
              {filteredModels.length > 0 || modelQuery.trim() ? (
                <>
                  {filteredModels.map((item) => {
                    const active = draft.model === item
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          const capability = buildDisplayModelCapability(draft.provider, providerDefinition.getModelCapability(item))
                          setDraft((prev) => ({
                            ...prev,
                            model: item,
                            reasoningEffort: prev.reasoningEffort || (typeof capability.reasoningEffort === 'string' ? capability.reasoningEffort : '') || 'disable',
                            modelMaxTokens: prev.modelMaxTokens || capability.maxTokens || DEFAULT_MAX_OUTPUT_TOKENS,
                            modelMaxThinkingTokens: prev.modelMaxThinkingTokens || capability.maxThinkingTokens || DEFAULT_MAX_THINKING_TOKENS,
                          }))
                          setModelQuery('')
                        }}
                        className={`min-h-8 flex items-center justify-between gap-3 px-2.5 border-solid border-x-0 border-t-0 border-b border-line-subtle text-left ${active ? 'bg-[rgba(var(--accent-rgb),0.10)] text-primary' : 'bg-transparent text-secondary'}`}>
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item}</span>
                        {active ? <span className="text-accent text-sm">✓</span> : null}
                      </button>
                    )
                  })}
                  {modelQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        const customModel = modelQuery.trim()
                        const capability = buildDisplayModelCapability(draft.provider, providerDefinition.getModelCapability(customModel))
                        setDraft((prev) => ({
                          ...prev,
                          model: customModel,
                          reasoningEffort: prev.reasoningEffort || (typeof capability.reasoningEffort === 'string' ? capability.reasoningEffort : '') || 'disable',
                          modelMaxTokens: prev.modelMaxTokens || capability.maxTokens || DEFAULT_MAX_OUTPUT_TOKENS,
                          modelMaxThinkingTokens: prev.modelMaxThinkingTokens || capability.maxThinkingTokens || DEFAULT_MAX_THINKING_TOKENS,
                        }))
                        setModelOptions((prev) => (
                          prev.includes(customModel)
                            ? prev
                            : [customModel, ...prev]
                        ))
                        setModelQuery('')
                      }}
                      className="min-h-8 flex items-center justify-between gap-3 px-2.5 border-none bg-transparent text-primary text-left cursor-pointer">
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                        {t('使用自定义模型').replace('{value}', modelQuery.trim())}
                      </span>
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-tertiary text-md">
                  {t('暂无可用模型')}
                </div>
              )}
            </div>
          </div>
          </div>
          <div className={`${activeTab === 'advanced' ? 'grid' : 'hidden'} gap-1.5 py-0.5`}>
            <div className="grid gap-1 py-2 px-2.5 border border-line rounded-lg bg-overlay">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="ai-provider-temperature" className="text-sm font-semibold text-primary">Temperature</label>
                <StyledCheckbox
                  checked={draft.modelTemperature !== null}
                  onChange={(checked) => setDraft((prev) => ({
                    ...prev,
                    modelTemperature: checked ? (prev.modelTemperature ?? 0) : null,
                  }))}>
                  {t('启用自定义温度')}
                </StyledCheckbox>
              </div>
              {draft.modelTemperature !== null ? (
                <input
                  id="ai-provider-temperature"
                  name="ai-provider-temperature"
                  autoComplete="off"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={draft.modelTemperature}
                  onChange={(event) => setDraft((prev) => ({
                    ...prev,
                    modelTemperature: normalizeOptionalNumber(event.target.value),
                  }))}
                  className="h-[34px] w-full rounded-lg border border-line bg-sunken text-primary px-2.5 box-border outline-none"
                />
              ) : (
                <div className="text-xs leading-[1.25] text-tertiary">{t('关闭后不发送该参数')}</div>
              )}
            </div>
            <div className="grid gap-1 py-2 px-2.5 border border-line rounded-lg bg-overlay">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="ai-provider-top-p" className="text-sm font-semibold text-primary">{t('Top P')}</label>
                <StyledCheckbox
                  checked={draft.modelTopP !== null}
                  onChange={(checked) => setDraft((prev) => ({
                    ...prev,
                    modelTopP: checked ? (prev.modelTopP ?? 1) : null,
                  }))}>
                  {t('启用自定义 Top P')}
                </StyledCheckbox>
              </div>
              {draft.modelTopP !== null ? (
                <input
                  id="ai-provider-top-p"
                  name="ai-provider-top-p"
                  autoComplete="off"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={draft.modelTopP}
                  onChange={(event) => setDraft((prev) => ({
                    ...prev,
                    modelTopP: normalizeOptionalNumber(event.target.value),
                  }))}
                  className="h-[34px] w-full rounded-lg border border-line bg-sunken text-primary px-2.5 box-border outline-none"
                />
              ) : (
                <div className="text-xs leading-[1.25] text-tertiary">{t('关闭后不发送该参数')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
