import { useState, useEffect, useCallback, useRef, useReducer, type MouseEvent as ReactMouseEvent } from 'react';
import * as AppGo from '../../wailsjs/go/wailsapp/App.js';
import { useTranslation } from '../i18n.ts';
import Tiptop from './Tiptop.tsx';
import { Button, ContextMenu, EmptyState } from './ui';
import type { MenuItem } from './ui';
import { cn } from '../utils/cn.ts';
import { Z } from '../constants/zIndex.ts';
import { ClipboardList, Search, RefreshCw, XCircle, X, ArrowUpDown, ArrowUp, ArrowDown, Copy } from 'lucide-react';

/** 进程条目（GetFullProcessList 返回的宽松结构） */
interface ProcessInfo {
  pid: string;
  cpu?: number;
  mem?: number;
  user?: string;
  name?: string;
  cmd?: string;
  loc?: string;
  stat?: string;
  nlwp?: number;
  etime?: string;
}

/** 右键菜单状态 */
interface ProcessContextMenu {
  x: number;
  y: number;
  process: ProcessInfo;
  hasEnv: boolean | null;
}

/** 详情面板 reducer 动作 */
type DetailAction =
  | { type: 'toggle'; process: ProcessInfo }
  | { type: 'close'; pid: string }
  | { type: 'closeAll' };

// ponytail: input is MB from Go backend (ps RSS KB → /1024 → MB)
const fmem = (mb: number | undefined) => {
  const v = Number(mb);
  if (v < 1) return (v * 1024).toFixed(0) + 'K';
  if (v < 1024) return v.toFixed(1) + 'M';
  return (v / 1024).toFixed(1) + 'G';
};

const sortFns: Record<string, (a: ProcessInfo, b: ProcessInfo) => number> = {
  pid: (a, b) => Number(a.pid) - Number(b.pid),
  cpu: (a, b) => (a.cpu || 0) - (b.cpu || 0),
  mem: (a, b) => (a.mem || 0) - (b.mem || 0),
  user: (a, b) => (a.user || '').localeCompare(b.user || ''),
  name: (a, b) => (a.name || '').localeCompare(b.name || ''),
};

export interface ProcessPageProps {
  sessionId: string;
  addToast: (message: string | Error, type?: string, duration?: number, actions?: unknown[]) => number;
  active: boolean;
}

export default function ProcessPage({ sessionId, addToast, active }: ProcessPageProps) {
  const { t } = useTranslation();
  const [processes, setProcesses] = useState<ProcessInfo[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('cpu');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set());
  const [killing, setKilling] = useState(false);
  const [contextMenu, setContextMenu] = useState<ProcessContextMenu | null>(null); // { x, y, process }
  const [detailState, detailDispatch] = useReducer((state: { processes: ProcessInfo[]; activePid: string | null }, action: DetailAction) => {
    switch (action.type) {
      case 'toggle': {
        const idx = state.processes.findIndex(p => p.pid === action.process.pid);
        if (idx >= 0) {
          if (state.activePid === action.process.pid) {
            const next = state.processes.filter(p => p.pid !== action.process.pid);
            const ni = next.length ? Math.min(idx, next.length - 1) : -1;
            return { processes: next, activePid: ni >= 0 ? next[ni].pid : null };
          }
          return { ...state, activePid: action.process.pid };
        }
        return { processes: [...state.processes, action.process], activePid: action.process.pid };
      }
      case 'close': {
        const next = state.processes.filter(p => p.pid !== action.pid);
        return {
          processes: next,
          activePid: state.activePid === action.pid
            ? (next.length ? next[Math.min(state.processes.findIndex(p => p.pid === action.pid), next.length - 1)].pid : null)
            : state.activePid,
        };
      }
      case 'closeAll': return { processes: [], activePid: null };
      default: return state;
    }
  }, { processes: [], activePid: null });
  const activeProcess = detailState.processes.find(p => p.pid === detailState.activePid) || null;
  const [detailHeight, setDetailHeight] = useState(() => {
    const saved = localStorage.getItem('processDetailHeight');
    return saved ? parseFloat(saved) : 200;
  });
  const [envVars, setEnvVars] = useState<string[] | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [showEnv, setShowEnv] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('processColWidths');
    if (saved) try { return JSON.parse(saved); } catch {}
    return { pid: 70, cpu: 70, mem: 70, user: 100, name: 200 };
  });
  const mountedRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const colDragging = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // ponytail: 可视区切片，避免数百进程全量渲染。行高固定 33px（6px*2 padding + ~21px 内容）
  // 上限约 300 行无虚拟化也无压力，超出靠此切片；O(n) 滚动计算在 60fps 内可接受
  const ROW_H = 33;
  const OVERSCAN = 5;
  const TABLE_MIN_WIDTH = 760;
  const tableColumns = `32px ${colWidths.pid}px ${colWidths.cpu}px ${colWidths.mem}px ${colWidths.user}px minmax(${colWidths.name}px, 1fr) minmax(180px, 28%)`;
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });

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
      const list = await AppGo.GetFullProcessList(sessionId);
      if (mountedRef.current) {
        setProcesses((list || []) as ProcessInfo[]);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : String(e));
        setProcesses([]);
      }
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
  }, [load, active]);

  // 选中进程时加载环境变量
  useEffect(() => {
    if (!activeProcess) {
      setEnvVars(null);
      setShowEnv(false);
      return;
    }
    setEnvLoading(true);
    setEnvVars(null);
    setShowEnv(false);
    AppGo.GetProcessEnv(sessionId, activeProcess.pid)
      .then(vars => { if (mountedRef.current) { setEnvVars(vars || []); setEnvLoading(false); } })
      .catch(() => { if (mountedRef.current) { setEnvVars([]); setEnvLoading(false); } });
  }, [activeProcess, sessionId]);

  const sorted = !processes ? [] : [...processes].sort((a, b) => {
    const fn = sortFns[sortKey] || sortFns.cpu;
    return sortAsc ? fn(a, b) : fn(b, a);
  });

  const filtered = searchQuery
    ? sorted.filter(p =>
        String(p.pid).includes(searchQuery) ||
        (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.user || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.cmd || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sorted;

  const handleSort = (key: string) => {
    if (key === sortKey) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  // ponytail: 改为函数调用而非组件定义，避免每次 polling 渲染时 React 视为新组件类型导致表头 unmount/remount
  const renderSortIcon = (col: string) => {
    if (col !== sortKey) return <ArrowUpDown size={13} className="opacity-70 ml-0.5 shrink-0" />;
    return sortAsc
      ? <ArrowUp size={13} className="ml-0.5 shrink-0 text-accent" />
      : <ArrowDown size={13} className="ml-0.5 shrink-0 text-accent" />;
  };

  const toggleSelect = (pid: string) => {
    setSelectedPids(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedPids.size === filtered.length) {
      setSelectedPids(new Set());
    } else {
      setSelectedPids(new Set(filtered.map(p => p.pid)));
    }
  };

  const confirmKill = async (count: number) => {
    if (localStorage.getItem('skipProcessKillConfirm') === 'true') return true;
    const result = await window.luminDialog?.confirm(
      t('确定要终止选中的 ') + count + t(' 个进程吗？'),
      t('操作确认'),
      t('不再询问'),
    );
    // 带复选框的 confirm 恒返回 { confirmed, checked }；此处防御性处理 boolean 分支
    if (!result || typeof result !== 'object' || !result.confirmed) return false;
    if (result.checked) localStorage.setItem('skipProcessKillConfirm', 'true');
    return true;
  };

  const killSelected = async () => {
    if (selectedPids.size === 0) return;
    if (!await confirmKill(selectedPids.size)) return;

    setKilling(true);
    let killed = 0;
    for (const pid of selectedPids) {
      try {
        await AppGo.KillProcess(sessionId, pid);
        killed++;
      } catch (_) {}
    }
    setKilling(false);
    if (killed > 0) {
      addToast?.(t('已终止 ') + killed + t(' 个进程'), 'success');
      setSelectedPids(new Set());
      load();
    } else {
      addToast?.(t('无法终止进程，请检查权限'), 'error');
    }
  };

  const killOne = async (p: ProcessInfo | undefined) => {
    if (!p) return;
    if (!await confirmKill(1)) return;
    setKilling(true);
    try {
      await AppGo.KillProcess(sessionId, p.pid);
      addToast?.(t('已终止 ') + 1 + t(' 个进程'), 'success');
      setSelectedPids(prev => {
        if (!prev.has(p.pid)) return prev;
        const next = new Set(prev);
        next.delete(p.pid);
        return next;
      });
      load();
    } catch (_) {
      addToast?.(t('无法终止进程，请检查权限'), 'error');
    } finally {
      setKilling(false);
    }
  };

  const copyText = (text: string | undefined, okMsg: string) => {
    const value = String(text || '');
    if (!value) {
      addToast?.(t('复制失败'), 'error');
      return;
    }
    navigator.clipboard?.writeText(value).then(() => {
      addToast?.(okMsg || `${t('已复制')}: ${value}`, 'success');
    }).catch(() => {
      addToast?.(t('复制失败'), 'error');
    });
  };

  const copyEnv = async (p: ProcessInfo) => {
    if (!p) return;
    try {
      const vars = await AppGo.GetProcessEnv(sessionId, p.pid);
      if (!vars?.length) {
        addToast?.(t('无环境变量'), 'error');
        return;
      }
      await navigator.clipboard.writeText(vars.join('\n'));
      addToast?.(`${t('已复制')}: ${t('环境变量')} (${vars.length})`, 'success');
    } catch (_) {
      addToast?.(t('复制失败'), 'error');
    }
  };

  const handleRowClick = (p: ProcessInfo) => {
    detailDispatch({ type: 'toggle', process: p });
    setSelectedPids(new Set());
  };

  const handleRowContextMenu = (e: ReactMouseEvent, p: ProcessInfo) => {
    e.preventDefault();
    e.stopPropagation();
    // 复用详情面板已加载的环境变量；未知时异步探测，无则不展示菜单项
    const known = (activeProcess?.pid === p.pid && envVars !== null)
      ? envVars.length > 0
      : null;
    setContextMenu({ x: e.clientX, y: e.clientY, process: p, hasEnv: known });
    if (known !== null) return;
    const pid = p.pid;
    AppGo.GetProcessEnv(sessionId, pid)
      .then((vars) => {
        if (!mountedRef.current) return;
        setContextMenu((prev) => {
          if (!prev || prev.process?.pid !== pid) return prev;
          return { ...prev, hasEnv: Array.isArray(vars) && vars.length > 0 };
        });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setContextMenu((prev) => {
          if (!prev || prev.process?.pid !== pid) return prev;
          return { ...prev, hasEnv: false };
        });
      });
  };

  const startDetailDrag = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = detailHeight;
    const onMove = (ev: MouseEvent) => {
      const dh = Math.max(100, Math.min(600, startH - (ev.clientY - startY)));
      setDetailHeight(dh);
      localStorage.setItem('processDetailHeight', String(dh));
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

  const startColResize = useCallback((colKey: string, e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colKey];
    colDragging.current = false;
    const onMove = (ev: MouseEvent) => {
      colDragging.current = true;
      const w = Math.max(40, Math.min(500, startW + (ev.clientX - startX)));
      const next = { ...colWidths, [colKey]: w };
      setColWidths(next);
      localStorage.setItem('processColWidths', JSON.stringify(next));
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
  }, [colWidths]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - OVERSCAN);
    const end = Math.min(filtered.length, start + Math.ceil(el.clientHeight / ROW_H) + OVERSCAN * 2);
    setVisibleRange(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [filtered.length]);

  // 排序/搜索变化时回到顶部，避免可视区错位
  useEffect(() => {
    setVisibleRange({ start: 0, end: 50 });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sortKey, sortAsc, searchQuery]);

  return (
    <div className="data-page">
      {/* 标题行 */}
      <div className="data-page-header">
        <h3 className="data-page-title">
          <ClipboardList size={16} /> {t('进程管理')}
        </h3>
        <div className="flex gap-1.5">
          {selectedPids.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={killSelected}
              disabled={killing}
            >
              <XCircle size={12} />
              {t('终止选中')} ({selectedPids.size})
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            {t('刷新')}
          </Button>
        </div>
      </div>

      {/* 搜索 */}
      <div className="data-toolbar">
        <input
          className="input"
          type="search"
          autoComplete="off"
          name="processSearch"
          aria-label={t('搜索 PID / 进程名 / 用户...')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('搜索 PID / 进程名 / 用户...')}
        />
        <span className="data-count">
          {processes ? `${filtered.length} / ${processes.length}` : '—'}
        </span>
      </div>

      {/* 表格区域 */}
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {loading && !processes ? (
          <EmptyState
            className="mt-[10vh]"
            icon={<span className="text-[32px]">⟳</span>}
            text={<span className="text-md text-secondary">{t('正在加载进程列表...')}</span>}
          />
        ) : error ? (
          <EmptyState
            className="mt-[10vh]"
            icon={<span className="text-[32px]">✕</span>}
            text={<span className="text-md text-danger">{t('加载失败')}</span>}
            action={
              <>
                <span className="max-w-[400px] text-sm text-tertiary">{error}</span>
                <Button variant="secondary" size="sm" onClick={load} className="mt-1">{t('重试')}</Button>
              </>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            className="mt-[10vh]"
            icon={<Search size={48} />}
            text={<span className="text-lg font-medium text-secondary">
              {searchQuery ? t('未找到匹配的进程') : t('没有可显示的进程')}
            </span>}
          />
        ) : (
          <div className="data-table-shell" style={{ minWidth: TABLE_MIN_WIDTH }}>
            {/* 表头 */}
            <div
              className="grid bg-sunken border-b border-line text-sm font-bold text-tertiary select-none"
              style={{ gridTemplateColumns: tableColumns }}
            >
              <div className="px-1.5 py-2 flex items-center justify-center">
                <input type="checkbox"
                  id="process-select-all"
                  name="process-select-all"
                  autoComplete="off"
                  checked={selectedPids.size === filtered.length && filtered.length > 0}
                  onChange={selectAll} className="cursor-pointer" />
              </div>
              {([
                { key: 'pid', label: 'PID', align: 'right' },
                { key: 'cpu', label: 'CPU%', align: 'right' },
                { key: 'mem', label: t('内存'), align: 'right' },
                { key: 'user', label: t('用户'), align: 'left' },
                { key: 'name', label: t('名称/命令行'), align: 'left' },
                { key: 'loc', label: t('位置'), align: 'left' },
              ] as Array<{ key: string; label: string; align: 'right' | 'left' }>).map(({ key, label, align }) => (
                <div key={key} className={cn(
                  'relative px-1.5 py-2 flex items-center gap-0.5 cursor-pointer min-w-0',
                  key !== 'loc' && 'border-r border-line-light',
                  align === 'right' ? 'justify-end' : 'justify-start',
                  sortKey === key && 'bg-active text-primary',
                )} onClick={(e) => { if (colDragging.current) { colDragging.current = false; return; } key && handleSort(key); }}>
                  {label} {key && renderSortIcon(key)}
                  {key !== 'loc' && (
                  <div onMouseDown={e => { e.stopPropagation(); startColResize(key, e); }}
                    className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize" style={{ zIndex: Z.STACK }} />
                  )}
                </div>
              ))}
            </div>
            {/* 行 */}
            <div>
              <div style={{ height: visibleRange.start * ROW_H }} />
              {filtered.slice(visibleRange.start, visibleRange.end).map((p) => (
                <div key={p.pid}
                  onContextMenu={(e) => handleRowContextMenu(e, p)}
                  style={{ gridTemplateColumns: tableColumns }}
                  className={cn(
                  'grid gap-0 border-b border-line-light text-[12.5px] font-mono text-primary cursor-pointer',
                  selectedPids.has(p.pid) || contextMenu?.process?.pid === p.pid || detailState.activePid === p.pid
                    ? 'bg-active'
                    : 'bg-transparent',
                )}>
                  <div className="px-1.5 py-1.5 flex items-center justify-center border-r border-line-light" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      id={`process-select-row-${p.pid}`}
                      name="process-select-row"
                      autoComplete="off"
                      checked={selectedPids.has(p.pid)}
                      onChange={() => toggleSelect(p.pid)} className="cursor-pointer" />
                  </div>
                  <div className="px-1.5 py-1.5 text-right text-tertiary text-[11.5px] border-r border-line-light" onClick={() => handleRowClick(p)}>{p.pid}</div>
                  <div className="px-1.5 py-1.5 text-right border-r border-line-light" style={{ color: (p.cpu || 0) > 50 ? 'var(--danger)' : (p.cpu || 0) > 10 ? 'var(--warning)' : 'var(--text-primary)' }} onClick={() => handleRowClick(p)}>
                    {p.cpu?.toFixed(1)}%
                  </div>
                  <div className="px-1.5 py-1.5 text-right text-primary border-r border-line-light" onClick={() => handleRowClick(p)}>{fmem(p.mem)}</div>
                  <div className="px-1.5 py-1.5 text-left text-tertiary text-[11.5px] truncate border-r border-line-light" title={p.user} onClick={() => handleRowClick(p)}>{p.user}</div>
                  <div className="px-1.5 py-1.5 text-left truncate border-r border-line-light" title={`${p.name} ┊ ${p.cmd}`} onClick={() => handleRowClick(p)}>
                    <span className="text-primary">{p.name}</span>
                    <span className="text-muted mx-0.5">┊</span>
                    <span className="text-secondary">{(p.cmd || p.name)}</span>
                  </div>
                  <div className="px-1.5 py-1.5 text-left text-tertiary text-[11.5px] truncate" title={p.loc} onClick={() => handleRowClick(p)}>{p.loc}</div>
                </div>
              ))}
              <div style={{ height: Math.max(0, (filtered.length - visibleRange.end) * ROW_H) }} />
            </div>
          </div>
        )}
      </div>

      {/* 进程行右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          minWidth={170}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: t('终止'),
              icon: <XCircle size={14} />,
              danger: true,
              onSelect: () => {
                const p = contextMenu.process;
                void killOne(p);
              },
            },
            'separator',
            {
              label: t('复制名称'),
              icon: <Copy size={14} />,
              onSelect: () => {
                const p = contextMenu.process;
                copyText(p?.name, `${t('已复制')}: ${p?.name || ''}`);
              },
            },
            {
              label: t('复制命令行'),
              icon: <Copy size={14} />,
              onSelect: () => {
                const p = contextMenu.process;
                copyText(p?.cmd || p?.name, t('命令已复制到剪贴板'));
              },
            },
            ...(contextMenu.hasEnv ? [{
              label: t('复制环境变量'),
              icon: <Copy size={14} />,
              onSelect: () => {
                const p = contextMenu.process;
                void copyEnv(p);
              },
            }] : []),
          ] as MenuItem[]}
        />
      )}

      {/* 进程详情面板 */}
      {detailState.processes.length > 0 && (
        <>
          <div
            className="split-resizer-h hotzone-bottom"
            onMouseDown={startDetailDrag}
          />
          <div ref={detailRef} style={{ height: detailHeight }} className="shrink-0 border-t border-line flex flex-col overflow-hidden bg-sunken">
            {/* 标签栏 */}
            <div className="flex justify-between items-center px-2 py-1 border-b border-line-light bg-raised gap-1">
              <div className="flex gap-[3px] overflow-hidden flex-1">
                {detailState.processes.map(p => {
                  const isActive = detailState.activePid === p.pid;
                  return (
                    <div key={p.pid}
                      onClick={() => detailDispatch({ type: 'toggle', process: p })}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-[3px] text-sm rounded-sm cursor-pointer font-mono select-none whitespace-nowrap border transition-all duration-150',
                        isActive
                          ? 'border-accent bg-active text-primary font-medium'
                          : 'border-line bg-sunken text-secondary hover:border-focus hover:bg-hover hover:text-primary',
                      )}
                    >
                      <span>{p.pid}</span>
                      <span className={cn(
                        'max-w-[100px] truncate',
                        isActive ? 'text-primary' : 'text-tertiary',
                      )}>{p.name}</span>
                      <Tiptop text={t('关闭')} placement="bottom">
                        <span
                          onClick={e => { e.stopPropagation(); detailDispatch({ type: 'close', pid: p.pid }); }}
                          aria-label={t('关闭')}
                          className="ml-0.5 opacity-40 cursor-pointer text-base leading-none"
                        >×</span>
                      </Tiptop>
                    </div>
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" onClick={() => detailDispatch({ type: 'closeAll' })}
                className="p-0.5 text-tertiary shrink-0">
                <X size={14} />
              </Button>
            </div>
            {/* 面板内容 */}
            <div className="p-3 overflow-auto flex-1" key={activeProcess?.pid}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-base">
                <DetailRow label="PID" value={<span className="font-mono">{activeProcess?.pid}</span>} />
                <DetailRow label={t('状态')} value={activeProcess?.stat || '-'} />
                <DetailRow label={t('进程名')} value={activeProcess?.name} />
                <DetailRow label={t('线程数')} value={activeProcess?.nlwp != null ? String(activeProcess.nlwp) : '-'} />
                <DetailRow label="CPU" value={<><span style={{ color: (activeProcess?.cpu || 0) > 50 ? 'var(--danger)' : (activeProcess?.cpu || 0) > 10 ? 'var(--warning)' : 'inherit' }}>{activeProcess?.cpu?.toFixed(1)}%</span></>} />
                <DetailRow label={t('运行时间')} value={activeProcess?.etime || '-'} />
                <DetailRow label={t('内存')} value={fmem(activeProcess?.mem)} />
                <DetailRow label={t('用户')} value={activeProcess?.user} />
              </div>
              {activeProcess?.loc && <div className="mt-1.5"><DetailRow label={t('位置')} value={activeProcess.loc} /></div>}
              <div className="mt-3">
                <div className="text-sm text-tertiary mb-1">{t('完整命令行')}:</div>
                <div className="text-[12.5px] font-mono text-primary bg-canvas px-2.5 py-2 rounded-md break-all border border-line-light">
                  {activeProcess?.cmd || activeProcess?.name}
                </div>
              </div>

              {/* 环境变量 */}
              {envLoading ? (
                <div className="mt-3 text-sm text-tertiary">
                  {t('加载环境变量...')}
                </div>
              ) : envVars && envVars.length > 0 ? (
                <div className="mt-3">
                  <div
                    className="text-sm text-tertiary mb-1 cursor-pointer select-none flex items-center gap-1"
                    onClick={() => setShowEnv(v => !v)}
                  >
                    <span className="inline-block transition-transform duration-150" style={{ transform: showEnv ? 'rotate(90deg)' : 'none' }}>▶</span>
                    {t('环境变量')} <span className="text-muted text-xs">({envVars.length})</span>
                  </div>
                  {showEnv && (
                    <div className="text-sm font-mono text-primary bg-canvas px-2.5 py-2 rounded-md border border-line-light max-h-[180px] overflow-auto leading-[1.6] whitespace-pre-wrap break-all">
                      {envVars.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : envVars && envVars.length === 0 ? (
                <div className="mt-3 text-sm text-tertiary">
                  {t('无环境变量')}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

const DetailRow = ({ label, value }: DetailRowProps) => (
  <div className="flex gap-2 items-center py-[3px]">
    <span className="text-tertiary min-w-[60px] shrink-0 text-sm">{label}</span>
    <span className="text-primary font-medium">{value}</span>
  </div>
);
