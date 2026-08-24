import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '../i18n.ts';
import { Monitor, Pencil, Link, Trash2, X, SquarePen, Folder, FolderOpen, ChevronUp, ChevronDown, Copy, Trash, ChevronLeft, ChevronRight, Download, PenLine } from 'lucide-react';
import { clampMenuPosition } from '../utils/menuPosition.ts';
import Tiptop from './Tiptop.tsx';
import { Button, ContextMenu, MenuList, MenuPanel } from './ui';
import type { MenuItem } from './ui';
import { Z } from '../constants/zIndex.ts';
import { cn } from '../utils/cn.ts';
import type { config } from '../../wailsjs/go/models.ts';
import type { ServerPingResult } from '../hooks/useServerPing.ts';
import type { ServerListViewMode } from '../hooks/useDashboardPreferences.ts';

const MENU_ESTIMATED_WIDTH = 196;
const MENU_ESTIMATED_HEIGHT = 160;

const LATENCY_CLASS = (ms: number | null) => {
  if (ms === null || ms === undefined) return 'offline';
  if (ms < 0) return 'good';     // -1 = <1ms (proxy/local)
  if (ms <= 300) return 'good';  // 0-300ms 绿色
  if (ms <= 400) return 'warn';  // 301-400ms 黄色
  return 'bad';                  // >400ms 红色
};

const osIcon = (src: string, alt: string) => <img src={src} width="22" height="22" alt={alt} />;
const UbuntuIcon     = () => osIcon('/ubuntu.svg', 'Ubuntu');
const DebianIcon     = () => osIcon('/debian.svg', 'Debian');
const CentosIcon     = () => osIcon('/centos.svg', 'CentOS');
const WinIcon        = () => osIcon('/windows.svg', 'Windows');
const AppleIcon      = () => osIcon('/macos.svg', 'macOS');
const LinuxIcon      = () => osIcon('/linux.svg', 'Linux');
const KaliIcon       = () => osIcon('/kali.svg', 'Kali');
const AlmaIcon       = () => osIcon('/almalinux.svg', 'AlmaLinux');
const RockyIcon      = () => osIcon('/rocky.svg', 'Rocky');
const OracleIcon     = () => osIcon('/oracle.svg', 'Oracle');
const AnolisIcon     = () => osIcon('/Anolis.png', 'Anolis');
const OpenCloudIcon  = () => osIcon('/OpenCloudOS.png', 'OpenCloudOS');
const OpenEulerIcon  = () => osIcon('/openEuler.svg', 'openEuler');
const OpenSuseIcon   = () => osIcon('/openSUSE.svg', 'openSUSE');
const NixosIcon      = () => osIcon('/nixos.svg', 'NixOS');
const GentooIcon     = () => osIcon('/gentoo.svg', 'Gentoo');
const AoscIcon       = () => osIcon('/aosc.svg', 'AOSC');
const RhelIcon       = () => osIcon('/rhel.svg', 'RHEL');
const FedoraIcon     = () => osIcon('/fedora.svg', 'Fedora');
const ArchIcon       = () => osIcon('/arch.svg', 'Arch');
const AlpineIcon     = () => osIcon('/alpine.svg', 'Alpine');
const FreeBSDIcon    = () => osIcon('/freebsd.svg', 'FreeBSD');
const TencentIcon    = () => osIcon('/TencentOS.svg', 'TencentOS');
const AlibabaIcon    = () => osIcon('/Alibaba.svg', 'Alibaba');

interface OSInfoResult {
  icon: React.ReactNode;
  bg: string;
  accent: string;
  accentRgb?: string;
  label: string;
}

// 检测OS，支持静态名称匹配和动态 osInfo 对象
// 使用模块级缓存避免每次渲染都创建新 JSX 元素（性能优化）
const _osInfoCache = new Map<string, OSInfoResult>();
const getOSInfo = (name = '', os = '', osInfo: Record<string, unknown> | null = null): OSInfoResult => {
  // 优先用连接后实际查询到的系统信息
  const dynStr = String(osInfo?.os || osInfo?.platform || '').toLowerCase();
  const n = dynStr || (name + ' ' + (os || '')).toLowerCase();
  // 缓存键：仅依赖输入字符串，JSX 元素可安全复用
  if (_osInfoCache.has(n)) return _osInfoCache.get(n) as OSInfoResult;
  let result: OSInfoResult;
  // ── 发行版检测（按优先级排列）──
  const distroBg = 'var(--surface-overlay)';
  const distroAccent = 'var(--text-secondary)';
  if (n.includes('ubuntu'))       result = { icon: <UbuntuIcon />, bg: distroBg, accent: distroAccent, label: 'Ubuntu' };
  else if (n.includes('debian'))       result = { icon: <DebianIcon />, bg: distroBg, accent: distroAccent, label: 'Debian' };
  else if (n.includes('kali'))         result = { icon: <KaliIcon />, bg: distroBg, accent: distroAccent, label: 'Kali' };
  else if (n.includes('centos stream'))result = { icon: <CentosIcon />, bg: distroBg, accent: distroAccent, label: 'CentOS Stream' };
  else if (n.includes('tencent'))     result = { icon: <TencentIcon />, bg: distroBg, accent: distroAccent, label: 'TencentOS' };
  else if (n.includes('centos'))       result = { icon: <CentosIcon />, bg: distroBg, accent: distroAccent, label: 'CentOS' };
  else if (n.includes('rhel'))         result = { icon: <RhelIcon />, bg: distroBg, accent: distroAccent, label: 'RHEL' };
  else if (n.includes('almalinux'))    result = { icon: <AlmaIcon />, bg: distroBg, accent: distroAccent, label: 'AlmaLinux' };
  else if (n.includes('rocky'))        result = { icon: <RockyIcon />, bg: distroBg, accent: distroAccent, label: 'Rocky' };
  else if (n.includes('oracle'))       result = { icon: <OracleIcon />, bg: distroBg, accent: distroAccent, label: 'Oracle' };
  else if (n.includes('alibaba') || n.includes('aliyun')) result = { icon: <AlibabaIcon />, bg: distroBg, accent: distroAccent, label: 'Alibaba' };
  else if (n.includes('anolis'))       result = { icon: <AnolisIcon />, bg: distroBg, accent: distroAccent, label: 'Anolis' };
  else if (n.includes('opencloudos'))  result = { icon: <OpenCloudIcon />, bg: distroBg, accent: distroAccent, label: 'OpenCloudOS' };
  else if (n.includes('openeuler'))    result = { icon: <OpenEulerIcon />, bg: distroBg, accent: distroAccent, label: 'openEuler' };
  else if (n.includes('fedora'))       result = { icon: <FedoraIcon />, bg: distroBg, accent: distroAccent, label: 'Fedora' };
  else if (n.includes('opensuse'))     result = { icon: <OpenSuseIcon />, bg: distroBg, accent: distroAccent, label: 'openSUSE' };
  else if (n.includes('arch'))         result = { icon: <ArchIcon />, bg: distroBg, accent: distroAccent, label: 'Arch' };
  else if (n.includes('nixos'))        result = { icon: <NixosIcon />, bg: distroBg, accent: distroAccent, label: 'NixOS' };
  else if (n.includes('alpine'))       result = { icon: <AlpineIcon />, bg: distroBg, accent: distroAccent, label: 'Alpine' };
  else if (n.includes('gentoo'))       result = { icon: <GentooIcon />, bg: distroBg, accent: distroAccent, label: 'Gentoo' };
  else if (n.includes('aosc'))         result = { icon: <AoscIcon />, bg: distroBg, accent: distroAccent, label: 'AOSC' };
  else if (n.includes('freebsd'))      result = { icon: <FreeBSDIcon />, bg: distroBg, accent: distroAccent, label: 'FreeBSD' };
  // ── 非 Linux 系统 ──
  else if (n.includes('windows'))      result = { icon: <WinIcon />, bg: distroBg, accent: distroAccent, label: 'Windows' };
  else if (n.includes('mac') || n.includes('darwin')) result = { icon: <AppleIcon />, bg: distroBg, accent: distroAccent, label: 'macOS' };
  // ── 环境关键词（基于服务器名称）──
  else if (n.includes('prod') || n.includes('生产'))  result = { icon: <LinuxIcon />, bg: 'rgba(var(--success-rgb),0.15)', accent: 'var(--success)', accentRgb: 'var(--success-rgb)', label: 'Prod' };
  else if (n.includes('dev') || n.includes('开发'))   result = { icon: <LinuxIcon />, bg: 'rgba(var(--info-rgb),0.15)', accent: 'var(--info)', accentRgb: 'var(--info-rgb)', label: 'Dev' };
  else if (n.includes('test') || n.includes('测试'))  result = { icon: <LinuxIcon />, bg: 'rgba(var(--danger-rgb),0.15)', accent: 'var(--danger)', accentRgb: 'var(--danger-rgb)', label: 'Test' };
  else if (n.includes('db') || n.includes('数据'))    result = { icon: <LinuxIcon />, bg: 'rgba(var(--warning-rgb),0.15)', accent: 'var(--warning)', accentRgb: 'var(--warning-rgb)', label: 'DB' };
  else if (n.includes('web') || n.includes('nginx'))  result = { icon: <LinuxIcon />, bg: 'rgba(var(--accent-rgb),0.15)', accent: 'var(--accent)', accentRgb: 'var(--accent-rgb)', label: 'Web' };
  else result = { icon: <LinuxIcon />, bg: 'var(--surface-sunken)', accent: 'var(--text-secondary)', accentRgb: '128,128,128', label: 'Linux' };
  _osInfoCache.set(n, result);
  return result;
};

export interface ServerListProps {
  servers: config.Connection[];
  pingEnabled: boolean;
  pings: Record<string, ServerPingResult>;
  sessions: Array<{ id?: string; serverId?: string; status?: string; osInfo?: unknown; [key: string]: unknown }>;
  activeSessionId: string | null;
  viewMode?: ServerListViewMode;
  hideSensitive?: boolean;
  onConnect: (server: config.Connection) => void;
  onEdit: (server: config.Connection, payload: unknown) => void;
  onClone: (server: config.Connection, payload: unknown) => void;
  onDelete: (id: string) => void;
  onMoveGroup?: (id: string, group: string) => void;
  addToast: (message: string | Error, type?: string, duration?: number, actions?: unknown[]) => number;
  saveFlowHighlights?: { serverId: string | null; rowPulse: unknown; fields: Record<string, unknown> };
  selectionMode?: boolean;
  selectedIds?: string[];
  onSelectChange: (payload: string | string[] | Array<{ id: string; selected: boolean }>) => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchConnect?: (ids: string[]) => void;
  onBatchMoveGroup?: (ids: string[], group: string) => void;
  onGroupDelete?: (groupName: string, ids: string[]) => void;
  onRenameGroup?: (oldName: string) => string | null | Promise<string | null>;
  onBatchExport?: (ids: string[]) => void;
  onExitSelectionMode?: () => void;
  collapsedGroups: Set<string>;
  onCollapsedGroupsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/** 扁平列表条目（分组 header 或服务器卡片） */
type FlatItem =
  | { type: 'header'; groupName: string; count: number; collapsed: boolean }
  | { type: 'server'; server: config.Connection };

export default function ServerList({
  servers,
  pingEnabled,
  pings,
  sessions,
  activeSessionId,
  viewMode = 'grid',
  hideSensitive = false,
  onConnect,
  onEdit,
  onClone,
  onDelete,
  onMoveGroup,
  addToast,
  saveFlowHighlights = { serverId: null, rowPulse: null, fields: {} },
  selectionMode = false,
  selectedIds = [],
  onSelectChange,
  onBatchDelete,
  onBatchConnect,
  onBatchMoveGroup,
  onGroupDelete,
  onRenameGroup,
  onBatchExport,
  onExitSelectionMode,
  collapsedGroups: controlledCollapsedGroups,
  onCollapsedGroupsChange,
}: ServerListProps) {
  const { t } = useTranslation();
  const [menuServer, setMenuServer] = useState<config.Connection | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [groupHeaderMenu, setGroupHeaderMenu] = useState<{ groupName: string; x: number; y: number } | null>(null); // { groupName, x, y }
  const [groupMenu, setGroupMenu] = useState(false);
  const [localCollapsedGroups, setLocalCollapsedGroups] = useState<Set<string>>(new Set());
  const collapsedGroups = controlledCollapsedGroups ?? localCollapsedGroups;
  const setCollapsedGroups: React.Dispatch<React.SetStateAction<Set<string>>> = onCollapsedGroupsChange ?? setLocalCollapsedGroups;
  const [groupOrder, setGroupOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('serverGroupOrder') || '[]') as string[]; } catch { return []; }
  });
  const menuSourceRef = useRef<HTMLElement | null>(null);
  // 「移动到分组」子菜单切换时跳过 MenuList 的自动 onClose，保持主菜单打开
  const submenuToggleRef = useRef(false);
  const lastClickedIndex = useRef(-1); // 记录上次点击的扁平索引，用于 Shift 批量选择
  const [showMoveGroupDropdown, setShowMoveGroupDropdown] = useState(false);
  const moveGroupMenuRef = useRef<HTMLDivElement | null>(null);

  const closeServerMenu = () => {
    setMenuServer(null);
    setGroupMenu(false);
  };

  // 用指针位移区分「点击连接」与「拖选复制」：
  // - 几乎没移动 → 视为点击，连接时清掉浏览器误选
  // - 明显滑动 → 视为选中文字，不触发连接
  const pointerGestureRef = useRef({ x: 0, y: 0, moved: false, active: false });
  const DRAG_SELECT_THRESHOLD_PX = 5;

  const clearTextSelection = () => {
    try { window.getSelection?.()?.removeAllRanges?.(); } catch {}
  };

  const hasMeaningfulTextSelection = () => {
    try {
      const sel = window.getSelection?.();
      return !!(sel && String(sel.toString() || '').trim());
    } catch {
      return false;
    }
  };

  const markPointerDown = (e: React.PointerEvent) => {
    if (e.button != null && e.button !== 0) return;
    pointerGestureRef.current = {
      x: e.clientX,
      y: e.clientY,
      moved: false,
      active: true,
    };
  };

  const markPointerMove = (e: React.PointerEvent) => {
    const g = pointerGestureRef.current;
    if (!g.active || g.moved) return;
    const dx = Math.abs(e.clientX - g.x);
    const dy = Math.abs(e.clientY - g.y);
    if (dx > DRAG_SELECT_THRESHOLD_PX || dy > DRAG_SELECT_THRESHOLD_PX) {
      g.moved = true;
    }
  };

  const markPointerUp = () => {
    // 保留 moved 供紧随其后的 click 读取
    pointerGestureRef.current.active = false;
  };

  const wasDragSelect = () => pointerGestureRef.current.moved;

  const tryConnect = (server: config.Connection) => {
    if (!server || typeof onConnect !== 'function') return;
    // 拖选过：只保留文字选中，不连接
    if (wasDragSelect()) return;
    // 当前有选区（例如上次拖选残留）：不连接
    if (hasMeaningfulTextSelection()) return;
    // 点击连接：清掉浏览器默认误选高亮
    clearTextSelection();
    onConnect(server);
  };

  const pointerSelectHandlers = {
    onPointerDown: markPointerDown,
    onPointerMove: markPointerMove,
    onPointerUp: markPointerUp,
    onPointerCancel: markPointerUp,
  };

  // 预计算已连接会话的 Map，将 O(n×m) 查找优化为 O(1)
  const connectedSessionMap = useMemo(() => {
    const m = new Map<string, (typeof sessions)[number]>();
    sessions.forEach(s => {
      if (s.status === 'connected') m.set(s.serverId || '', s);
    });
    return m;
  }, [sessions]);

  const mask = (text: string) => hideSensitive ? String(text || '').replace(/[^@.:\/\s-]/g, '*') : text;

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showMoveGroupDropdown && moveGroupMenuRef.current && !moveGroupMenuRef.current.contains(e.target as Node)) {
        setShowMoveGroupDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoveGroupDropdown]);

  const getEditAnimationPayload = (server: config.Connection, sourceRoot: HTMLElement | null) => {
    const root = sourceRoot || null;
    const sourceRect = root?.getBoundingClientRect?.();
    const getRect = (field: string) => {
      const el = root?.querySelector?.(`[data-edit-source-field="${field}"]`);
      const rect = el?.getBoundingClientRect?.() || sourceRect;
      if (!rect) return null;
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    };
    const port = String(server.port || 22);
    return {
      sourceRects: {
        name: getRect('name'),
        host: getRect('host') || getRect('hostPort'),
        port: getRect('port') || getRect('hostPort'),
        username: getRect('username') || getRect('hostPort'),
        terminalInitPath: sourceRect ? {
          left: sourceRect.left,
          top: sourceRect.top,
          width: sourceRect.width,
          height: sourceRect.height,
        } : null,
        fileManagerInitPath: sourceRect ? {
          left: sourceRect.left,
          top: sourceRect.top,
          width: sourceRect.width,
          height: sourceRect.height,
        } : null,
      },
      labels: {
        name: server.name || server.host || '',
        host: hideSensitive ? mask(server.host) : server.host,
        port: hideSensitive ? mask(port) : port,
        username: hideSensitive ? mask(server.username) : server.username,
        terminalInitPath: server.terminalInitPath || '',
        fileManagerInitPath: server.fileManagerInitPath || '',
      },
    };
  };

  const triggerEdit = (server: config.Connection, sourceRoot: HTMLElement | null) => {
    onEdit(server, getEditAnimationPayload(server, sourceRoot));
  };

  const handleContextMenu = (e: React.MouseEvent, server: config.Connection) => {
    e.preventDefault();
    e.stopPropagation();
    menuSourceRef.current = e.currentTarget as HTMLElement;
    setMenuServer(server);
    setMenuPos(clampMenuPosition(e.clientX, e.clientY, MENU_ESTIMATED_WIDTH, MENU_ESTIMATED_HEIGHT));
  };

  const isActive = (server: config.Connection) => {
    const session = sessions.find(
      (s) => s.serverId === server.id && s.status !== 'closed'
    );
    return session && session.id === activeSessionId;
  };

  const hasSession = (server: config.Connection) =>
    sessions.some((s) => s.serverId === server.id && s.status !== 'closed');

  const getSaveFlowTokens = (server: config.Connection) => {
    if (saveFlowHighlights?.serverId !== server.id) {
      return { rowToken: null, nameToken: null, hostToken: null, usernameToken: null };
    }
    const fields = saveFlowHighlights.fields || {};
    return {
      rowToken: saveFlowHighlights.rowPulse || null,
      nameToken: fields.name || null,
      hostToken: fields.host || fields.port || fields.username || null,
      usernameToken: fields.username || null,
    };
  };

  // ── 批量选择逻辑 ──
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allGroupServerIds = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const s of servers) {
      const g = s.group || '';
      (m[g] = m[g] || []).push(s.id);
    }
    return m;
  }, [servers]);

  const flatItemsRef = useRef<FlatItem[] | null>(null);

  const handleServerClick = useCallback((server: config.Connection, flatIdx: number) => {
    if (!selectionMode) return;
    onSelectChange(server.id);
    lastClickedIndex.current = flatIdx;
  }, [selectionMode, onSelectChange]);

  const handleShiftClick = useCallback((server: config.Connection, flatIdx: number) => {
    if (!selectionMode || lastClickedIndex.current < 0 || !flatItemsRef.current) return;
    const flatItems = flatItemsRef.current;
    const start = Math.min(lastClickedIndex.current, flatIdx);
    const end = Math.max(lastClickedIndex.current, flatIdx);
    const serverIds: string[] = [];
    for (let i = start; i <= end; i++) {
      const item = flatItems[i];
      if (item && item.type === 'server') serverIds.push(item.server.id);
    }
    onSelectChange(serverIds);
    lastClickedIndex.current = flatIdx;
  }, [selectionMode, onSelectChange]);

  const handleGroupToggleSelect = useCallback((groupName: string) => {
    if (!selectionMode) return;
    const ids = allGroupServerIds[groupName] || [];
    if (ids.length === 0) return;
    const alreadyAllSelected = ids.every(id => selectedSet.has(id));
    onSelectChange(ids.map(id => ({ id, selected: !alreadyAllSelected })));
  }, [selectionMode, allGroupServerIds, selectedSet, onSelectChange]);

  const isGroupSelected = useCallback((groupName: string) => {
    const ids = allGroupServerIds[groupName] || [];
    return ids.length > 0 && ids.every(id => selectedSet.has(id));
  }, [allGroupServerIds, selectedSet]);

  const isGroupPartiallySelected = useCallback((groupName: string) => {
    const ids = allGroupServerIds[groupName] || [];
    if (ids.length === 0) return false;
    const selectedCount = ids.filter(id => selectedSet.has(id)).length;
    return selectedCount > 0 && selectedCount < ids.length;
  }, [allGroupServerIds, selectedSet]);

  // 按分组组织服务器
  const groupedServers = useMemo(() => {
    const groups: Record<string, config.Connection[]> = {};
    for (const s of servers) {
      const g = s.group || '';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    }
    const names = Object.keys(groups);
    // 按用户拖拽顺序排序，新分组追加到已排序列表末尾，未分组始终最后
    const ordered = groupOrder.filter(g => g !== '' && groups[g]);
    const unordered = names.filter(g => g !== '' && !groupOrder.includes(g)).sort((a, b) => a.localeCompare(b));
    const result: Array<[string, config.Connection[]]> = [];
    for (const g of [...ordered, ...unordered]) result.push([g, groups[g]]);
    if (groups['']) result.push(['', groups['']]);
    return result;
  }, [servers, groupOrder]);

  // 已有分组名称列表
  const existingGroups = useMemo(() => {
    const s = new Set<string>();
    for (const srv of servers) { if (srv.group) s.add(srv.group); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [servers]);

  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  const openGroupHeaderMenu = (e: React.MouseEvent, groupName: string) => {
    if (!groupName || !onRenameGroup) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuServer(null);
    setGroupMenu(false);
    setGroupHeaderMenu({ groupName, x: e.clientX, y: e.clientY });
  };

  const handleRenameGroupFromMenu = async () => {
    if (!groupHeaderMenu?.groupName || !onRenameGroup) return;
    const oldName = groupHeaderMenu.groupName;
    setGroupHeaderMenu(null);
    const newName = await onRenameGroup(oldName);
    if (!newName || newName === oldName) return;
    setCollapsedGroups((prev) => {
      if (!prev.has(oldName)) return prev;
      const next = new Set(prev);
      next.delete(oldName);
      next.add(newName);
      return next;
    });
    setGroupOrder((prev) => {
      if (!prev.includes(oldName)) return prev;
      const next = prev.map((g) => (g === oldName ? newName : g));
      localStorage.setItem('serverGroupOrder', JSON.stringify(next));
      return next;
    });
  };

  const moveGroup = (g: string, dir: number) => {
    const names = groupedServers.filter(([n]) => n !== '').map(([n]) => n);
    const idx = names.indexOf(g);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= names.length) return;
    [names[idx], names[newIdx]] = [names[newIdx], names[idx]];
    setGroupOrder(names);
    localStorage.setItem('serverGroupOrder', JSON.stringify(names));
    if (addToast) addToast(t('已移动'), 'success', 1500);
  };

  // 构建扁平 items：分组 header + server card 混合列表（hook 必须在 early return 之前）
  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    for (const [groupName, groupServers] of groupedServers) {
      const collapsed = collapsedGroups.has(groupName);
      const showHeader = groupedServers.length > 1 || groupName !== '';
      if (showHeader) items.push({ type: 'header', groupName, count: groupServers.length, collapsed });
      if (!collapsed) {
        for (const server of groupServers) items.push({ type: 'server', server });
      }
    }
    return items;
  }, [groupedServers, collapsedGroups]);

  // 同步 flatItems 到 ref，供 handleShiftClick 使用（避免闭包引用问题）
  flatItemsRef.current = flatItems;

  if (servers.length === 0) {
    return (
      <div className="empty-state mt-5">
        <div className="empty-state-icon flex items-center justify-center"><Monitor size={48} strokeWidth={1.5} /></div>
        <div className="empty-state-text">
          {t('暂无服务器')}
        </div>
      </div>
    );
  }

  // Server card 渲染
  const renderServerCard = (server: config.Connection, flatIdx: number) => {
    const ping = pingEnabled ? pings[server.id] : undefined;
    const latClass = ping ? LATENCY_CLASS(ping.latency) : 'offline';
    const active = isActive(server);
    const connected = hasSession(server);
    const sessionForServer = connectedSessionMap.get(server.id);
    const osInfo = getOSInfo(server.name, server.os, (sessionForServer?.osInfo as Record<string, unknown> | null | undefined) || null);
    const { rowToken, nameToken, hostToken } = getSaveFlowTokens(server);
    const isChecked = selectedSet.has(server.id);

    const handleCardClick = (e: React.MouseEvent) => {
      if (selectionMode) {
        e.stopPropagation();
        if (e.shiftKey) {
          handleShiftClick(server, flatIdx);
        } else {
          handleServerClick(server, flatIdx);
        }
        return;
      }
      // 拖选复制：不连接；纯点击：连接
      tryConnect(server);
    };

    // key 必须在 map 返回的最外层（Tiptop），挂在内层 div 时 React 仍会报 missing key
    return (
      <Tiptop key={`${server.id}-${rowToken || 'stable'}`} text={`${server.username}@${server.host}:${server.port || 22}`}>
        <div
          data-server-update-id={server.id}
          className={cn('server-card group m-0', active && 'active', rowToken && 'save-flow-hit', selectionMode && isChecked && 'selected')}
          {...pointerSelectHandlers}
          onClick={handleCardClick}
          onContextMenu={(e) => handleContextMenu(e, server)}
        >
          {selectionMode && (
            <div
              className={cn('custom-checkbox mr-2', isChecked && 'checked')}
              onClick={(e) => {
                e.stopPropagation();
                onSelectChange(server.id);
              }}
            >
              {isChecked && (
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          )}
          <div
            className="w-7 h-7 rounded-sm flex items-center justify-center text-lg shrink-0 border border-line-subtle"
            style={{ background: osInfo.bg }}
          >
            {osInfo.icon}
          </div>
          <div className="server-info flex flex-col gap-px flex-1 min-w-0">
            <div className="server-name flex items-center gap-[5px] text-base text-primary font-medium">
              <span
                key={`name-${nameToken || 'stable'}`}
                data-edit-source-field="name"
                className={cn('save-flow-target overflow-hidden text-ellipsis whitespace-nowrap', nameToken && 'save-flow-target-active')}
              >
                {server.name || server.host}
              </span>
              {connected && (
                <span className="text-[10px] text-success font-mono shrink-0">
                  ● {t('已连接')}
                </span>
              )}
            </div>
            <div className="server-host text-tertiary overflow-hidden text-ellipsis whitespace-nowrap" data-edit-source-field="hostPort">
              <span
                key={`host-${hostToken || 'stable'}`}
                className={cn('save-flow-target', hostToken && 'save-flow-target-active')}
              >
                {hideSensitive ? mask(`${server.username}@${server.host}`) : `${server.username}@${server.host}:${server.port || 22}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {ping?.online && ping?.latency !== undefined && ping?.latency !== null ? (
              <>
                <span className={cn(
                  'text-xs font-mono',
                  latClass === 'good' ? 'text-success' : latClass === 'warn' ? 'text-warning' : 'text-danger',
                )}>
                  {ping.latency === -1 ? t('<1毫秒') : `${ping.latency}${t('毫秒')}`}
                </span>
                <div className={cn(
                  'w-[7px] h-[7px] rounded-full',
                  latClass === 'good' ? 'bg-success' : latClass === 'warn' ? 'bg-warning' : 'bg-danger',
                )} />
              </>
            ) : (
              ping !== undefined && !ping?.online ? (
                <Tiptop text={t('服务器离线或不可达')}>
                  <span className="text-md text-danger font-bold leading-none" aria-label={t('服务器离线或不可达')}><X size={13} /></span>
                </Tiptop>
              ) : null
            )}
            <Tiptop text={t('编辑服务器')}>
              <button
                onClick={(e) => { e.stopPropagation(); triggerEdit(server, e.currentTarget.closest('.server-card')); }}
                aria-label={t('编辑服务器')}
                className="flex items-center bg-transparent border-none cursor-pointer py-[3px] px-1 rounded-sm text-base text-muted opacity-0 group-hover:opacity-100 group-hover:text-primary transition-[opacity,color] duration-[120ms]"
              >
                <SquarePen size={13} />
              </button>
            </Tiptop>
          </div>
        </div>
      </Tiptop>
    );
  };

  return (
    <>
      {viewMode === 'grid' ? (
      <div className="server-grid">
        {flatItems.map((item, idx) =>
          item.type === 'header' ? (
            <div
              key={`__group_${item.groupName || 'ungrouped'}`}
              onContextMenu={(e) => openGroupHeaderMenu(e, item.groupName)}
              className={cn(
                'col-span-full flex items-center gap-1.5 py-1 pt-2 mt-1 border-t border-line-subtle text-sm text-secondary font-medium select-none',
                item.collapsed ? 'mb-0' : 'mb-1',
              )}
            >
              {selectionMode && (
                <div
                  className={cn('custom-checkbox', isGroupSelected(item.groupName) ? 'checked' : isGroupPartiallySelected(item.groupName) ? 'indeterminate' : '')}
                  onClick={(e) => { e.stopPropagation(); handleGroupToggleSelect(item.groupName); }}
                >
                  {isGroupSelected(item.groupName) ? (
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isGroupPartiallySelected(item.groupName) ? (
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="12" x2="20" y2="12" />
                    </svg>
                  ) : null}
                </div>
              )}
              <span onClick={() => toggleGroup(item.groupName)} className="flex items-center gap-1.5 cursor-pointer flex-1">
                {item.collapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
                <span>{item.groupName || t('未分组')}</span>
                <span className="text-xs text-tertiary">({item.count})</span>
              </span>
              {selectionMode && item.groupName && onGroupDelete && (
                <Tiptop text={t('删除分组')} placement="bottom">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const ids = allGroupServerIds[item.groupName];
                      if (ids && ids.length > 0 && onGroupDelete) {
                        onGroupDelete(item.groupName, ids);
                      }
                    }}
                    className="bg-transparent border-none cursor-pointer p-0.5 text-danger flex rounded-sm"
                    aria-label={t('删除分组')}
                  >
                    <Trash size={13} />
                  </button>
                </Tiptop>
              )}
              {item.groupName && (
                <span className="flex gap-0.5">
                  <Tiptop text={t('上移')}>
                    <button onClick={(e) => { e.stopPropagation(); moveGroup(item.groupName, -1); }} className="bg-transparent border-none cursor-pointer p-0.5 text-tertiary flex" aria-label={t('上移')}><ChevronUp size={13} /></button>
                  </Tiptop>
                  <Tiptop text={t('下移')}>
                    <button onClick={(e) => { e.stopPropagation(); moveGroup(item.groupName, 1); }} className="bg-transparent border-none cursor-pointer p-0.5 text-tertiary flex" aria-label={t('下移')}><ChevronDown size={13} /></button>
                  </Tiptop>
                </span>
              )}
            </div>
          ) : renderServerCard(item.server, idx)
        )}
      </div>
      ) : (
      <div className="server-table-container">
        <table className="server-table">
          <thead>
            <tr>
              {selectionMode && <th className="w-9"></th>}
              <th>{t('系统')}</th>
              <th>{t('别名')}</th>
              <th>{t('主机地址')}</th>
              <th>{t('用户名')}</th>
              <th>{t('状态')}</th>
              <th>{t('操作')}</th>
            </tr>
          </thead>
          <tbody>
             {flatItems.map((item, idx) => {
                if (item.type === 'header') {
                    return (
                    <tr key={`__group_${item.groupName || 'ungrouped'}`}>
                      <td
                        colSpan={6 + (selectionMode ? 1 : 0)}
                        onContextMenu={(e) => openGroupHeaderMenu(e, item.groupName)}
                        className="px-2 py-1.5 text-base text-secondary font-medium select-none bg-sunken"
                      >
                        <span className="inline-flex items-center gap-1.5 w-full">
                          {selectionMode && (
                            <div
                              className={cn('custom-checkbox', isGroupSelected(item.groupName) ? 'checked' : isGroupPartiallySelected(item.groupName) ? 'indeterminate' : '')}
                              onClick={(e) => { e.stopPropagation(); handleGroupToggleSelect(item.groupName); }}
                            >
                              {isGroupSelected(item.groupName) ? (
                                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : isGroupPartiallySelected(item.groupName) ? (
                                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="4" y1="12" x2="20" y2="12" />
                                </svg>
                              ) : null}
                            </div>
                          )}
                          <span onClick={() => toggleGroup(item.groupName)} className="inline-flex items-center gap-1.5 cursor-pointer flex-1">
                            {item.collapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                            {item.groupName || t('未分组')}
                            <span className="text-xs text-tertiary">({item.count})</span>
                          </span>
                          {selectionMode && item.groupName && onGroupDelete && (
                            <Tiptop text={t('删除分组')} placement="bottom">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const ids = allGroupServerIds[item.groupName];
                                  if (ids && ids.length > 0 && onGroupDelete) {
                                    onGroupDelete(item.groupName, ids);
                                  }
                                }}
                                className="bg-transparent border-none cursor-pointer p-0.5 text-danger inline-flex rounded-sm"
                                aria-label={t('删除分组')}
                              >
                                <Trash size={12} />
                              </button>
                            </Tiptop>
                          )}
                          {item.groupName && (
                            <span className="inline-flex gap-0.5">
                              <Tiptop text={t('上移')}>
                                <button onClick={(e) => { e.stopPropagation(); moveGroup(item.groupName, -1); }} className="bg-transparent border-none cursor-pointer p-0.5 text-tertiary inline-flex" aria-label={t('上移')}><ChevronUp size={12} /></button>
                              </Tiptop>
                              <Tiptop text={t('下移')}>
                                <button onClick={(e) => { e.stopPropagation(); moveGroup(item.groupName, 1); }} className="bg-transparent border-none cursor-pointer p-0.5 text-tertiary inline-flex" aria-label={t('下移')}><ChevronDown size={12} /></button>
                              </Tiptop>
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                }
               const server = item.server;
               const ping = pingEnabled ? pings[server.id] : undefined;
               const latClass = ping ? LATENCY_CLASS(ping.latency) : 'offline';
               const active = isActive(server);
               const connected = hasSession(server);
                const sessionForServer = connectedSessionMap.get(server.id);
                const osInfo = getOSInfo(server.name, server.os, (sessionForServer?.osInfo as Record<string, unknown> | null | undefined) || null);
                const { rowToken, nameToken, hostToken, usernameToken } = getSaveFlowTokens(server);
                const isChecked = selectedSet.has(server.id);

                const handleTableRowClick = (e: React.MouseEvent) => {
                  if (selectionMode) {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      handleShiftClick(server, idx);
                    } else {
                      handleServerClick(server, idx);
                    }
                    return;
                  }
                  tryConnect(server);
                };

                return (
                  <tr
                    key={`${server.id}-${rowToken || 'stable'}`}
                    data-server-update-id={server.id}
                    className={cn('server-table-row', active && 'active', rowToken && 'save-flow-hit', selectionMode && isChecked && 'selected')}
                    {...pointerSelectHandlers}
                    onClick={handleTableRowClick}
                    onContextMenu={(e) => handleContextMenu(e, server)}
                  >
                   {selectionMode && (
                     <td className="w-9 px-2 py-1">
                       <div
                         className={cn('custom-checkbox', isChecked && 'checked')}
                         onClick={(e) => {
                           e.stopPropagation();
                           onSelectChange(server.id);
                         }}
                        >
                          {isChecked && (
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                     </td>
                   )}
                   <td>
                     <div className="flex items-center gap-2">
                       <div className="w-5 h-5" style={{ color: osInfo.accent }}>{osInfo.icon}</div>
                       <span className="text-sm text-tertiary">{osInfo.label}</span>
                     </div>
                   </td>
                   <td data-edit-source-field="name" className="font-medium text-primary">
                     <span key={`name-${nameToken || 'stable'}`} className={cn('save-flow-target', nameToken && 'save-flow-target-active')}>
                       {server.name || server.host}
                     </span>
                     {connected && <span className="ml-1.5 text-[10px] text-success py-0.5 px-1 bg-success-dim rounded-sm">{t('已连接')}</span>}
                   </td>
                   <td data-edit-source-field="hostPort" className="text-base text-secondary font-mono">
                     <span key={`host-${hostToken || 'stable'}`} className={cn('save-flow-target', hostToken && 'save-flow-target-active')}>
                       {hideSensitive ? mask(server.host) : `${server.host}:${server.port || 22}`}
                     </span>
                   </td>
                   <td data-edit-source-field="username" className="text-secondary">
                     <span key={`username-${usernameToken || 'stable'}`} className={cn('save-flow-target', usernameToken && 'save-flow-target-active')}>
                       {hideSensitive ? mask(server.username) : server.username}
                     </span>
                   </td>
                   <td>
                     {ping?.online && ping?.latency !== undefined && ping?.latency !== null ? (
                       <div className="flex items-center gap-1.5">
                         <div className={cn(
                           'w-2 h-2 rounded-full',
                           latClass === 'good' ? 'bg-success' : latClass === 'warn' ? 'bg-warning' : 'bg-danger',
                         )} />
                         <span className={cn(
                           'text-sm font-mono',
                           latClass === 'good' ? 'text-success' : latClass === 'warn' ? 'text-warning' : 'text-danger',
                         )}>
                           {ping.latency === -1 ? t('<1毫秒') : `${ping.latency}${t('毫秒')}`}
                         </span>
                       </div>
                     ) : (
                       ping !== undefined && !ping?.online ? (
                         <div className="flex items-center gap-1.5 text-danger">
                           <X size={14} />
                           <span className="text-sm">{t('离线')}</span>
                         </div>
                       ) : <span className="text-tertiary">-</span>
                     )}
                   </td>
                   <td>
                     <Button
                       variant="ghost"
                       size="sm"
                       className="px-2 py-1"
                       onClick={(e) => { e.stopPropagation(); triggerEdit(server, e.currentTarget.closest('.server-table-row')); }}
                     >
                       {t('编辑')}
                     </Button>
                   </td>
                 </tr>
               );
             })}
          </tbody>
        </table>
      </div>
      )}

      {/* Context Menu */}
      {groupHeaderMenu && (
        <ContextMenu
          x={groupHeaderMenu.x}
          y={groupHeaderMenu.y}
          minWidth={MENU_ESTIMATED_WIDTH}
          items={[
            { label: t('重命名分组'), icon: <PenLine size={14} />, onSelect: () => { void handleRenameGroupFromMenu(); } },
          ]}
          onClose={() => setGroupHeaderMenu(null)}
        />
      )}

       {menuServer && (
        <>
          {/* 透明 backdrop：点击任意空白处关闭（含子菜单） */}
          <div
            className="fixed inset-0"
            style={{ zIndex: Z.MENU_BACKDROP }}
            onMouseDown={() => closeServerMenu()}
            onContextMenu={(e) => { e.preventDefault(); closeServerMenu(); }}
          />
          <MenuPanel
            minWidth={MENU_ESTIMATED_WIDTH}
            className="fixed overflow-visible animate-[fadeIn_0.12s_ease]"
            style={{ left: menuPos.x, top: menuPos.y, zIndex: Z.MENU }}
          >
            <div className="relative">
              <MenuList
                items={[
                  { label: t('连接'), icon: <Link size={14} />, onSelect: () => { onConnect(menuServer); } },
                  { label: t('编辑配置'), icon: <SquarePen size={14} />, onSelect: () => { triggerEdit(menuServer, menuSourceRef.current); } },
                  { label: t('克隆'), icon: <Copy size={14} />, onSelect: () => { onClone(menuServer, getEditAnimationPayload(menuServer, menuSourceRef.current)); } },
                  ...(onMoveGroup ? [{
                    label: t('移动到分组'),
                    icon: <Folder size={14} />,
                    onSelect: () => {
                      submenuToggleRef.current = true;
                      setGroupMenu((prev) => !prev);
                    },
                  } as MenuItem] : []),
                  'separator',
                  {
                    label: t('删除'),
                    icon: <Trash2 size={14} />,
                    danger: true,
                    onSelect: () => {
                      void (async () => {
                        if (await window.luminDialog?.confirm(`${t('确定删除服务器')}「${menuServer.name || menuServer.host}」？`)) {
                          onDelete(menuServer.id);
                        }
                      })();
                    },
                  },
                ] as MenuItem[]}
                onClose={() => {
                  if (submenuToggleRef.current) {
                    submenuToggleRef.current = false;
                    return;
                  }
                  closeServerMenu();
                }}
              />
              {groupMenu && onMoveGroup && (
                <MenuPanel
                  minWidth={MENU_ESTIMATED_WIDTH}
                  className="absolute left-full top-0 animate-[fadeIn_0.12s_ease]"
                  style={{ zIndex: Z.SUBMENU }}
                >
                  <MenuList
                    items={[
                      ...existingGroups.filter(g => g !== (menuServer.group || '')).map((g): MenuItem => ({
                        label: g,
                        icon: <Folder size={13} />,
                        onSelect: () => { onMoveGroup(menuServer.id, g); },
                      })),
                      ...(menuServer.group ? [{
                        label: t('移出分组'),
                        icon: <X size={13} />,
                        onSelect: () => { onMoveGroup(menuServer.id, ''); },
                      } as MenuItem] : []),
                    ] as MenuItem[]}
                    onClose={closeServerMenu}
                  />
                </MenuPanel>
              )}
            </div>
          </MenuPanel>
        </>
       )}

     </>
   );
}
