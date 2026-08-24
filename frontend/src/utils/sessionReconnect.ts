// 会话重连时的终端/AI 工作区快照归一化纯函数。
// 从 hooks/useSessionConnections.ts 原样搬移。

export interface RestoredSnapshotSession {
  id?: unknown;
  serverId?: unknown;
  serverName?: unknown;
  host?: unknown;
  activeTerminalId?: unknown;
  activeTerminalLabel?: unknown;
  terminals?: Array<{ id?: unknown; label?: unknown }>;
  workspaceTabs?: Array<{ terminalIds?: unknown }>;
  aiTabWorkspaces?: Record<string, unknown>;
}

export function normalizeAIWorkspaceReconnectTerminals(
  terminals: unknown,
  preferredRootTerminalId: unknown,
  fallbackTerminalId: string,
  fallbackLabel: string,
  aiTabWorkspaces: Record<string, unknown> | null | undefined = null,
): Array<{ id: string; label: string }> {
  const seenIds = new Set<string>()
  const normalizedTerminals = (Array.isArray(terminals) ? terminals : []).flatMap((terminal, index) => {
    const item = terminal && typeof terminal === 'object' ? terminal as Record<string, unknown> : {}
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!id || seenIds.has(id)) {
      return []
    }
    seenIds.add(id)
    return [{
      id,
      label: typeof item.label === 'string' && item.label.trim()
        ? item.label.trim()
        : `${fallbackLabel}${index + 1}`,
    }]
  })
  Object.keys(aiTabWorkspaces || {}).forEach((terminalId) => {
    const id = terminalId.trim()
    if (!id || seenIds.has(id)) {
      return
    }
    seenIds.add(id)
    normalizedTerminals.push({
      id,
      label: `${fallbackLabel}${normalizedTerminals.length + 1}`,
    })
  })
  const normalizedPreferredRootTerminalId = typeof preferredRootTerminalId === 'string'
    ? preferredRootTerminalId.trim()
    : ''
  const rootTerminal = normalizedTerminals.find((terminal) => terminal.id === normalizedPreferredRootTerminalId)
    || normalizedTerminals[0]
    || {
      id: fallbackTerminalId,
      label: fallbackLabel,
    }
  return [
    rootTerminal,
    ...normalizedTerminals.filter((terminal) => terminal.id !== rootTerminal.id),
  ]
}

export function remapAIWorkspaceTabSnapshotGroups(
  workspaces: Record<string, unknown> | null | undefined,
  idMap: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(workspaces || {}).flatMap(([terminalId, group]) => {
      const mappedTerminalId = idMap[terminalId]
      return mappedTerminalId ? [[mappedTerminalId, group]] : []
    }),
  )
}
