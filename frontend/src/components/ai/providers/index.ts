// @ts-nocheck
// TODO(tsx): 桥接模块自 .js 收编（阶段 6 关 allowJs），保持原运行语义，类型化留待后续
import { compatibleProvider } from './compatibleProvider.ts'
import { messagesProvider } from './messagesProvider.ts'
import { responsesProvider } from './responsesProvider.ts'

export const availableAIProviders = [
  compatibleProvider,
  responsesProvider,
  messagesProvider,
]

export const availableAIProviderOptions = availableAIProviders.map((provider) => ({
  value: provider.value,
  label: provider.label,
}))

const providerMap = new Map(availableAIProviders.map((provider) => [provider.value, provider]))

export function getAIProviderDefinition(value) {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  return providerMap.get(nextValue) || compatibleProvider
}

export function canUseDedicatedWebSearchCandidate(value) {
  return getAIProviderDefinition(value).supportsDedicatedWebSearchCandidate === true
}