import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import * as AppGo from '../../wailsjs/go/wailsapp/App.js';
import { useTranslation } from '../i18n.ts';
import Tiptop from './Tiptop.tsx';
import { formatRate, formatTransferTotal } from './probeFormatting.ts';
import { Button } from './ui';
import { cn } from '../utils/cn.ts';
import { Z } from '../constants/zIndex.ts';
import { Globe, RefreshCw, ArrowDown, ArrowUp, Info, ArrowUpDown, Search, X } from 'lucide-react';

const HISTORY_SIZE = 60;

/** 文件内复用卡片基底（surface-raised + border + r8），等价于原先重复手写的卡片内联样式 */
const CARD_SHELL = 'bg-raised border border-line rounded-lg';

/** 网卡统计（AppGo.NetworkInfo 返回的宽松结构） */
interface NetworkInterfaceInfo {
  name?: string;
  uploadSpeed?: number;
  downloadSpeed?: number;
  uploadTotal?: number;
  downloadTotal?: number;
}

/** 连接对端 */
interface ConnectionPeer {
  ip?: string;
  port?: string | number;
  location?: string;
  upload?: number;
  download?: number;
}

/** 监听端口连接条目 */
interface NetworkConnection {
  pid?: string | number;
  name?: string;
  listenIP?: string;
  port?: string | number;
  ipCount?: number;
  connCount?: number;
  upload?: number;
  download?: number;
  peers?: ConnectionPeer[];
}

interface NetworkState {
  uploadSpeed?: number;
  downloadSpeed?: number;
  uploadTotal?: number;
  downloadTotal?: number;
  interfaces?: NetworkInterfaceInfo[];
  connections?: NetworkConnection[];
}

const connectionSortFns: Record<string, (a: NetworkConnection, b: NetworkConnection) => number> = {
  pid: (a, b) => Number(a.pid || 0) - Number(b.pid || 0),
  name: (a, b) => (a.name || '').localeCompare(b.name || ''),
  listenIP: (a, b) => (a.listenIP || '').localeCompare(b.listenIP || ''),
  port: (a, b) => Number(a.port || 0) - Number(b.port || 0),
  ipCount: (a, b) => (a.ipCount || 0) - (b.ipCount || 0),
  connCount: (a, b) => (a.connCount || 0) - (b.connCount || 0),
  upload: (a, b) => (a.upload || 0) - (b.upload || 0),
  download: (a, b) => (a.download || 0) - (b.download || 0),
};
const defaultConnectionColWidths: Record<string, number> = { pid: 70, name: 150, listenIP: 150, port: 80, ipCount: 70, connCount: 80, upload: 90, download: 90 };

interface SparklineProps {
  data: number[];
  color: string;
}

function Sparkline({ data, color }: SparklineProps) {
  const points = data || [];
  const path = useMemo(() => {
    if (points.length < 2) return '';
    const max = Math.max(...points, 1);
    return points.map((v, i) => `${(i / (points.length - 1)) * 100},${34 - (v / max) * 32}`).join(' ');
  }, [points]);
  if (!path) return <div className="h-[34px]" />;
  return (
    <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="w-full h-[34px] block">
      <polyline points={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface NetworkPageProps {
  sessionId: string;
  active: boolean;
}

export default function NetworkPage({ sessionId, active }: NetworkPageProps) {
  const { t } = useTranslation();
  const [network, setNetwork] = useState<NetworkState | null>(null);
  const [history, setHistory] = useState<{ up: number[]; down: number[] }>({ up: Array(HISTORY_SIZE).fill(0), down: Array(HISTORY_SIZE).fill(0) });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllListeners, setShowAllListeners] = useState(() => localStorage.getItem('networkShowAllListeners') === 'true');
  const [showInstallTips, setShowInstallTips] = useState(false);
  const [connectionSearchQuery, setConnectionSearchQuery] = useState('');
  const [detailConnections, setDetailConnections] = useState<Array<{ key: string; item: NetworkConnection }>>([]);
  const [activeDetailKey, setActiveDetailKey] = useState<string | null>(null);
  const [connectionSortKey, setConnectionSortKey] = useState('download');
  const [connectionSortAsc, setConnectionSortAsc] = useState(false);
  const [connectionColWidths, setConnectionColWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('networkConnectionColWidths');
    if (saved) try { return { ...defaultConnectionColWidths, ...JSON.parse(saved) }; } catch {}
    return defaultConnectionColWidths;
  });
  const [detailHeight, setDetailHeight] = useState(() => parseFloat(localStorage.getItem('networkDetailHeight') || '220'));
  const timerRef = useRef<number | null>(null);
  const colDragging = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await AppGo.NetworkInfo(sessionId);
      const next = data?.network || {};
      if (!mountedRef.current) return;
      setNetwork(next);
      setHistory(prev => ({
        up: [...prev.up, next.uploadSpeed || 0].slice(-HISTORY_SIZE),
        down: [...prev.down, next.downloadSpeed || 0].slice(-HISTORY_SIZE),
      }));
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setNetwork(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const scheduleNext = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const interval = parseInt(localStorage.getItem('probeInterval') || '3', 10);
      timerRef.current = setTimeout(async () => {
        await load();
        if (!stopped) scheduleNext();
      }, Math.max(interval, 1) * 1000);
    };
    const run = async () => {
      await load();
      if (!stopped) scheduleNext();
    };
    run();
    const onIntervalChange = () => scheduleNext();
    window.addEventListener('probeIntervalChanged', onIntervalChange);
    return () => {
      stopped = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('probeIntervalChanged', onIntervalChange);
    };
  }, [active, load]);

  const interfaces = Array.isArray(network?.interfaces) ? network.interfaces : [];
  const connections = Array.isArray(network?.connections) ? network.connections : [];
  const filteredConnections = showAllListeners
    ? connections
    : connections.filter(item => (item.connCount || 0) > 0 || (item.upload || 0) > 0 || (item.download || 0) > 0);
  const connectionSearchTokens = connectionSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searchedConnections = connectionSearchTokens.length === 0
    ? filteredConnections
    : filteredConnections.filter((item) => {
      const peers = Array.isArray(item.peers) ? item.peers : [];
      const searchableText = [
        item.pid,
        item.name,
        item.listenIP,
        item.port,
        item.ipCount,
        item.connCount,
        ...peers.flatMap(peer => [peer.ip, peer.port, peer.location]),
      ].filter(value => value != null).join(' ').toLowerCase();
      return connectionSearchTokens.every(token => searchableText.includes(token));
    });
  const visibleConnections = [...searchedConnections].sort((a, b) => {
    const fn = connectionSortFns[connectionSortKey] || connectionSortFns.download;
    return connectionSortAsc ? fn(a, b) : fn(b, a);
  });
  const hiddenConnectionCount = connections.length - filteredConnections.length;
  const connectionTableColumns = `${connectionColWidths.pid}px ${connectionColWidths.name}px ${connectionColWidths.listenIP}px ${connectionColWidths.port}px ${connectionColWidths.ipCount}px ${connectionColWidths.connCount}px ${connectionColWidths.upload}px minmax(${connectionColWidths.download}px, 1fr)`;
  const connectionTableMinWidth = Math.max(840, Object.values(connectionColWidths).reduce((sum, width) => sum + width, 0));
  const activeDetailConnection = detailConnections.find(item => item.key === activeDetailKey) || null;
  const formatOptionalTransfer = (value: number | undefined) => value == null ? '--' : formatTransferTotal(value);
  const handleShowAllListenersChange = (checked: boolean) => {
    setShowAllListeners(checked);
    localStorage.setItem('networkShowAllListeners', checked ? 'true' : 'false');
  };
  const handleConnectionSort = (key: string) => {
    if (key === connectionSortKey) setConnectionSortAsc(v => !v);
    else { setConnectionSortKey(key); setConnectionSortAsc(false); }
  };
  const renderConnectionSortIcon = (key: string) => {
    if (key !== connectionSortKey) return <ArrowUpDown size={13} className="opacity-65 ml-0.5 shrink-0" />;
    return connectionSortAsc
      ? <ArrowUp size={13} className="ml-0.5 shrink-0 text-accent" />
      : <ArrowDown size={13} className="ml-0.5 shrink-0 text-accent" />;
  };
  const startDetailDrag = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startH = detailHeight;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(120, Math.min(600, startH - (ev.clientY - startY)));
      setDetailHeight(next);
      localStorage.setItem('networkDetailHeight', String(next));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [detailHeight]);
  const startConnectionColResize = useCallback((colKey: string, event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = connectionColWidths[colKey];
    colDragging.current = false;
    const onMove = (ev: MouseEvent) => {
      colDragging.current = true;
      const next = { ...connectionColWidths, [colKey]: Math.max(50, Math.min(420, startW + (ev.clientX - startX))) };
      setConnectionColWidths(next);
      localStorage.setItem('networkConnectionColWidths', JSON.stringify(next));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [connectionColWidths]);
  const getConnectionKey = (item: NetworkConnection, index: number) => `${item.pid}-${item.name}-${item.listenIP}-${item.port}-${index}`;
  const formatLocation = (value: string | undefined) => value === 'reserved' ? t('保留地址') : (value || '-');
  const openConnectionDetail = (item: NetworkConnection, key: string) => {
    if (!Array.isArray(item.peers) || item.peers.length === 0) return;
    setDetailConnections(prev => {
      if (prev.some(detail => detail.key === key)) return prev;
      return [...prev, { key, item }];
    });
    setActiveDetailKey(key);
  };
  const closeConnectionDetail = (key: string) => {
    setDetailConnections(prev => {
      const index = prev.findIndex(detail => detail.key === key);
      const next = prev.filter(detail => detail.key !== key);
      if (activeDetailKey === key) {
        setActiveDetailKey(next.length ? next[Math.min(index, next.length - 1)].key : null);
      }
      return next;
    });
  };

  return (
    <div className="h-full w-full flex-1 min-w-0 flex flex-col bg-canvas overflow-hidden">
      <div className="h-11 flex items-center gap-2.5 px-3.5 border-b border-line bg-raised shrink-0">
        <Globe size={16} className="text-tertiary" />
        <div className="text-md font-bold text-primary flex-1">{t('网络监控')}</div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} /> {t('刷新')}
        </Button>
      </div>

      <div className="flex-1 min-w-0 overflow-auto p-3.5">
        {error ? (
          <div className="text-danger text-base">{t('加载失败')}: {error}</div>
        ) : (
          <div className="w-full min-w-0 flex flex-col gap-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
              {[
                { icon: <ArrowUp size={14} />, label: t('上传速度'), value: formatRate(network?.uploadSpeed || 0), color: 'var(--success)' },
                { icon: <ArrowDown size={14} />, label: t('下载速度'), value: formatRate(network?.downloadSpeed || 0), color: 'var(--accent)' },
                { icon: <ArrowUp size={14} />, label: t('总上传'), value: formatTransferTotal(network?.uploadTotal || 0), color: 'var(--success)' },
                { icon: <ArrowDown size={14} />, label: t('总下载'), value: formatTransferTotal(network?.downloadTotal || 0), color: 'var(--accent)' },
              ].map(item => (
                <div key={item.label} className={`${CARD_SHELL} px-3.5 py-3`}>
                  <div className="flex items-center gap-1.5 text-tertiary text-sm mb-2">{item.icon}{item.label}</div>
                  <div className="font-mono text-2xl font-bold" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
              <div className={`${CARD_SHELL} p-3`}>
                <div className="text-sm text-tertiary mb-2">{t('上传速度')}</div>
                <Sparkline data={history.up} color="var(--success)" />
              </div>
              <div className={`${CARD_SHELL} p-3`}>
                <div className="text-sm text-tertiary mb-2">{t('下载速度')}</div>
                <Sparkline data={history.down} color="var(--accent)" />
              </div>
            </div>

            <div className={cn(CARD_SHELL, 'flex items-start gap-2 px-3 py-2 text-tertiary text-sm leading-[1.6]')}>
              <Info size={14} className="mt-0.5 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{t('网络监控默认使用 /proc 和 iproute2/ss 采集数据，通常无需安装；lsof 与 net-tools 仅作为旧系统兼容补充。')}</span>
                  <button type="button" onClick={() => setShowInstallTips(v => !v)} className="border border-accent bg-accent/[0.14] text-accent rounded-md px-[9px] py-[3px] text-sm font-bold cursor-pointer">{showInstallTips ? t('收起') : t('可选安装命令')}</button>
                </div>
                {showInstallTips ? (
                  <div className="mt-1.5">
                    <div>{t('安装以下工具包后，可提升旧系统兼容性，并让 PID、进程名、端口、连接和网卡统计更完整准确')}:</div>
                    <div className="grid gap-[5px] mt-1.5 font-mono overflow-x-auto">
                      {[
                        ['Debian/Ubuntu', 'apt update && apt install iproute2 lsof net-tools -y'],
                        ['RHEL/CentOS/Rocky/Alma', 'yum install iproute lsof net-tools -y'],
                        ['Fedora', 'dnf install iproute lsof net-tools -y'],
                        ['Arch', 'pacman -Sy --noconfirm iproute2 lsof net-tools'],
                        ['Alpine', 'apk add iproute2 lsof net-tools'],
                        ['openSUSE', 'zypper install -y iproute2 lsof net-tools'],
                      ].map(([name, command]) => (
                        <code key={name} className="block px-2 py-[5px] rounded-md bg-sunken border border-line-light text-primary whitespace-nowrap"><span className="text-accent font-bold">{name}</span><span className="text-tertiary">: </span><span className="text-success">{command}</span></code>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`${CARD_SHELL} overflow-hidden`}>
              <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-2.5 py-[9px] px-3 border-b border-line text-tertiary text-sm font-bold">
                <span>{t('网卡')}</span>
                <span>{t('上传速度')}</span>
                <span>{t('下载速度')}</span>
                <span>{t('总上传')}</span>
                <span>{t('总下载')}</span>
              </div>
              {interfaces.length > 0 ? interfaces.map(item => (
                <div key={item.name} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-2.5 py-[9px] px-3 border-b border-line-subtle items-center text-[12.5px]">
                  <span className="text-primary font-mono font-bold">{item.name}</span>
                  <span className="text-success font-mono">{formatRate(item.uploadSpeed || 0)}</span>
                  <span className="text-accent font-mono">{formatRate(item.downloadSpeed || 0)}</span>
                  <span className="text-tertiary font-mono">{formatTransferTotal(item.uploadTotal || 0)}</span>
                  <span className="text-tertiary font-mono">{formatTransferTotal(item.downloadTotal || 0)}</span>
                </div>
              )) : (
                <div className="p-[18px] text-tertiary text-base text-center">{loading ? t('加载中...') : t('暂无网络接口数据')}</div>
              )}
            </div>

            <div className="data-table-shell w-full min-w-0 overflow-hidden">
              <div className="flex items-center gap-2.5 px-3 py-2 border-b border-line flex-wrap">
                <div className="text-base font-bold text-primary mr-0.5">{t('连接端口')}</div>
                <div className="relative flex-[1_1_240px] max-w-[420px] min-w-[180px]">
                  <Search size={13} className="absolute left-[9px] top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    className={cn('input w-full h-7 py-1 pl-7 text-xs', connectionSearchQuery ? 'pr-[30px]' : 'pr-2')}
                    type="search"
                    name="network-connection-search"
                    autoComplete="off"
                    value={connectionSearchQuery}
                    onChange={(event) => setConnectionSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && connectionSearchQuery) {
                        event.preventDefault();
                        setConnectionSearchQuery('');
                      }
                    }}
                    placeholder={t('搜索PID、名称、IP或端口...')}
                    aria-label={t('搜索网络连接')}
                  />
                  {connectionSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => setConnectionSearchQuery('')}
                      aria-label={t('清除搜索')}
                      className="absolute right-[5px] top-1/2 -translate-y-1/2 border-none bg-transparent text-muted cursor-pointer p-[3px] flex"
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </div>
                <label className="flex items-center gap-2 ml-auto text-sm text-tertiary cursor-pointer">
                  <input id="network-page-show-all-listeners" name="network-page-show-all-listeners" autoComplete="off" type="checkbox" checked={showAllListeners} onChange={(event) => handleShowAllListenersChange(event.target.checked)} />
                  <span>{t('显示全部监听端口')}</span>
                  {!showAllListeners && hiddenConnectionCount > 0 ? <span>({t('已隐藏空闲监听端口')}: {hiddenConnectionCount})</span> : null}
                </label>
              </div>
              <div className="overflow-x-auto">
              <div style={{ gridTemplateColumns: connectionTableColumns, minWidth: connectionTableMinWidth }} className="grid gap-0 bg-sunken border-b border-line text-tertiary text-sm font-bold select-none">
                {[
                  ['pid', 'PID'], ['name', t('名称')], ['listenIP', t('监听IP')], ['port', t('端口')],
                  ['ipCount', t('IP数')], ['connCount', t('连接数')], ['upload', t('上传')], ['download', t('下载')]
                ].map(([key, label]) => (
                  <div key={key} onClick={(event) => { if (colDragging.current) { colDragging.current = false; return; } handleConnectionSort(key); }} className={cn(
                    'py-2 px-1.5 relative flex items-center gap-0.5 cursor-pointer select-none min-w-0',
                    key === 'download' ? null : 'border-r border-line-light',
                    ['pid', 'port', 'ipCount', 'connCount', 'upload', 'download'].includes(key) ? 'justify-end' : 'justify-start',
                    connectionSortKey === key && 'bg-active text-primary',
                  )}>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>{renderConnectionSortIcon(key)}
                    {key !== 'download' && <div onMouseDown={(event) => { event.stopPropagation(); startConnectionColResize(key, event); }} className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize" style={{ zIndex: Z.STACK }} />}
                  </div>
                ))}
              </div>
              {visibleConnections.length > 0 ? visibleConnections.map((item, index) => {
                const key = getConnectionKey(item, index);
                const peers = Array.isArray(item.peers) ? item.peers : [];
                const active = activeDetailKey === key;
                return (
                  <Tiptop key={key} text={peers.length > 0 ? t('点击查看连接明细') : t('无连接可展开')}>
                    <div onClick={() => openConnectionDetail(item, key)} style={{ gridTemplateColumns: connectionTableColumns, minWidth: connectionTableMinWidth }} className={cn(
                      'grid gap-0 border-b border-line-subtle items-center text-[12.5px]',
                      peers.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-[0.72]',
                      active && 'bg-active',
                    )}>
                      <span className="py-2 px-1.5 text-right border-r border-line-light text-tertiary font-mono">{item.pid || '-'}</span>
                      <span className="py-2 px-1.5 border-r border-line-light text-primary truncate" title={item.name || '-'}>{item.name || '-'}</span>
                      <span className="py-2 px-1.5 border-r border-line-light text-tertiary font-mono truncate" title={item.listenIP || '*'}>{item.listenIP || '*'}</span>
                      <span className="py-2 px-1.5 text-right border-r border-line-light text-accent font-mono font-bold">{item.port || '-'}</span>
                      <span className="py-2 px-1.5 text-right border-r border-line-light text-tertiary font-mono">{item.ipCount ?? 0}</span>
                      <span className="py-2 px-1.5 text-right border-r border-line-light text-primary font-mono">{item.connCount ?? 0}</span>
                      <span className="py-2 px-1.5 text-right border-r border-line-light text-success font-mono">{formatOptionalTransfer(item.upload)}</span>
                      <span className="py-2 px-1.5 text-right text-accent font-mono">{formatOptionalTransfer(item.download)}</span>
                    </div>
                  </Tiptop>
                );
              }) : (
                <div style={{ minWidth: connectionTableMinWidth }} className="p-[18px] text-tertiary text-base text-center">{loading ? t('加载中...') : connectionSearchTokens.length > 0 ? t('未找到匹配的网络连接') : connections.length > 0 ? t('空闲监听端口已隐藏') : t('暂无网络连接数据')}</div>
              )}
              </div>
            </div>

          </div>
        )}
      </div>

      {detailConnections.length > 0 ? (
        <>
          <div className="split-resizer-h hotzone-bottom" onMouseDown={startDetailDrag} />
          <div style={{ height: detailHeight }} className="shrink-0 border-t border-line flex flex-col overflow-hidden bg-sunken">
          <div className="flex justify-between items-center px-2 py-1 border-b border-line-light bg-raised gap-1">
            <div className="flex gap-[3px] overflow-hidden flex-1">
              {detailConnections.map(({ key, item }) => {
                const isActive = activeDetailKey === key;
                return (
                  <div key={key} onClick={() => setActiveDetailKey(key)} className={cn(
                    'flex items-center gap-[5px] px-2.5 py-[3px] text-sm rounded-sm cursor-pointer font-mono select-none whitespace-nowrap border',
                    isActive ? 'border-accent bg-active text-primary' : 'border-line bg-sunken text-secondary',
                  )}>
                    <span>{item.listenIP || '*'}:{item.port || '-'}</span>
                    <span className="text-tertiary max-w-[100px] truncate">{item.name || '-'}</span>
                    <button type="button" onClick={(event) => { event.stopPropagation(); closeConnectionDetail(key); }} className="border-none bg-transparent text-tertiary cursor-pointer p-0 text-base leading-none">×</button>
                  </div>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setDetailConnections([]); setActiveDetailKey(null); }}>{t('关闭全部')}</Button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            <div className="text-tertiary text-sm mb-2">{activeDetailConnection?.item?.listenIP || '*'}:{activeDetailConnection?.item?.port || '-'} {t('连接明细')}</div>
            <div className="min-w-[640px]">
              <div style={{ gridTemplateColumns: 'minmax(180px,1.4fr) minmax(130px,1fr) 80px 90px 90px' }} className="grid gap-2.5 px-2.5 py-[7px] text-tertiary text-sm font-bold rounded-t-md border border-line-subtle border-b-0">
                <span>{t('位置')}</span>
                <span>IP</span>
                <span>{t('端口')}</span>
                <span>{t('上传')}</span>
                <span>{t('下载')}</span>
              </div>
              {Array.isArray(activeDetailConnection?.item?.peers) && activeDetailConnection.item.peers.length > 0 ? activeDetailConnection.item.peers.map((peer, peerIndex) => (
                <div key={`${activeDetailConnection.key}-peer-${peerIndex}`} style={{ gridTemplateColumns: 'minmax(180px,1.4fr) minmax(130px,1fr) 80px 90px 90px' }} className="grid gap-2.5 px-2.5 py-[7px] text-primary text-[12.5px] border border-line-subtle border-t-0">
                  <span className="text-tertiary truncate" title={formatLocation(peer.location)}>{formatLocation(peer.location)}</span>
                  <span className="font-mono">{peer.ip || '-'}</span>
                  <span className="font-mono text-accent">{peer.port || '-'}</span>
                  <span className="font-mono text-success">{formatOptionalTransfer(peer.upload)}</span>
                  <span className="font-mono text-accent">{formatOptionalTransfer(peer.download)}</span>
                </div>
              )) : (
                <div className="p-3 text-tertiary text-sm border border-line-subtle border-t-0">{t('暂无连接明细')}</div>
              )}
            </div>
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
