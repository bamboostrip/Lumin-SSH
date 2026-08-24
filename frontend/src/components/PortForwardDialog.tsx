import { useState, useEffect, type ChangeEvent } from 'react';
import { ExternalLink, X, ArrowRight, ArrowLeftRight, MonitorSmartphone, Server, Hash, Power, Play, Trash2 } from 'lucide-react';
import * as AppGo from '../../wailsjs/go/wailsapp/App.js';
import { useTranslation } from '../i18n.ts';
import { Button } from './ui';
import { cn } from '../utils/cn.ts';
import { Z } from '../constants/zIndex';
import type { PortForwardInitialMapping } from '../hooks/usePortForwardDialog.ts';
import type { sshmanager } from '../../wailsjs/go/models.ts';

const INPUT_CLASS =
  'w-full box-border px-2.5 py-2 text-base bg-sunken border border-line rounded-sm text-primary outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-muted focus:border-accent focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_18%,transparent)]';

export interface PortForwardDialogProps {
  sessionId: string;
  onClose: () => void;
  initialMapping: PortForwardInitialMapping | null;
  initialTab: string | null;
}

export default function PortForwardDialog({
    sessionId,
    onClose,
    initialMapping = null,
    initialTab = null,
}: PortForwardDialogProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<string>(initialTab || (initialMapping ? 'new' : 'list'));
    const [portForwards, setPortForwards] = useState<sshmanager.PortForwardInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [kind, setKind] = useState<string>(initialMapping?.kind || 'local');
    const [localHost, setLocalHost] = useState<string>(initialMapping?.localHost || '127.0.0.1');
    const [localPort, setLocalPort] = useState<string>(initialMapping?.localPort || '');
    const [remoteHost, setRemoteHost] = useState<string>(initialMapping?.remoteHost || '127.0.0.1');
    const [remotePort, setRemotePort] = useState<string>(initialMapping?.remotePort || '');
    const [error, setError] = useState('');

    useEffect(() => {
        void refreshPortForwards();
    }, [sessionId]);

    useEffect(() => {
        if (!initialMapping) return;
        setActiveTab('new');
        setKind(initialMapping.kind || 'local');
        setLocalHost(initialMapping.localHost || '127.0.0.1');
        setLocalPort(initialMapping.localPort || '');
        setRemoteHost(initialMapping.remoteHost || '127.0.0.1');
        setRemotePort(initialMapping.remotePort || '');
    }, [initialMapping]);

    // 通知监控面板端口映射卡片实时刷新
    const notifyChanged = () => {
        window.dispatchEvent(new CustomEvent('port-forward-changed', { detail: { sessionId } }));
    };

    const refreshPortForwards = async () => {
        setLoading(true);
        try {
            const list = await AppGo.ListPortForwards(sessionId);
            setPortForwards(list || []);
        } catch (err) {
            window.luminDialog?.alert(`${t('加载端口映射失败')}: ${String(err)}`);
        } finally {
            setLoading(false);
        }
    };

    const normalizePort = (value: string) => {
        return value.trim();
    };

    const validatePort = (value: string) => {
        const port = normalizePort(value);
        if (!/^[0-9]+$/.test(port)) {
            return false;
        }
        const intValue = Number(port);
        return intValue >= 1 && intValue <= 65535;
    };

    const handleCreate = async () => {
        setError('');
        const normalizedLocalPort = normalizePort(localPort);
        const normalizedRemotePort = normalizePort(remotePort);
        if (!validatePort(normalizedLocalPort) || !validatePort(normalizedRemotePort)) {
            setError(t('请输入有效的端口号（1-65535）'));
            return;
        }
        if (!remoteHost.trim()) {
            setError(t('请输入远程主机地址'));
            return;
        }
        if (!localHost.trim()) {
            setError(t('请输入本机主机地址'));
            return;
        }

        // localHost/localPort 恒为本机侧, remoteHost/remotePort 恒为远程侧
        const localAddr = `${localHost}:${normalizedLocalPort}`;
        const remoteAddr = `${remoteHost}:${normalizedRemotePort}`;
        setSubmitting(true);

        try {
            if (kind === 'local') {
                // SSH -L: 本机监听 localAddr, 转发到远程可达的 remoteAddr
                await AppGo.StartLocalPortForward(sessionId, localAddr, remoteAddr);
            } else {
                // SSH -R: 远程监听 remoteAddr, 转发回本机的 localAddr
                await AppGo.StartRemotePortForward(sessionId, remoteAddr, localAddr);
            }
            notifyChanged();
            await refreshPortForwards();
            setActiveTab('list');
        } catch (err) {
            if (kind === 'local' && String(err).includes('local port already in use')) {
                setError(t('本地端口已占用'));
                return;
            }
            window.luminDialog?.alert(`${kind === 'local' ? t('创建本地端口映射失败') : t('创建远程端口映射失败')}: ${String(err)}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleStop = async (id: string) => {
        try {
            await AppGo.StopPortForwardForSession(sessionId, id);
            notifyChanged();
            await refreshPortForwards();
        } catch (err) {
            window.luminDialog?.alert(`${t('关闭端口映射失败')}: ${String(err)}`);
        }
    };

    const handleRestart = async (id: string) => {
        try {
            await AppGo.RestartPortForwardForSession(sessionId, id);
            notifyChanged();
            await refreshPortForwards();
        } catch (err) {
            window.luminDialog?.alert(`${t('关闭端口映射失败')}: ${String(err)}`);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await AppGo.DeletePortForwardForSession(sessionId, id);
            setPortForwards((prev) => prev.filter((info) => info.ID !== id));
            notifyChanged();
            await refreshPortForwards();
        } catch (err) {
            window.luminDialog?.alert(`${t('关闭端口映射失败')}: ${String(err)}`);
        }
    };

    // 列表方向文案对齐后端语义: local=SSH -L 本地监听→远程目标; remote=SSH -R 远程监听→本机目标
    const renderMappingLabel = (info: sshmanager.PortForwardInfo) => {
        if (info.Kind === 'local') {
            return `${t('本地监听')} ${info.LocalAddr} → ${t('远程目标')} ${info.RemoteAddr}`;
        }
        return `${t('远程监听')} ${info.RemoteAddr} → ${t('本机目标')} ${info.LocalAddr}`;
    };

    // 地址字段块: 卡片化容器, 与上方方向卡片视觉统一; 输入框绑定固定(local*=本机, remote*=远程), 仅 label/图标/角色随 kind 变
    // 监听地址安全判定: 仅回环地址视为安全; 空值或 0.0.0.0/:: 等非回环地址视为可能对外暴露
    const isSafeListenHost = (host: string) => {
        const h = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
        return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    };

    interface AddressFieldCardOptions {
        keyName: string;
        roleText: string;
        roleColor: string;
        roleIcon: React.ReactNode;
        hostValue: string;
        onHostChange: (event: ChangeEvent<HTMLInputElement>) => void;
        portValue: string;
        onPortChange: (event: ChangeEvent<HTMLInputElement>) => void;
        isListen: boolean;
    }
    const addressFieldCard = (options: AddressFieldCardOptions) => {
        const { keyName, roleText, roleColor, roleIcon, hostValue, onHostChange, portValue, onPortChange, isListen } = options;
        const showListenWarning = isListen && hostValue.trim() !== '' && !isSafeListenHost(hostValue);
        return (
            <div
                key={keyName}
                className="px-3.5 py-3 rounded-md border border-line bg-raised flex flex-col gap-2.5"
            >
                <div className="flex items-center gap-2">
                    <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-xs shrink-0"
                        style={{
                            background: `color-mix(in srgb, ${roleColor} 14%, transparent)`,
                            color: roleColor,
                        }}
                    >
                        {roleIcon}
                    </span>
                    <span className="text-base font-semibold text-primary">{roleText}</span>
                </div>
                <div className="grid grid-cols-[1fr_108px] gap-2.5">
                    <div className="flex flex-col gap-1">
                        <label htmlFor={`pf-${keyName}-host`} className="flex items-center gap-[5px] text-xs text-tertiary">
                            <Server size={11} /> {t('主机地址')}
                        </label>
                        <input
                            type="text"
                            id={`pf-${keyName}-host`}
                            name={`pf-${keyName}-host`}
                            autoComplete="off"
                            value={hostValue}
                            onChange={onHostChange}
                            placeholder="127.0.0.1"
                            className={cn(INPUT_CLASS, showListenWarning && 'border-danger')}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor={`pf-${keyName}-port`} className="flex items-center gap-[5px] text-xs text-tertiary">
                            <Hash size={11} /> {t('端口')}
                        </label>
                        <input
                            type="text"
                            id={`pf-${keyName}-port`}
                            name={`pf-${keyName}-port`}
                            autoComplete="off"
                            value={portValue}
                            onChange={onPortChange}
                            placeholder="0"
                            className={INPUT_CLASS}
                        />
                    </div>
                </div>
                {showListenWarning && (
                    <div className="text-xs leading-[1.4] text-danger">
                        {t('警告: 0.0.0.0、:: 或其他非本地地址可能暴露监听端口')}
                    </div>
                )}
            </div>
        );
    };
    const localFieldBlock = addressFieldCard({
        keyName: 'local',
        roleText: kind === 'local' ? t('本地监听地址') : t('本地目标地址'),
        roleColor: 'var(--accent)',
        roleIcon: <MonitorSmartphone size={14} />,
        hostValue: localHost,
        onHostChange: (event) => setLocalHost(event.target.value),
        portValue: localPort,
        onPortChange: (event) => setLocalPort(event.target.value),
        isListen: kind === 'local',
    });
    const remoteFieldBlock = addressFieldCard({
        keyName: 'remote',
        roleText: kind === 'local' ? t('远程目标地址') : t('远程监听地址'),
        roleColor: 'var(--success)',
        roleIcon: <Server size={14} />,
        hostValue: remoteHost,
        onHostChange: (event) => setRemoteHost(event.target.value),
        portValue: remotePort,
        onPortChange: (event) => setRemotePort(event.target.value),
        isListen: kind === 'remote',
    });
    // local(-L): 监听端在本机, 本机在上; remote(-R): 监听端在远程, 远程在上
    const orderedFieldBlocks = kind === 'local'
        ? [localFieldBlock, remoteFieldBlock]
        : [remoteFieldBlock, localFieldBlock];

    const kindOptions = [
        {
            value: 'local',
            title: t('本地转发到远程'),
            desc: t('在本机监听一个端口，连接会被转发到远程可达的服务'),
        },
        {
            value: 'remote',
            title: t('远程转发到本地'),
            desc: t('在远程监听一个端口，连接会被转发回本机的服务'),
        },
    ];

    return (
        <div
            className="fixed inset-0 flex items-start justify-center bg-black/[0.42] animate-[fadeIn_0.12s_ease] pt-[52px]"
            style={{ zIndex: Z.MODAL }}
        >
            <div className="relative w-full max-w-[560px] flex flex-col bg-raised border border-line rounded-md shadow-lg overflow-hidden max-h-[calc(100vh-80px)] animate-[slideUp_0.12s_ease]">
                <div className="px-5 pt-4 flex items-center justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2 text-md font-semibold text-primary mb-1">{t('端口映射')}</div>
                        <div className="text-secondary text-[0.92rem]">
                            {t('在本机与远程服务器之间建立端口转发通道。')}
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" type="button" onClick={onClose} aria-label={t('关闭')}>
                        <X size={16} />
                    </Button>
                </div>

                <div className="flex gap-2 px-6 pt-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-pressed={activeTab === 'list'}
                        onClick={() => setActiveTab('list')}
                    >
                        {t('当前映射')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-pressed={activeTab === 'new'}
                        onClick={() => setActiveTab('new')}
                    >
                        {t('新建映射')}
                    </Button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 min-h-0">
                    {activeTab === 'list' ? (
                        <div>
                            <div className="mb-4 flex justify-between items-center">
                                <div className="font-medium">{t('当前会话端口映射')}</div>
                                <Button variant="secondary" size="sm" onClick={refreshPortForwards} disabled={loading}>
                                    {t('刷新')}
                                </Button>
                            </div>
                            {loading ? (
                                <div>{t('加载中...')}</div>
                            ) : portForwards.length === 0 ? (
                                <div className="text-tertiary">{t('当前会话没有端口映射。')}</div>
                            ) : (
                                <div className="grid gap-y-3">
                                    {portForwards.map((info) => {
                                        const stopped = info.Enabled === false;
                                        return (
                                            <div
                                                key={info.ID}
                                                className="p-3 border border-line rounded-xl grid grid-cols-[1fr_auto] gap-3 items-center"
                                                style={{ opacity: stopped ? 0.65 : 1 }}
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="font-semibold">{renderMappingLabel(info)}</span>
                                                        {stopped && (
                                                            <span className="shrink-0 text-xs px-2 py-px rounded-full bg-[color-mix(in_srgb,var(--text-tertiary)_18%,transparent)] text-tertiary">{t('已停止')}</span>
                                                        )}
                                                    </div>
                                                    <div className="text-secondary text-sm">{info.ID}</div>
                                                    {!stopped && info.Kind === 'local' && info.LocalAddr && (
                                                        <a
                                                            href={`http://${info.LocalAddr}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 mt-2 text-accent text-sm"
                                                        >
                                                            {t('打开本地地址')} <ExternalLink size={12} />
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {stopped ? (
                                                        <Button variant="secondary" size="sm" onClick={() => void handleRestart(info.ID)} className="gap-[5px] text-success">
                                                            <Play size={13} /> {t('重启')}
                                                        </Button>
                                                    ) : (
                                                        <Button variant="secondary" size="sm" onClick={() => void handleStop(info.ID)} className="gap-[5px] text-warning">
                                                            <Power size={13} /> {t('停止')}
                                                        </Button>
                                                    )}
                                                    <Button variant="secondary" size="sm" onClick={() => void handleDelete(info.ID)} className="gap-[5px] text-danger">
                                                        <Trash2 size={13} /> {t('删除')}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-y-4">
                            {/* 方向选择: 卡片式, 标题 + 说明, 避免只用按钮文案表达方向 */}
                            <div className="grid grid-cols-2 gap-3">
                                {kindOptions.map((option) => {
                                    const selected = kind === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setKind(option.value)}
                                            className={cn(
                                                'text-left px-3.5 py-3 rounded-xl border cursor-pointer transition-colors duration-100 flex flex-col gap-1.5',
                                                selected
                                                    ? 'border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
                                                    : 'border-line bg-raised',
                                            )}
                                        >
                                            <span className={cn('flex items-center gap-1.5 font-semibold', selected ? 'text-accent' : 'text-primary')}>
                                                <ArrowLeftRight size={14} />
                                                {option.title}
                                            </span>
                                            <span className="text-sm text-secondary leading-normal">
                                                {option.desc}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 方向可视化: 监听端 → 目标端 */}
                            <div className="flex items-center justify-center gap-3 py-1.5 text-secondary text-sm">
                                <span className="px-2.5 py-[3px] rounded-full border border-line bg-raised">
                                    {kind === 'local' ? t('本地监听') : t('远程监听')}
                                </span>
                                <ArrowRight size={16} className="text-accent" />
                                <span className="px-2.5 py-[3px] rounded-full border border-line bg-raised">
                                    {kind === 'local' ? t('远程目标') : t('本机目标')}
                                </span>
                            </div>

                            <div className="grid gap-y-3">
                                {orderedFieldBlocks}
                            </div>

                            {error && (
                                <div className="text-danger mt-1">{error}</div>
                            )}

                            <div className="flex justify-end gap-2.5 mt-2">
                                <Button variant="secondary" onClick={onClose} disabled={submitting}>
                                    {t('关闭')}
                                </Button>
                                <Button variant="primary" onClick={handleCreate} disabled={submitting}>
                                    {submitting ? t('创建中...') : t('创建映射')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}