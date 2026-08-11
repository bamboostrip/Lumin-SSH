// @ts-nocheck
// TODO(tsx): 桥接模块自 .js 收编（阶段 6 关 allowJs），保持原运行语义，类型化留待后续
export const CALLMY_VIP_PROVIDER_HOSTS = [
  'newapi.callmy.vip',
  'newapi2.callmy.vip',
]

export function isCallMyVipProviderHost(value) {
  const rawBaseURL = typeof value === 'string' ? value.trim() : ''
  if (!rawBaseURL) {
    return false
  }
  const candidates = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawBaseURL) ? [rawBaseURL] : [rawBaseURL, `https://${rawBaseURL}`]
  return candidates.some((candidate) => {
    try {
      return CALLMY_VIP_PROVIDER_HOSTS.includes(new URL(candidate).hostname.toLowerCase())
    } catch {
      return false
    }
  })
}