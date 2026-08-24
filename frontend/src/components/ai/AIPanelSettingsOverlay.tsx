import { ArrowRightLeft, FolderOpen, Loader2, RotateCcw, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n.ts'
import MCPAccessView from './MCPAccessView.tsx'
import MCPServersView from './MCPServersView.tsx'
import AISlashCommandsSettings from './AISlashCommandsSettings.tsx'
import AIConversationBackupSettings from './AIConversationBackupSettings.tsx'
import Tiptop from '../Tiptop.tsx'
import { Button } from '../ui'
import { handleInputDragSelectAll } from './inputDragSelect.ts'

function formatTokenCountInMillions(value: number) {
  return `${(value / 1000000).toFixed(6)}M`
}

interface PreviewPillProps {
  label: string
  primary?: boolean
}

function PreviewPill({ label, primary = false }: PreviewPillProps) {
  return (
    <div
      className={`min-h-[34px] w-full px-3 rounded-lg border text-base font-semibold inline-flex items-center justify-center box-border ${
        primary
          ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.14)] text-accent'
          : 'border-line bg-transparent text-secondary'
      }`}
    >
      {label}
    </div>
  )
}

interface PositionItem {
  key: string
  label: string
  primary?: boolean
}

interface PositionSelectorCardProps {
  title: string
  description: string
  items: PositionItem[]
  onToggle: () => void
  toggleLabel: string
}

function PositionSelectorCard({ title, description, items, onToggle, toggleLabel }: PositionSelectorCardProps) {
  return (
    <div className="p-3.5 rounded-xl bg-canvas border border-line grid gap-3">
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-base font-bold text-primary">{title}</div>
          <Tiptop text={toggleLabel}>
            <button
              type="button"
              onClick={onToggle}
              aria-label={toggleLabel}
              className="w-[34px] h-[34px] rounded-lg border border-line bg-transparent text-secondary inline-flex items-center justify-center transition-colors duration-100 shrink-0 cursor-pointer"
            >
              <ArrowRightLeft size={14} />
            </button>
          </Tiptop>
        </div>
        <div className="text-sm text-tertiary leading-[1.6]">{description}</div>
      </div>
      <div
        className="min-h-[58px] p-3 rounded-xl bg-overlay border border-line grid gap-2.5 items-center"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <PreviewPill key={item.key} label={item.label} primary={item.primary} />
        ))}
      </div>
    </div>
  )
}

interface ToggleSwitchControlProps {
  checked: boolean
  onChange: () => void
}

function ToggleSwitchControl({ checked, onChange }: ToggleSwitchControlProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={`w-[42px] h-6 rounded-full border border-line p-0.5 flex items-center transition-colors duration-100 shrink-0 ${checked ? 'justify-end bg-success' : 'justify-start bg-hover'}`}
    >
      <span className="w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
    </button>
  )
}

/** 全局 AI 设置（宽松结构） */
interface GlobalAISettingsLike {
  approvalButtonOrder?: string
  commandActionButtonOrder?: string
  messageActionBarAtBottom?: boolean
  messageNavEnabled?: boolean
  mcpEnabled?: boolean
  mcpAllowBrowserCalls?: boolean
  mcpRequireApproval?: boolean
  mcpActivityVisible?: boolean
  continueAfterToolRejection?: boolean
  proxyNodes?: Array<{ id?: string; name?: string; type?: string; host?: string; port?: string | number }>
  aiRequestProxyId?: string
  toolResultTokenThreshold?: number
  slashCommands?: unknown
  [key: string]: unknown
}

export interface AIPanelSettingsOverlayProps {
  show: boolean
  onClose: () => void
  activeTab: string
  onChangeTab: (tab: string) => void
  mcpInfo: { transport?: string; url?: string; tools?: unknown[] }
  configText: string
  configRows: number
  globalAISettings: GlobalAISettingsLike
  onSaveGlobalAISettings?: (settings: Record<string, unknown>) => Promise<unknown> | void
  aiTerminalIsolation: boolean
  onToggleAiTerminalIsolation: () => void
  confirmDelete: boolean
  onToggleConfirmDelete: () => void
  activeConversationId: string
  conversationUpdatedAt: number
  backupRequestInFlight: boolean
  onRestoreConversationBackup: (snapshot: unknown) => Promise<unknown> | void
  autoBackupEnabled: boolean
  onToggleAutoBackup: () => void
  soundEnabled?: boolean
  soundVolume?: number
  terminalOutputLineLimit: number
  onTerminalOutputLineLimitChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  terminalOutputCharacterLimit: number
  onTerminalOutputCharacterLimitChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  mcpClientServers?: unknown[]
  mcpClientGlobalConfigPath?: string
  mcpClientGlobalConfigText?: string
  onSaveMCPGlobalServer?: (name: string, configText: string) => Promise<unknown>
  onReloadMCPGlobalServers?: () => Promise<unknown>
  onDeleteMCPGlobalServer?: (name: string) => Promise<unknown>
  onRestartMCPClientServer?: (name: string, source: string) => Promise<unknown>
  onToggleMCPClientServer?: (name: string, source: string, enabled: boolean) => Promise<unknown>
  onToggleMCPClientServerDisabledForPrompts?: (name: string, source: string, disabled: boolean) => Promise<unknown>
  onUpdateMCPClientServerTimeout?: (name: string, source: string, timeout: number) => Promise<unknown>
  onMigratingChange?: (migrating: boolean) => void
}

export default function AIPanelSettingsOverlay({
  show,
  onClose,
  activeTab,
  onChangeTab,
  mcpInfo,
  configText,
  configRows,
  globalAISettings,
  onSaveGlobalAISettings,
  aiTerminalIsolation,
  onToggleAiTerminalIsolation,
  confirmDelete,
  onToggleConfirmDelete,
  activeConversationId,
  conversationUpdatedAt,
  backupRequestInFlight,
  onRestoreConversationBackup,
  autoBackupEnabled,
  onToggleAutoBackup,
  soundEnabled,
  soundVolume,
  terminalOutputLineLimit,
  onTerminalOutputLineLimitChange,
  terminalOutputCharacterLimit,
  onTerminalOutputCharacterLimitChange,
  mcpClientServers = [],
  mcpClientGlobalConfigPath = '',
  mcpClientGlobalConfigText = '',
  onSaveMCPGlobalServer,
  onReloadMCPGlobalServers,
  onDeleteMCPGlobalServer,
  onRestartMCPClientServer,
  onToggleMCPClientServer,
  onToggleMCPClientServerDisabledForPrompts,
  onUpdateMCPClientServerTimeout,
  onMigratingChange,
}: AIPanelSettingsOverlayProps) {
  const { t } = useTranslation()
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const [overlayBounds, setOverlayBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  // AI 对话存储目录设置
  const [tasksDir, setTasksDir] = useState('')
  const [isCustomTasksDir, setIsCustomTasksDir] = useState(false)
  const [tasksDirMigrating, setTasksDirMigrating] = useState(false)

  const refreshTasksDir = useCallback(async () => {
    try {
      const [dir, isCustom] = await Promise.all([
        window?.go?.wailsapp?.App?.GetTasksDir?.(),
        window?.go?.wailsapp?.App?.IsCustomTasksDir?.(),
      ])
      if (typeof dir === 'string') setTasksDir(dir)
      if (typeof isCustom === 'boolean') setIsCustomTasksDir(isCustom)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void refreshTasksDir() }, [refreshTasksDir])

  useEffect(() => { onMigratingChange?.(tasksDirMigrating) }, [tasksDirMigrating, onMigratingChange])

  const handleChangeTasksDir = async () => {
    if (tasksDirMigrating) return
    try {
      const selected = await window?.go?.wailsapp?.App?.SelectTasksDirectory?.()
      if (!selected) return
      setTasksDirMigrating(true)
      await window?.go?.wailsapp?.App?.MigrateAITasksDir?.(selected)
      await refreshTasksDir()
      window.luminDialog?.alert?.(t('AI 对话数据已迁移到新目录。'), t('提示'), { priority: 'settings' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || '')
      if (msg.trim()) window.luminDialog?.alert?.(msg, t('错误'), { priority: 'settings' })
      await refreshTasksDir()
    } finally {
      setTasksDirMigrating(false)
    }
  }

  const handleResetTasksDir = async () => {
    if (tasksDirMigrating) return
    try {
      const ok = await window.luminDialog?.confirm?.(
        t('恢复为默认目录？数据将自动迁移到默认目录。')
      )
      if (!ok) return
      setTasksDirMigrating(true)
      await window?.go?.wailsapp?.App?.ResetTasksDir?.()
      await refreshTasksDir()
      window.luminDialog?.alert?.(t('AI 对话数据已迁移到默认目录。'), t('提示'), { priority: 'settings' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || '')
      if (msg.trim()) window.luminDialog?.alert?.(msg, t('错误'), { priority: 'settings' })
      await refreshTasksDir()
    } finally {
      setTasksDirMigrating(false)
    }
  }

  useLayoutEffect(() => {
    if (!show) {
      return undefined
    }

    if (activeTab) {
      return undefined
    }

    const firstTabKey = (tabListRef.current?.querySelector('[data-ai-settings-tab-key]') as HTMLElement | null | undefined)?.dataset?.aiSettingsTabKey || ''
    if (firstTabKey) {
      onChangeTab(firstTabKey)
    }
    return undefined
  }, [activeTab, onChangeTab, show])

  useEffect(() => {
    if (!show) {
      return undefined
    }

    const updateOverlayBounds = () => {
      const root = overlayRef.current?.closest('[data-ai-panel-root="true"]')
      const chatStage = root?.querySelector('[data-ai-chat-stage="true"]')
      const composer = root?.querySelector('[data-ai-composer-root="true"]')

      if (!root || (!chatStage && !composer)) {
        setOverlayBounds(null)
        return
      }

      const rootRect = root.getBoundingClientRect()
      const chatRect = chatStage?.getBoundingClientRect()
      const composerRect = composer?.getBoundingClientRect()

      const top = Math.min(chatRect?.top ?? rootRect.top, composerRect?.top ?? rootRect.top)
      const left = Math.min(chatRect?.left ?? rootRect.left, composerRect?.left ?? rootRect.left)
      const right = Math.max(chatRect?.right ?? rootRect.right, composerRect?.right ?? rootRect.right)
      const bottom = Math.max(chatRect?.bottom ?? rootRect.bottom, composerRect?.bottom ?? rootRect.bottom)

      setOverlayBounds({
        top: top - rootRect.top,
        left: left - rootRect.left,
        width: right - left,
        height: bottom - top,
      })
    }

    updateOverlayBounds()

    const rootEl = overlayRef.current?.closest('[data-ai-panel-root="true"]')
    const resizeObserver = rootEl ? new ResizeObserver(updateOverlayBounds) : null
    if (resizeObserver && rootEl) {
      resizeObserver.observe(rootEl)
    }

    window.addEventListener('resize', updateOverlayBounds)
    window.addEventListener('scroll', updateOverlayBounds, true)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateOverlayBounds)
      window.removeEventListener('scroll', updateOverlayBounds, true)
    }
  }, [show])

  if (!show) {
    return null
  }

  const approvalButtonOrder = globalAISettings?.approvalButtonOrder || 'reject-approve'
  const commandActionButtonOrder = globalAISettings?.commandActionButtonOrder || 'terminate-continue'
  const messageActionBarAtBottom = Boolean(globalAISettings?.messageActionBarAtBottom)
  const messageNavEnabled = globalAISettings?.messageNavEnabled !== false
  const mcpEnabled = globalAISettings?.mcpEnabled !== false
  const mcpAllowBrowserCalls = Boolean(globalAISettings?.mcpAllowBrowserCalls)
  const mcpRequireApproval = Boolean(globalAISettings?.mcpRequireApproval)
  const mcpActivityVisible = Boolean(globalAISettings?.mcpActivityVisible)
  const continueAfterToolRejection = globalAISettings?.continueAfterToolRejection !== false
  const proxyNodes = Array.isArray(globalAISettings?.proxyNodes) ? globalAISettings.proxyNodes : []
  const aiRequestProxyId = typeof globalAISettings?.aiRequestProxyId === 'string' ? globalAISettings.aiRequestProxyId : ''
  const toolResultTokenThreshold = Number.isFinite(Number(globalAISettings?.toolResultTokenThreshold))
    ? Math.max(1, Math.trunc(Number(globalAISettings.toolResultTokenThreshold)))
    : 350000
  const toolResultTokenThresholdDisplay = formatTokenCountInMillions(toolResultTokenThreshold)

  return (
    <div
      ref={overlayRef}
      className="absolute max-w-full max-h-full bg-[rgba(5,10,18,0.62)] backdrop-blur-[4px] flex items-stretch justify-center overflow-hidden z-[120]"
      style={{
        top: overlayBounds?.top ?? 0,
        left: overlayBounds?.left ?? 0,
        width: overlayBounds?.width ?? '100%',
        height: overlayBounds?.height ?? '100%',
      }}>
      <div className="w-full h-full bg-overlay border border-line rounded-none shadow-xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="h-[50px] px-4 flex items-center justify-between border-b border-line shrink-0">
          <div className="text-md font-bold text-primary">{t('设置')}</div>
          <Tiptop text={t('关闭设置面板')}>
            <button
              type="button"
              onClick={onClose}
              disabled={tasksDirMigrating}
              aria-label={t('关闭设置面板')}
              className={`w-[30px] h-[30px] inline-flex items-center justify-center rounded-lg text-secondary bg-transparent border border-transparent transition-colors duration-100 ${tasksDirMigrating ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <X size={16} />
            </button>
          </Tiptop>
        </div>
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div ref={tabListRef} className="w-fit border-r border-line bg-canvas p-0 gap-0 flex flex-col shrink-0">
            {(
              [
                ['ai', t('基本')],
                ['mcp', t('MCP集成')],
                ['mcp-servers', t('MCP服务器')],
                ['slash-commands', t('斜杠命令')],
                ['appearance', t('外观')],
              ] as Array<[string, string]>
            ).map(([tabKey, tabLabel]) => (
              <button
                key={tabKey}
                type="button"
                data-ai-settings-tab-key={tabKey}
                onClick={() => onChangeTab(tabKey)}
                className={`flex items-center justify-start min-h-[52px] px-2.5 text-left text-base whitespace-nowrap w-full border-0 border-l-2 rounded-none transition-colors duration-100 cursor-pointer ${
                  activeTab === tabKey
                    ? 'font-semibold text-primary bg-[rgba(var(--accent-rgb),0.10)] border-l-accent'
                    : 'font-medium text-secondary bg-transparent border-l-transparent'
                }`}
              >
                <span>{tabLabel}</span>
              </button>
            ))}
            {activeConversationId ? (
              <button
                type="button"
                onClick={() => onChangeTab('backup')}
                className={`flex items-center justify-start min-h-[52px] px-2.5 text-left text-base whitespace-nowrap w-full border-0 border-l-2 rounded-none transition-colors duration-100 cursor-pointer ${
                  activeTab === 'backup'
                    ? 'font-semibold text-primary bg-[rgba(var(--accent-rgb),0.10)] border-l-accent'
                    : 'font-medium text-secondary bg-transparent border-l-transparent'
                }`}
              >
                <span>{t('自动备份')}</span>
              </button>
            ) : null}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto px-5 py-[18px] flex flex-col gap-3.5">
            {activeTab === 'mcp' && (
              <MCPAccessView
                mcpInfo={mcpInfo as Parameters<typeof MCPAccessView>[0]['mcpInfo']}
                configText={configText}
                configRows={configRows}
                title={t('接入方式')}
                titleSize={18}
                showTools={true}
                mcpEnabled={mcpEnabled}
                mcpAllowBrowserCalls={mcpAllowBrowserCalls}
                mcpRequireApproval={mcpRequireApproval}
                mcpActivityVisible={mcpActivityVisible}
                onToggleMcpEnabled={() => onSaveGlobalAISettings?.({ mcpEnabled: !mcpEnabled })}
                onToggleMcpAllowBrowserCalls={() => onSaveGlobalAISettings?.({ mcpAllowBrowserCalls: !mcpAllowBrowserCalls })}
                onToggleMcpRequireApproval={() => onSaveGlobalAISettings?.(mcpRequireApproval
                  ? { mcpRequireApproval: false }
                  : { mcpRequireApproval: true, mcpActivityVisible: true })}
                onToggleMcpActivityVisible={() => onSaveGlobalAISettings?.({ mcpActivityVisible: !mcpActivityVisible })}
              />
            )}
            {activeTab === 'mcp-servers' ? (
              <MCPServersView
                servers={mcpClientServers as Parameters<typeof MCPServersView>[0]['servers']}
                globalConfigPath={mcpClientGlobalConfigPath}
                globalConfigText={mcpClientGlobalConfigText}
                onSaveServer={onSaveMCPGlobalServer}
                onReloadServers={onReloadMCPGlobalServers}
                onDeleteServer={onDeleteMCPGlobalServer}
                onRestartServer={onRestartMCPClientServer}
                onToggleServer={onToggleMCPClientServer}
                onToggleServerDisabledForPrompts={onToggleMCPClientServerDisabledForPrompts}
                onUpdateServerTimeout={onUpdateMCPClientServerTimeout}
              />
            ) : null}
            {activeTab === 'ai' ? (
              <>
                <div className="grid gap-1">
                  <div className="text-[18px] font-bold text-primary leading-[1.3]">{t('基本')}</div>
                </div>
                <div className="bg-canvas p-4 rounded-xl border border-line grid gap-3">
                  <div className="flex justify-between items-center gap-4">
                    <div className="min-w-0">
                      <div className="text-primary text-base font-bold">{t('终端隔离')}</div>
                      <div className="text-tertiary text-sm leading-[1.6]">{t('为每个终端创建独立的 AI 面板与运行期会话。修改后将在下次启动应用时生效。')}</div>
                    </div>
                    <ToggleSwitchControl checked={aiTerminalIsolation} onChange={onToggleAiTerminalIsolation} />
                  </div>
                  <div className="border-t border-line" />
                  <div className="flex justify-between items-center gap-4">
                    <div className="min-w-0">
                      <div className="text-primary text-base font-bold">{t('删除前需要二次确认')}</div>
                      <div className="text-tertiary text-sm leading-[1.6]">{t('删除 AI 对话或消息前先弹出确认提示')}</div>
                    </div>
                    <ToggleSwitchControl checked={confirmDelete} onChange={onToggleConfirmDelete} />
                  </div>
                  <div className="border-t border-line" />
                  <div className="flex justify-between items-center gap-4">
                    <div className="min-w-0">
                      <div className="text-primary text-base font-bold">{t('拒绝工具后自动继续')}</div>
                      <div className="text-tertiary text-sm leading-[1.6]">{t('关闭后，点击“拒绝”会停止本次请求并等待下一条消息。')}</div>
                    </div>
                    <ToggleSwitchControl
                      checked={continueAfterToolRejection}
                      onChange={() => onSaveGlobalAISettings?.({ continueAfterToolRejection: !continueAfterToolRejection })}
                    />
                  </div>
                  <div className="border-t border-line" />
                  <div className="flex justify-between items-center gap-4">
                    <div className="min-w-0">
                      <div className="text-primary text-base font-bold">{t('任务提示音')}</div>
                      <div className="text-tertiary text-sm leading-[1.6]">{t('在追问需要处理和任务完成时播放提示音。')}</div>
                    </div>
                    <ToggleSwitchControl
                      checked={soundEnabled !== false}
                      onChange={() => onSaveGlobalAISettings?.({ soundEnabled: soundEnabled === false })}
                    />
                  </div>
                  {soundEnabled !== false ? (
                    <>
                      <div className="border-t border-line" />
                      <div className="grid gap-2">
                        <div className="flex justify-between items-center gap-4">
                          <div className="min-w-0">
                            <div className="text-primary text-base font-bold">{t('提示音音量')}</div>
                            <div className="text-tertiary text-sm leading-[1.6]">{t('默认 20%，可按需调节。')}</div>
                          </div>
                          <span className="text-base min-w-14 text-right text-primary tabular-nums">{`${Math.round((Number.isFinite(Number(soundVolume)) ? Number(soundVolume) : 0.2) * 100)}%`}</span>
                        </div>
                        <input
                          id="ai-panel-sound-volume"
                          name="ai-panel-sound-volume"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          autoComplete="off"
                          value={Math.round((Number.isFinite(Number(soundVolume)) ? Number(soundVolume) : 0.2) * 100)}
                          onChange={(event) => onSaveGlobalAISettings?.({ soundVolume: Math.max(0, Math.min(1, (parseInt(event.target.value, 10) || 0) / 100)) })}
                          className="w-full cursor-pointer"
                        />
                      </div>
                    </>
                  ) : null}
                  <div className="border-t border-line" />
                  <div className="grid gap-2">
                    <div className="flex justify-between items-center gap-4">
                      <div className="min-w-0">
                        <div className="text-primary text-base font-bold">{t('终端输出行数上限')}</div>
                        <div className="text-tertiary text-sm leading-[1.6]">{t('控制 MCP 终端输出保留的最大行数')}</div>
                      </div>
                      <span className="text-base min-w-14 text-right text-primary tabular-nums">{terminalOutputLineLimit}</span>
                    </div>
                    <input
                      id="ai-panel-terminal-output-line-limit"
                      name="ai-panel-terminal-output-line-limit"
                      type="range"
                      min="10"
                      max="5000"
                      step="10"
                      autoComplete="off"
                      value={terminalOutputLineLimit}
                      onChange={onTerminalOutputLineLimitChange}
                      className="w-full cursor-pointer"
                    />
                  </div>
                  <div className="border-t border-line" />
                  <div className="grid gap-2">
                    <div className="grid gap-1.5">
                      <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                        <div className="text-primary text-base font-bold">{t('工具阈值')}</div>
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full border border-[rgba(var(--accent-rgb),0.24)] bg-[rgba(var(--accent-rgb),0.08)] text-primary text-sm font-bold tabular-nums font-mono">{toolResultTokenThresholdDisplay}</span>
                      </div>
                      <div className="text-tertiary text-sm leading-[1.6]">{t('当工具返回结果的预估 Token 数超过此阈值时,原始内容将被省略,并显示“结果过大”的提示.调高可保留更多原始输出,但也会增加上下文膨胀风险.')}</div>
                    </div>
                    <input
                      id="ai-panel-tool-result-token-threshold"
                      name="ai-panel-tool-result-token-threshold"
                      type="number"
                      min="1"
                      step="1000"
                      autoComplete="off"
                      value={toolResultTokenThreshold}
                      onChange={(event) => {
                        const nextValue = parseInt(event.target.value, 10)
                        if (Number.isFinite(nextValue)) {
                          void onSaveGlobalAISettings?.({ toolResultTokenThreshold: nextValue })
                        }
                      }}
                      onMouseLeave={handleInputDragSelectAll}
                      className="w-full rounded-lg border border-line bg-canvas text-primary px-2.5 py-2 text-base font-mono box-border"
                    />
                  </div>
                  <div className="border-t border-line" />
                  <div className="grid gap-2">
                    <div className="min-w-0">
                      <div className="text-primary text-base font-bold">{t('AI 请求代理')}</div>
                      <div className="text-tertiary text-sm leading-[1.6]">{t('选择 AI 请求使用的代理节点，首项为不使用。')}</div>
                    </div>
                    <select
                      id="ai-panel-proxy"
                      name="ai-panel-proxy"
                      value={aiRequestProxyId}
                      onChange={(event) => onSaveGlobalAISettings?.({ aiRequestProxyId: event.target.value })}
                      className="w-full min-h-[30px] py-[5px] pl-2.5 pr-8 bg-sunken border border-line rounded-sm text-primary text-sm outline-none cursor-pointer appearance-none bg-no-repeat transition-colors duration-[80ms] focus:border-focus focus:shadow-[0_0_0_2px_var(--accent-dim)]"
                      style={{
                        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%236e7681\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")',
                        backgroundPosition: 'right 12px center',
                      }}
                    >
                      <option value="">{t('不使用')}</option>
                      {proxyNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {[
                            node.name || t('未命名节点'),
                            node.type === 'http' ? t('HTTP 代理') : t('SOCKS5 代理'),
                            `${node.host}:${node.port}`,
                          ].join(' · ')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-1 mt-1">
                  <div className="text-[18px] font-bold text-primary leading-[1.3]">{t('数据存储')}</div>
                </div>
                <div className="bg-canvas p-4 rounded-xl border border-line grid gap-3">
                  <div className="grid gap-2">
                    <div className="min-w-0">
                      <div className="text-primary text-base font-bold">{t('对话存储目录')}</div>
                      <div className="text-tertiary text-sm leading-[1.6]">{t('AI 对话数据保存在此目录。更改目录会自动迁移现有数据。')}</div>
                    </div>
                    <input
                      id="ai-tasks-dir"
                      name="tasksDir"
                      type="text"
                      value={tasksDir || ''}
                      readOnly
                      className="w-full min-h-[30px] px-2.5 py-[5px] bg-sunken border border-line rounded-sm text-primary text-sm outline-none cursor-default transition-colors duration-[80ms] focus:border-focus focus:shadow-[0_0_0_2px_var(--accent-dim)]"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="secondary"
                        onClick={handleChangeTasksDir}
                        disabled={tasksDirMigrating}
                        className="h-[30px] px-3.5 gap-1.5"
                      >
                        {tasksDirMigrating ? <Loader2 size={14} className="spin" /> : <FolderOpen size={14} />}
                        {tasksDirMigrating ? t('迁移中...') : t('更改目录')}
                      </Button>
                      {isCustomTasksDir ? (
                        <Button
                          variant="secondary"
                          onClick={handleResetTasksDir}
                          disabled={tasksDirMigrating}
                          className="h-[30px] px-3.5 gap-1.5 text-secondary hover:text-secondary"
                        >
                          <RotateCcw size={14} />
                          {t('恢复默认')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {activeTab === 'slash-commands' ? (
              <AISlashCommandsSettings
                slashCommands={globalAISettings?.slashCommands}
                onSaveGlobalAISettings={onSaveGlobalAISettings as Parameters<typeof AISlashCommandsSettings>[0]['onSaveGlobalAISettings']}
              />
            ) : null}
            {activeTab === 'appearance' ? (
              <>
                <div className="grid gap-1">
                  <div className="text-[18px] font-bold text-primary leading-[1.3]">{t('外观')}</div>
                  <div className="text-sm text-tertiary leading-[1.5]">{t('控制底部审批与命令处理按钮的左右位置。')}</div>
                </div>
                <PositionSelectorCard
                  title={t('工具审批按钮位置')}
                  description={t('左侧为预览区,右侧点击交换"拒绝 / 批准"的左右顺序.')}
                  items={approvalButtonOrder === 'approve-reject'
                    ? [
                        { key: 'approve', label: t('批准'), primary: true },
                        { key: 'reject', label: t('拒绝'), primary: false },
                      ]
                    : [
                        { key: 'reject', label: t('拒绝'), primary: false },
                        { key: 'approve', label: t('批准'), primary: true },
                      ]}
                  onToggle={() => onSaveGlobalAISettings?.({
                    approvalButtonOrder: approvalButtonOrder === 'approve-reject' ? 'reject-approve' : 'approve-reject',
                  })}
                  toggleLabel={t('交换位置')}
                />
                <PositionSelectorCard
                  title={t('命令处理按钮位置')}
                  description={t('左侧为预览区,右侧点击交换"强制继续 / 终止工具"的左右顺序.')}
                  items={commandActionButtonOrder === 'continue-terminate'
                    ? [
                        { key: 'continue', label: t('强制继续'), primary: true },
                        { key: 'terminate', label: t('终止工具'), primary: false },
                      ]
                    : [
                        { key: 'terminate', label: t('终止工具'), primary: false },
                        { key: 'continue', label: t('强制继续'), primary: true },
                      ]}
                  onToggle={() => onSaveGlobalAISettings?.({
                    commandActionButtonOrder: commandActionButtonOrder === 'continue-terminate' ? 'terminate-continue' : 'continue-terminate',
                  })}
                  toggleLabel={t('交换位置')}
                />
                <div className="bg-canvas p-3.5 rounded-xl border border-line flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    <div className="text-primary text-base font-bold">{t('消息操作条置底')}</div>
                    <div className="text-tertiary text-sm leading-[1.6]">{t('启用后,用户消息与Ai消息的操作条显示在每轮消息主体底部;关闭后显示在顶部.')}</div>
                  </div>
                  <ToggleSwitchControl
                    checked={messageActionBarAtBottom}
                    onChange={() => onSaveGlobalAISettings?.({
                      messageActionBarAtBottom: !messageActionBarAtBottom,
                    })}
                  />
                </div>
                <div className="bg-canvas p-3.5 rounded-xl border border-line flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    <div className="text-primary text-base font-bold">{t('用户消息导航')}</div>
                    <div className="text-tertiary text-sm leading-[1.6]">{t('启用后,对话区左侧显示用户消息导航圆点,悬停预览内容,点击跳转到对应消息.')}</div>
                  </div>
                  <ToggleSwitchControl
                    checked={messageNavEnabled}
                    onChange={() => onSaveGlobalAISettings?.({
                      messageNavEnabled: !messageNavEnabled,
                    })}
                  />
                </div>
              </>
            ) : null}
            {activeTab === 'backup' && activeConversationId ? (
              <AIConversationBackupSettings
                active={activeTab === 'backup'}
                conversationId={activeConversationId}
                conversationUpdatedAt={conversationUpdatedAt}
                requestInFlight={backupRequestInFlight}
                onRestoreSnapshot={onRestoreConversationBackup}
                autoBackupEnabled={autoBackupEnabled}
                onToggleAutoBackup={onToggleAutoBackup}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}