import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderPlus, Zap, Save, Pencil, Trash2, Rocket, SquarePen, X, List } from 'lucide-react';
import * as AppGo from '../../wailsjs/go/wailsapp/App.js';
import { useTranslation } from '../i18n.ts';
import Tiptop from './Tiptop.tsx';
import { Z } from '../constants/zIndex.ts';
import { ContextMenu, EmptyState, MenuList, MenuPanel, Modal, Button } from './ui';
import type { MenuItem } from './ui';
import { extractQuickCommandParams, fillQuickCommandParams, normalizeQuickCommandParamHistory, QUICK_COMMAND_PARAM_HISTORY_LIMIT, type QuickCommandParamHistory } from '../utils/quickCommandParams.ts';

// ── 命令树节点 ───────────────────────────────────────────
interface QuickCommandItem {
  type?: 'group' | 'command';
  name?: string;
  command?: string;
  addCR?: boolean;
  last_modified?: number;
  expanded?: boolean;
  children?: QuickCommandItem[];
  // 搜索过滤附加字段（filterTree 注入）
  _filteredChildren?: QuickCommandItem[];
  _isFilteredGroup?: boolean;
}

export interface QuickCommandsHandle {
  isDirty: () => boolean;
  showCloseConfirm: () => void;
}

interface QuickCommandsProps {
  sessionId: string;
  historySessionId?: string;
  addToast?: (message: string | Error, type?: string, duration?: number, actions?: unknown[]) => number;
  connectedSessions?: Array<{ id: string }>;
  onClose?: () => void;
}

// ── 加载命令数据（从 Go 后端文件）────────────────────
async function loadCommands(): Promise<QuickCommandItem[]> {
  try {
    const raw = await AppGo.GetQuickCommands();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as QuickCommandItem[];
  } catch (_) {}
  return [];
}

// ── 保存命令数据（到 Go 后端文件）────────────────────
async function saveCommands(list: QuickCommandItem[]) {
  try {
    await AppGo.SaveQuickCommands(JSON.stringify(list));
    // 通知终端快捷命令条刷新
    window.dispatchEvent(new CustomEvent('quick-commands-changed'));
  } catch (e) {
    console.error('[QuickCommands] saveCommands failed:', e);
  }
}

// ── 本地保存（不同步到云端）───────────────────────────
async function saveCommandsLocal(list: QuickCommandItem[]) {
  try {
    await AppGo.SaveQuickCommandsLocal(JSON.stringify(list));
  } catch (_) {}
}

// ── 搜索过滤树形数据（返回扁平化的匹配节点路径）─────────
function filterTree(items: QuickCommandItem[], keyword: string, parentPath = ''): QuickCommandItem[] {
  if (!keyword) return items;
  const kw = keyword.toLowerCase();
  const result: QuickCommandItem[] = [];
  items.forEach((item, i) => {
    const path = parentPath ? `${parentPath}/${i}` : String(i);
    if (item.type === 'group') {
      // 分组：检查自身名称或子项
      const nameMatch = (item.name || '').toLowerCase().includes(kw);
      if (item.children && item.children.length > 0) {
        const matchedChildren = filterTree(item.children, kw, path);
        if (nameMatch || matchedChildren.length > 0) {
          // 返回展开的分组 + 匹配的子项
          result.push({ ...item, expanded: true, _filteredChildren: matchedChildren, _isFilteredGroup: true });
        }
      } else if (nameMatch) {
        result.push(item);
      }
    } else {
      // 命令：匹配名称或命令内容
      if ((item.name || '').toLowerCase().includes(kw) ||
          (item.command || '').toLowerCase().includes(kw)) {
        result.push(item);
      }
    }
  });
  return result;
}

// ── 树形节点渲染组件 ────────────────────────────────────
interface TreeNodeProps {
  item: QuickCommandItem;
  index: number;
  path: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  contextMenu: ContextMenuState | null;
  onContextMenu: (e: React.MouseEvent, path: string, type: 'group' | 'command', index: number) => void;
  closeContextMenu: () => void;
  onExecute: (item: QuickCommandItem) => void;
  onMove: (path: string, direction: number) => void;
  onDragStart: (path: string) => void;
  onDropItem: (path: string, pos: string) => void;
  onDragEnd: () => void;
  dragVersion: number;
}

function TreeNode({ item, index, path, selectedPath, onSelect, contextMenu, onContextMenu, closeContextMenu, onExecute, onMove, onDragStart, onDropItem, onDragEnd, dragVersion }: TreeNodeProps) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  const [dropPos, setDropPos] = useState<'before' | 'inside' | 'after' | null>(null); // 'before' | 'inside' | 'after'

  useEffect(() => { setDropPos(null); }, [dragVersion]);

  const arrowBtn = (dir: number) => (
    <Tiptop text={dir === -1 ? t('上移') : t('下移')}>
      <span
        onClick={(e) => { e.stopPropagation(); onMove && onMove(path, dir); }}
        className="text-[10px] cursor-pointer text-muted px-[3px] leading-[14px] select-none"
        style={{ visibility: hover ? 'visible' : 'hidden' }}
      >{dir === -1 ? '▲' : '▼'}</span>
    </Tiptop>
  );

  const commonDragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', path);
      onDragStart && onDragStart(path);
    },
    onDragEnd: (e: React.DragEvent) => { e.stopPropagation(); onDragEnd && onDragEnd(); },
  };

  const calcDropPos = (e: React.DragEvent, allowInside: boolean): 'before' | 'inside' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.25) return 'before';
    if (allowInside && y < 0.75) return 'inside';
    return 'after';
  };

  const dropIndicator = (pos: 'before' | 'after') => {
    if (dropPos !== pos) return null;

    return (
      <div
        className="absolute left-1 right-1 h-0.5 bg-success rounded-full z-[5]"
        style={{ [pos === 'before' ? 'top' : 'bottom']: -1 }}
      />
    );
  };

  if (item.type === 'group') {
    const isExpanded = item.expanded !== false;
    const isSelected = selectedPath === path;
    const childrenList = item._filteredChildren || item.children;
    return (
      <div className="relative">
        {/* before indicator */}
        {dropIndicator('before')}
        {/* after indicator */}
        {dropIndicator('after')}
        <div
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropPos(calcDropPos(e, true)); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDropPos(calcDropPos(e, true)); }}
          onDragLeave={(e) => { e.stopPropagation(); setDropPos(null); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const pos = dropPos; setDropPos(null); onDropItem && onDropItem(path, pos || 'inside'); }}
        >
          <div
            onClick={() => onSelect(path)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, path, 'group', index); }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            {...commonDragProps}
            className={`flex items-center gap-1 px-2 py-[5px] cursor-pointer rounded-xs text-base select-none transition-colors duration-100 ${
              dropPos === 'inside'
                ? 'bg-active outline outline-1 outline-dashed outline-accent'
                : isSelected
                  ? 'bg-active text-primary'
                  : hover
                    ? 'bg-hover text-primary'
                    : 'text-secondary'
            }`}
          >
            <span className="text-[10px] w-3.5 text-center shrink-0">
              {isExpanded ? '▼' : '▶'}
            </span>
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
              <Folder size={14} className="shrink-0" /> {item.name}
            </span>
            {arrowBtn(-1)}
            {arrowBtn(1)}
          </div>
          {isExpanded && childrenList && childrenList.map((child, ci) => (
            <div key={ci} className="pl-4">
              <TreeNode
                item={child}
                index={ci}
                path={`${path}/${ci}`}
                selectedPath={selectedPath}
                onSelect={onSelect}
                contextMenu={contextMenu}
                onContextMenu={onContextMenu}
                closeContextMenu={closeContextMenu}
                onExecute={onExecute}
                onMove={onMove}
                onDragStart={onDragStart}
                onDropItem={onDropItem}
                onDragEnd={onDragEnd}
                dragVersion={dragVersion}
              />
            </div>
          ))}
          {isExpanded && (!item.children || item.children.length === 0) && (
            <div className="italic py-1 pr-2 pl-[30px] text-xs text-muted">
              {t('(空分组，右键添加命令)')}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 普通命令节点
  const isSelected = selectedPath === path;
  return (
    <div className="relative">
      {dropIndicator('before')}
      {dropIndicator('after')}
      <div
        onClick={() => onSelect(path)}
        onDoubleClick={(e) => { e.stopPropagation(); onExecute(item); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, path, 'command', index); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropPos(calcDropPos(e, false)); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDropPos(calcDropPos(e, false)); }}
        onDragLeave={(e) => { e.stopPropagation(); setDropPos(null); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const pos = calcDropPos(e, false); setDropPos(null); onDropItem && onDropItem(path, pos || 'after'); }}
        {...commonDragProps}
        className={`flex items-center px-2 py-[5px] cursor-pointer rounded-xs text-sm select-none transition-colors duration-100 ${
          isSelected ? 'bg-active text-primary' : hover ? 'bg-hover text-primary' : 'text-secondary'
        }`}
      >
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {item.name}
        </span>
        {arrowBtn(-1)}
        {arrowBtn(1)}
      </div>
    </div>
  );
}

// ── 右键菜单 / 对话框状态 ─────────────────────────────
interface ContextMenuState {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  path: string;
  type: 'group' | 'command';
  index: number;
}

interface QuickCommandDialogState {
  type: 'add' | 'edit' | 'addGroup' | 'editGroup';
  contextPath?: string;
  parentList?: QuickCommandItem[];
  targetChildren?: QuickCommandItem[];
  groupName?: string;
  parent?: QuickCommandItem[];
  idx?: number;
}

const QuickCommands = forwardRef<QuickCommandsHandle, QuickCommandsProps>(function QuickCommands({ sessionId, historySessionId, addToast, connectedSessions = [], onClose }, ref: Ref<QuickCommandsHandle>) {
  const { t } = useTranslation();
  const [commands, setCommands] = useState<QuickCommandItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sendTarget, setSendTarget] = useState<'current' | 'all'>('current'); // 'current' | 'all'
  // 固定命令条：命令常驻显示在终端输入框上方（与 Terminal.jsx 共用 localStorage 键）
  const [showCmdBar, setShowCmdBar] = useState(
    () => localStorage.getItem('terminalQuickCmdBar') === 'true'
  );
  // 命令编辑器（悬浮页，替代原底部快速命令栏）
  const [showCmdEditor, setShowCmdEditor] = useState(false);
  const [cmdEditorText, setCmdEditorText] = useState('');
  const [cmdEditorAddCR, setCmdEditorAddCR] = useState(true);
  const [cmdEditorClearAfterSend, setCmdEditorClearAfterSend] = useState(true);
  const [cmdEditorShowOpts, setCmdEditorShowOpts] = useState(false);
  const cmdEditorOptsRef = useRef<HTMLDivElement>(null);

  // 编辑/添加对话框
  const [dialog, setDialog] = useState<QuickCommandDialogState | null>(null); // { type:'add'|'edit', groupPath?, item? }
  const [dlgName, setDlgName] = useState('');
  const [dlgCmd, setDlgCmd] = useState('');
  const [dlgAddCR, setDlgAddCR] = useState(true);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [groupPickerPos, setGroupPickerPos] = useState({ x: 0, y: 0 });

  // 参数历史（按命令缓存，存到文件）
  const [paramHistory, setParamHistory] = useState<QuickCommandParamHistory>({});
  // 当前选中命令的参数值（底部内联填写）
  const [paramValues, setParamValues] = useState<Record<number, string>>({});
  // 历史下拉：{ cmdKey, paramNum } — 控制哪个参数的下拉展开
  const [historyDropdown, setHistoryDropdown] = useState<{ cmdKey: string; paramNum: number; left: number; top: number } | null>(null);
  // 历史下拉内的搜索关键词
  const [historySearch, setHistorySearch] = useState('');
  // 搜索关键词
  const [searchText, setSearchText] = useState('');
  const [rootDragOver, setRootDragOver] = useState(false);
  const [dragVersion, setDragVersion] = useState(0);
  // 是否有未保存的编辑
  const [dirty, setDirty] = useState(false);
  // 切换确认：{ pendingPath } 或 null
  const [confirmUnsaved, setConfirmUnsaved] = useState<{ close?: boolean; pendingPath?: string } | null>(null);
  // 分组名称编辑（本地缓存，手动保存）
  const [editGroupName, setEditGroupName] = useState('');
  // 命令编辑（本地缓存，保存时才同步到树，避免每个按键都 cloneAlongPath）
  const [editCmdName, setEditCmdName] = useState('');
  const [editCmdText, setEditCmdText] = useState('');

  const groupPickerRef = useRef<HTMLSpanElement>(null);
  const dragSourceRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 暴露 dirty 状态给父组件（关闭确认）
  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    showCloseConfirm: () => setConfirmUnsaved({ close: true }),
  }));

  // ── 拖拽 ─────────────────────────────────────────────
  const handleDragStart = (path: string) => {
    dragSourceRef.current = path;
  };

  const clearDrag = () => {
    dragSourceRef.current = null;
    setRootDragOver(false);
    setDragVersion(v => v + 1);
  };

  const parsePath = (path: string) => path.split('/').map(Number);

  const hasPathPrefix = (parts: number[], prefix: number[]) => prefix.every((value, index) => parts[index] === value);

  const adjustPathAfterRemoval = (targetParts: number[], srcParts: number[]) => {
    const srcParentParts = srcParts.slice(0, -1);
    const srcIdx = srcParts[srcParts.length - 1];
    if (!hasPathPrefix(targetParts, srcParentParts)) return targetParts;
    const affectedIndex = srcParentParts.length;
    if (targetParts[affectedIndex] > srcIdx) {
      const adjusted = [...targetParts];
      adjusted[affectedIndex] -= 1;
      return adjusted;
    }
    return targetParts;
  };

  // ── 统一处理所有拖放（before / inside / after / root）─
  const handleDropItem = (targetPath: string, pos: string) => {
    const srcPath = dragSourceRef.current;
    if (!srcPath || srcPath === targetPath) { clearDrag(); return; }
    if (targetPath.startsWith(srcPath + '/')) { clearDrag(); return; }

    const srcParts = parsePath(srcPath);
    const targetParts = parsePath(targetPath);
    const list = structuredClone(commands);
    const src = resolvePath(list, srcPath);
    if (!src.item) { clearDrag(); return; }

    const [moved] = src.parent.splice(src.idx, 1);
    moved.last_modified = Date.now();

    const adjustedTargetPath = adjustPathAfterRemoval(targetParts, srcParts).join('/');
    const tgt = resolvePath(list, adjustedTargetPath);
    if (!tgt.item) { clearDrag(); return; }

    if (pos === 'inside' && tgt.item.type === 'group') {
      if (!tgt.item.children) tgt.item.children = [];
      tgt.item.children.push(moved);
      tgt.item.expanded = true;
    } else {
      const insertIdx = tgt.idx + (pos === 'after' ? 1 : 0);
      tgt.parent.splice(insertIdx, 0, moved);
    }

    save(list);
    setSelectedPath(null);
    clearDrag();
  };

  const handleDropToRoot = () => {
    const srcPath = dragSourceRef.current;
    if (!srcPath) { clearDrag(); return; }
    const list = structuredClone(commands);
    const src = resolvePath(list, srcPath);
    if (!src.item) { clearDrag(); return; }
    const [moved] = src.parent.splice(src.idx, 1);
    moved.last_modified = Date.now();
    list.push(moved);
    save(list);
    setSelectedPath(null);
    clearDrag();
  };

  // ── 初始化：从文件加载命令和参数历史 ───────────────
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCommands(),
      (async () => {
        try {
          const raw = await AppGo.GetParamHistory();
          return normalizeQuickCommandParamHistory(JSON.parse(raw));
        } catch (_) {}
        return {};
      })(),
    ]).then(([data, hist]) => {
      if (cancelled) return;
      if (data.length > 0) setCommands(data);
      setParamHistory(hist);
      AppGo.SaveParamHistory(JSON.stringify(hist)).catch(() => {});
    });
    return () => { cancelled = true; };
  }, []);

  // 选中项变化时同步本地编辑状态
  useEffect(() => {
    if (!selectedPath) return;
    const { item } = resolvePath(commands, selectedPath);
    if (!item) return;
    if (item.type === 'group') {
      setEditGroupName(item.name || '');
    } else if (!item.children) {
      setEditCmdName(item.name || '');
      setEditCmdText(item.command || '');
    }
  }, [selectedPath, commands]);

  // 组件卸载时自动保存未持久化的编辑
  const commandsRef = useRef(commands);
  const dirtyRef = useRef(dirty);
  commandsRef.current = commands;
  dirtyRef.current = dirty;
  useEffect(() => {
    return () => {
      if (dirtyRef.current && commandsRef.current.length > 0) {
        saveCommands(commandsRef.current);
      }
    };
  }, []);

  // ── 点击外部关闭历史下拉 ───────────────────────────
  useEffect(() => {
    if (!historyDropdown) return;
    const handler = (e: MouseEvent) => {
      // 如果点击的是历史按钮或下拉内部，不关闭
      if ((e.target as HTMLElement).closest('[data-history-dropdown]')) return;
      setHistoryDropdown(null);
      setHistorySearch('');
    };
    // 用 click 捕获，避免 mousedown 阶段干扰面板内其它控件
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [historyDropdown]);

  // ── 点击外部关闭命令编辑器「选项」菜单 ───────────────
  useEffect(() => {
    if (!cmdEditorShowOpts) return;
    const handler = (e: MouseEvent) => {
      if (cmdEditorOptsRef.current?.contains(e.target as Node)) return;
      setCmdEditorShowOpts(false);
    };
    // 捕获阶段：面板根节点 stopPropagation 也不会挡住
    document.addEventListener('mousedown', handler, true);
    document.addEventListener('click', handler, true);
    return () => {
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('click', handler, true);
    };
  }, [cmdEditorShowOpts]);

  // 命令编辑器关闭时，顺带收起选项菜单
  useEffect(() => {
    if (!showCmdEditor && cmdEditorShowOpts) setCmdEditorShowOpts(false);
  }, [showCmdEditor, cmdEditorShowOpts]);

  // ── 持久化到文件（保存 + 重新加载，确保双向一致）──
  const save = async (list: QuickCommandItem[]) => {
    await saveCommands(list);
    const data = await loadCommands();
    if (data.length > 0) setCommands(data);
  };

  // ── 将本地编辑的命令名/内容写回树 ────────────────────
  // 返回修改后的列表（若无修改返回 null）
  const commitCmdEdit = useCallback(() => {
    if (!selectedPath || dirty === false) return null;
    const sel = resolvePath(commands, selectedPath);
    if (!sel?.item || sel.item.children) return null; // 不是命令节点
    if (sel.item.name === editCmdName && sel.item.command === editCmdText) return null;
    const list = cloneAlongPath(commands, selectedPath);
    const r = resolvePath(list, selectedPath);
    r.parent[r.idx].name = editCmdName;
    r.parent[r.idx].command = editCmdText;
    r.parent[r.idx].last_modified = Date.now();
    setCommands(list);
    return list;
  }, [commands, selectedPath, editCmdName, editCmdText, dirty]);

  // ── 上移/下移 ──────────────────────────────────────
  const handleMove = (path: string, direction: number) => {
    const list = structuredClone(commands);
    const { parent, idx } = resolvePath(list, path);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= parent.length) return;
    [parent[idx], parent[newIdx]] = [parent[newIdx], parent[idx]];
    parent[idx].last_modified = Date.now();
    parent[newIdx].last_modified = Date.now();
    save(list);
    setSelectedPath(path.replace(/\/\d+$/, '/' + newIdx));
    closeContextMenu();
  };

  // ── 沿路径浅拷贝各层数组 + 目标节点（避免全树深拷贝）──
  // 用于只修改单一字段的场景：返回新树，路径上各层均为新数组/对象引用
  const cloneAlongPath = (list: QuickCommandItem[], path: string) => {
    const parts = path.split('/').map(Number);
    const newList = [...list];
    let cur = newList;
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i];
      cur[idx] = { ...(cur[idx] || {}) };
      if (i < parts.length - 1) {
        cur[idx].children = [...(cur[idx].children || [])];
        cur = cur[idx].children;
      }
    }
    return newList;
  };

  // ── 从 path 定位节点 ─────────────────────────────────
  const resolvePath = (list: QuickCommandItem[], path: string): { parent: QuickCommandItem[]; idx: number; item: QuickCommandItem | null | undefined } => {
    const parts = path.split('/').map(Number);
    let cur = list;
    let parent: QuickCommandItem[] = [];
    let idx = -1;
    for (let i = 0; i < parts.length; i++) {
      parent = cur;
      idx = parts[i];
      if (i === parts.length - 1) return { parent, idx, item: cur[idx] };
      cur = cur[idx].children || [];
    }
    return { parent, idx, item: null };
  };

  // ── 递归收集所有分组 ──────────────────────────────────
  const collectGroups = (list: QuickCommandItem[], basePath = '') => {
    const groups: Array<{ name?: string; path: string; children?: QuickCommandItem[] }> = [];
    if (!Array.isArray(list)) return groups;
    list.forEach((item, i) => {
      const path = basePath ? `${basePath}/${i}` : String(i);
      if (item.type === 'group') {
        groups.push({ name: item.name, path, children: item.children || [] });
        if (item.children) {
          groups.push(...collectGroups(item.children, path));
        }
      }
    });
    return groups;
  };

  // ── 选中处理 ────────────────────────────────────────
  const handleSelect = (path: string) => {
    // 先将当前命令编辑写回树
    commitCmdEdit();
    // 切换选中时如果有未保存修改，弹出确认框
    if (selectedPath && selectedPath !== path && dirty) {
      setConfirmUnsaved({ pendingPath: path });
      return;
    }
    setSelectedPath(path);
    setContextMenu(null);
    const { item } = resolvePath(commands, path);
    // 点击分组：切换展开/折叠，并在右侧显示分组详情
    if (item?.type === 'group') {
      const list = cloneAlongPath(commands, path);
      const r = resolvePath(list, path);
      if (r.item) r.item.expanded = !r.item.expanded;
      setCommands(list);
      saveCommandsLocal(list);
      // 保留选中状态以便右侧显示分组详情
      setParamValues({});
      setDirty(false);
      return;
    }
    // 点击命令：加载历史参数值
    if (item?.command) {
      const params = extractQuickCommandParams(item.command);
      const hist = paramHistory[item.command] || {};
      const initial: Record<number, string> = {};
      params.forEach(p => { initial[p.num] = (hist[p.num]?.[0]) || ''; });
      setParamValues(initial);
    } else {
      setParamValues({});
    }
    setDirty(false);
  };

  // ── 切换确认：保存 ──────────────────────────────────
  const handleConfirmSave = () => {
    if (!confirmUnsaved) return;
    const isClose = confirmUnsaved.close;
    const path = confirmUnsaved.pendingPath;
    const committed = commitCmdEdit();
    save(committed || commands);
    setDirty(false);
    dirtyRef.current = false;
    setConfirmUnsaved(null);
    if (isClose) {
      onClose?.();
    } else if (path) {
      // 判断目标是否为分组
      const { item } = resolvePath(commands, path);
      if (item?.type === 'group') {
        // 分组：切换展开/折叠，并在右侧显示分组详情
        const list = structuredClone(commands);
        const r = resolvePath(list, path);
        if (r.item) r.item.expanded = !r.item.expanded;
        setCommands(list);
        saveCommandsLocal(list);
        // 保留选中状态以便右侧显示分组详情
        setParamValues({});
        return;
      }
      // 继续跳转到目标
      setSelectedPath(path);
      setContextMenu(null);
      if (item?.command) {
        const params = extractQuickCommandParams(item.command);
        const hist = paramHistory[item.command] || {};
        const initial: Record<number, string> = {};
        params.forEach(p => { initial[p.num] = (hist[p.num]?.[0]) || ''; });
        setParamValues(initial);
      } else {
        setParamValues({});
      }
    }
  };

  // ── 切换确认：不保存 ────────────────────────────────
  const handleConfirmDiscard = async () => {
    if (!confirmUnsaved) return;
    const isClose = confirmUnsaved.close;
    const path = confirmUnsaved.pendingPath;
    setConfirmUnsaved(null);
    setDirty(false);
    dirtyRef.current = false;
    if (isClose) {
      onClose?.();
    } else if (path) {
      // 判断目标是否为分组
      const { item: currentItem } = resolvePath(commands, path);
      const data = await loadCommands();
      // 组件可能已卸载，避免 setState 内存泄漏
      if (!mountedRef.current) return;
      setCommands(data);
      if (currentItem?.type === 'group') {
        // 分组：切换展开/折叠，并在右侧显示分组详情
        const list = structuredClone(data);
        const r = resolvePath(list, path);
        if (r.item) r.item.expanded = !r.item.expanded;
        saveCommandsLocal(list);
        // 保留选中状态以便右侧显示分组详情
        setParamValues({});
        return;
      }
      // 继续跳转到目标
      setSelectedPath(path);
      setContextMenu(null);
      const { item } = resolvePath(data, path);
      if (item?.command) {
        const params = extractQuickCommandParams(item.command);
        const hist = paramHistory[item.command] || {};
        const initial: Record<number, string> = {};
        params.forEach(p => { initial[p.num] = (hist[p.num]?.[0]) || ''; });
        setParamValues(initial);
      } else {
        setParamValues({});
      }
    }
  };

  // ── 切换确认：取消 ──────────────────────────────────
  const handleConfirmCancel = () => {
    setConfirmUnsaved(null);
  };

  const getSelectedItem = (): QuickCommandItem | null | undefined => {
    if (!selectedPath) return null;
    const { item } = resolvePath(commands, selectedPath);
    return item;
  };

  // ── 右键菜单 ────────────────────────────────────────
  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'group' | 'command', index: number) => {
    setContextMenu({
      anchorX: e.clientX,
      anchorY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      path,
      type,
      index,
    });
    setSelectedPath(path);
  };

  const closeContextMenu = () => setContextMenu(null);

  const doContextAction = async (action: 'addGroup' | 'addCmd' | 'edit' | 'editGroup' | 'delete' | 'execute') => {
    if (!contextMenu) return;
    const { path, type, index } = contextMenu;
    const parts = path.split('/').map(Number);
    closeContextMenu();

    if (action === 'addGroup') {
      setDialog({ type: 'addGroup', contextPath: path, parentList: commands });
      setDlgName('');
      setDlgCmd('');
      setDlgAddCR(true);
      return;
    }

    if (action === 'addCmd') {
      const list = structuredClone(commands);
      // 用 resolvePath 找到目标分组
      const r = resolvePath(list, path);
      let targetChildren = list;
      if (r?.item?.type === 'group') {
        if (!r.item.children) r.item.children = [];
        targetChildren = r.item.children;
      }
      setDialog({ type: 'add', targetChildren, parentList: list, groupName: r?.item?.name || '' });
      setDlgName('');
      setDlgCmd('');
      setDlgAddCR(true);
      return;
    }

    if (action === 'edit' && type === 'command') {
      const { parent, idx } = resolvePath(commands, path);
      const item = parent[idx];
      setDialog({ type: 'edit', parent, idx });
      setDlgName(item.name || '');
      setDlgCmd(item.command || '');
      setDlgAddCR(item.addCR !== false);
      return;
    }

    if (action === 'editGroup' && type === 'group') {
      const { parent, idx } = resolvePath(commands, path);
      setDialog({ type: 'editGroup', contextPath: path });
      setDlgName(parent[idx].name || '');
      setDlgCmd('');
      setDlgAddCR(true);
      return;
    }

    if (action === 'delete') {
      try {
        const list = structuredClone(commands);
        const r = resolvePath(list, path);
        r.parent.splice(r.idx, 1);
        // 保持直接调用：失败要能抛出走下面的「删除失败」回滚，不能用吞异常的 saveCommands
        await AppGo.SaveQuickCommands(JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('quick-commands-changed'));
        setCommands(list);
        setSelectedPath(null);
        if (addToast) addToast(t('已删除'), 'success', 1500);
      } catch {
        // 删除失败，重新从文件加载以确保状态一致
        const data = await loadCommands();
        if (data.length > 0) setCommands(data);
        if (addToast) addToast(t('删除失败'), 'error', 2000);
      }
      return;
    }

    if (action === 'execute') {
      const { item } = resolvePath(commands, path);
      if (item && item.command) doExecute(item);
      return;
    }
  };

  // ── 对话框保存 ──────────────────────────────────────
  const handleDlgSave = () => {
    if (!dialog) return;
    if (!dlgName.trim()) return;
    const isGroup = dialog.type === 'addGroup' || dialog.type === 'editGroup';

    if (isGroup) {
      // 添加/编辑分组：只需要名称
      if (dialog.type === 'addGroup') {
        const list = structuredClone(dialog.parentList || commands);
        const parts = (dialog.contextPath || '').split('/').map(Number);
        if (dialog.contextPath && parts.length === 1 && list[parts[0]]?.type === 'group') {
          list[parts[0]].children = [...(list[parts[0]].children || []), { type: 'group', name: dlgName.trim(), expanded: true, children: [], last_modified: Date.now() }];
        } else if (dialog.contextPath) {
          let cur = list;
          for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]].children || [];
          cur.splice(parts[parts.length - 1] + 1, 0, { type: 'group', name: dlgName.trim(), expanded: true, children: [], last_modified: Date.now() });
        } else {
          list.push({ type: 'group', name: dlgName.trim(), expanded: true, children: [], last_modified: Date.now() });
        }
        save(list);
      } else if (dialog.type === 'editGroup') {
        const list = cloneAlongPath(commands, dialog.contextPath || '');
        const r = resolvePath(list, dialog.contextPath || '');
        r.parent[r.idx].name = dlgName.trim();
        r.parent[r.idx].last_modified = Date.now();
        save(list);
      }
      setDialog(null);
      return;
    }

    // 命令：需要名称和命令内容
    if (!dlgCmd.trim()) return;
    const newItem: QuickCommandItem = { name: dlgName.trim(), command: dlgCmd.trim(), addCR: dlgAddCR, last_modified: Date.now() };

    if (dialog.type === 'add') {
      dialog.targetChildren?.push(newItem);
      save(dialog.parentList || commands);
    } else if (dialog.type === 'edit') {
      const list = cloneAlongPath(commands, selectedPath || '');
      const r = resolvePath(list, selectedPath || '');
      r.parent[r.idx] = { ...r.parent[r.idx], ...newItem };
      setEditCmdName(newItem.name || '');
      setEditCmdText(newItem.command || '');
      setDirty(false);
      save(list);
    }
    setDialog(null);
  };

  // ── 执行命令（使用底部内联参数值）────────────────────
  const doExecute = (item: QuickCommandItem) => {
    if (!item?.command) return;
    sendCommand(item.command, paramValues, item.addCR !== false);
  };

  const sendCommand = (cmd: string, values: Record<number, string>, addCR: boolean) => {
    const filled = fillQuickCommandParams(cmd, values);
    const finalCmd = addCR !== false ? filled + '\r' : filled;

    // 保存参数历史（每个参数存为数组，用于下拉列表）
    if (Object.keys(values).length > 0) {
      const pHist: Record<string, Record<string, string[]>> = { ...paramHistory, [cmd]: { ...(paramHistory[cmd] || {}) } };
      Object.entries(values).forEach(([num, val]) => {
        if (!val) return;
        const arr = pHist[cmd][num] || [];
        // 去重：移除相同值，再插入到最前面
        const filtered = arr.filter(v => v !== val);
        filtered.unshift(val);
        // 最多保留 20 条
        pHist[cmd][num] = filtered.slice(0, QUICK_COMMAND_PARAM_HISTORY_LIMIT);
      });
      setParamHistory(pHist);
      AppGo.SaveParamHistory(JSON.stringify(pHist)).catch(() => {});
    }

    const timestamp = new Date().toISOString();
    if (sendTarget === 'all' && connectedSessions.length > 0) {
      // 发送到全部：为每个目标服务器按其归组 id 派发历史事件，
      // 避免只记录一台服务器；WriteTerminal 写入各自会话。
      connectedSessions.forEach(s => {
        AppGo.WriteTerminal(s.id, finalCmd).catch((err) => {
          console.error('WriteTerminal failed:', err);
        });
        window.dispatchEvent(new CustomEvent('ssh-command-history', {
          detail: { sessionId: s.id, command: filled, time: timestamp, source: 'input' }
        }));
      });
      if (addToast) addToast(t('已发送到 ') + connectedSessions.length + t(' 个会话'), 'info', 2000);
    } else {
      // 当前目标：写入活动终端；历史事件用父会话归组 id，避免副终端快捷命令不入历史
      AppGo.WriteTerminal(sessionId, finalCmd).catch((err) => {
        console.error('WriteTerminal failed:', err);
      });
      window.dispatchEvent(new CustomEvent('ssh-command-history', {
        detail: { sessionId: historySessionId || sessionId, command: filled, time: timestamp, source: 'input' }
      }));
      if (addToast) addToast(t('已发送指令到终端'), 'info', 2000);
    }
  };

  // ── 命令编辑器：发送临时命令（不保存） ────────────────
  const sendEditorCommand = useCallback(() => {
    const cmd = cmdEditorText.replace(/\r\n?/g, '\n');
    const text = cmd.trim();
    if (!text) return;
    const finalCmd = cmdEditorAddCR ? (text + '\r') : text;
    const timestamp = new Date().toISOString();
    if (sendTarget === 'all' && connectedSessions.length > 0) {
      connectedSessions.forEach(s => {
        AppGo.WriteTerminal(s.id, finalCmd).catch((err) => {
          console.error('WriteTerminal failed:', err);
        });
        window.dispatchEvent(new CustomEvent('ssh-command-history', {
          detail: { sessionId: s.id, command: text, time: timestamp, source: 'input' }
        }));
      });
      if (addToast) addToast(t('已发送到 ') + connectedSessions.length + t(' 个会话'), 'info', 2000);
    } else {
      AppGo.WriteTerminal(sessionId, finalCmd).catch((err) => {
        console.error('WriteTerminal failed:', err);
      });
      window.dispatchEvent(new CustomEvent('ssh-command-history', {
        detail: { sessionId: historySessionId || sessionId, command: text, time: timestamp, source: 'input' }
      }));
      if (addToast) addToast(t('已发送'), 'info', 1500);
    }
    if (cmdEditorClearAfterSend) setCmdEditorText('');
  }, [addToast, cmdEditorAddCR, cmdEditorClearAfterSend, cmdEditorText, connectedSessions, sendTarget, sessionId, historySessionId, t]);

  // ── 插入参数按钮 ────────────────────────────────────
  const insertParam = (n: number) => {
    const tag = `[p#${n} ${t('参数')}${n}]`;
    setDlgCmd(prev => prev + tag);
  };

  // ── 通用样式 ──────────────────────────────────────
  const inputClass =
    'w-full box-border px-2 py-[5px] text-xs rounded-xs bg-sunken border border-line text-primary outline-none font-[inherit]';

  const selectedItem = useMemo(() => getSelectedItem(), [selectedPath, commands]);

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="flex flex-col h-full bg-overlay overflow-hidden font-sans"
    >
      {/* ── 工具栏 ── */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-line-subtle shrink-0">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            closeContextMenu();
            const list = structuredClone(commands);
            const sel = selectedPath ? resolvePath(list, selectedPath) : null;
            if (sel?.item?.type === 'group') {
              if (!sel.item.children) sel.item.children = [];
              setDialog({ type: 'add', targetChildren: sel.item.children, parentList: list, groupName: sel.item.name });
            } else {
              setDialog({ type: 'add', targetChildren: list, parentList: list, groupName: '' });
            }
            setDlgName(''); setDlgCmd(''); setDlgAddCR(true);
          }}
        >{t('＋ 添加命令')}</Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { closeContextMenu(); setDialog({ type: 'addGroup', contextPath: '', parentList: commands }); setDlgName(''); setDlgCmd(''); setDlgAddCR(true); }}
        ><FolderPlus size={14} /> {t('添加分组')}</Button>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={showCmdEditor}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            closeContextMenu();
            // 切换命令编辑器时，始终先收起「选项」菜单
            setCmdEditorShowOpts(false);
            setShowCmdEditor((v) => !v);
          }}
        >{t('命令编辑器')}</Button>
        {/* 固定命令条开关：把命令常驻显示在终端输入框上方 */}
        <Tiptop text={showCmdBar ? t('取消在终端固定显示命令') : t('在终端固定显示命令, 点击后确认发送')}>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={showCmdBar}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              closeContextMenu();
              const next = !showCmdBar;
              setShowCmdBar(next);
              localStorage.setItem('terminalQuickCmdBar', String(next));
              window.dispatchEvent(new CustomEvent('quick-cmd-bar-changed', { detail: next }));
            }}
          ><List size={14} /> {t('固定到终端')}</Button>
        </Tiptop>
        <div className="flex-1" />
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5"
            onClick={() => {
              if (dirty) {
                setConfirmUnsaved({ close: true });
                return;
              }
              onClose();
            }}
            aria-label={t('关闭')}
          >
            <X size={14} />
          </Button>
        )}
      </div>

      {/* ── 主体：左右分栏 / 命令编辑器 ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {showCmdEditor ? (
          /* 内嵌命令编辑器（占满面板，不居中弹窗） */
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="p-3 flex-1 min-h-0 flex">
              <textarea
                id="qc-cmd-editor"
                name="qc-cmd-editor"
                value={cmdEditorText}
                onChange={(e) => setCmdEditorText(e.target.value)}
                autoFocus
                spellCheck={false}
                placeholder={t('在此输入要发送的命令…')}
                className={`${inputClass} flex-1 min-h-0 resize-none font-mono text-base leading-[1.55]`}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowCmdEditor(false);
                    setCmdEditorShowOpts(false);
                    return;
                  }
                  // Ctrl/Cmd + Enter 发送
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    sendEditorCommand();
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border-t border-line-subtle shrink-0 relative">
              <div className="relative" ref={cmdEditorOptsRef}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCmdEditorShowOpts((v) => !v)}
                >{t('选项')}</Button>
                {cmdEditorShowOpts && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute left-0 bottom-[calc(100%+6px)] z-[2] min-w-[190px] px-2.5 py-2 bg-overlay border border-line rounded-md shadow-md flex flex-col gap-2"
                  >
                    <div className="text-xs text-muted select-none">
                      {t('按Ctrl+Enter发送')}
                    </div>
                    <label className="flex items-center gap-1.5 text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        name="qc-clear-after-send"
                        checked={cmdEditorClearAfterSend}
                        onChange={(e) => setCmdEditorClearAfterSend(e.target.checked)}
                        className="accent-success"
                      />
                      {t('发送后清空')}
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        name="qc-add-cr-editor"
                        checked={cmdEditorAddCR}
                        onChange={(e) => setCmdEditorAddCR(e.target.checked)}
                        className="accent-success"
                      />
                      {t('末尾添加回车符CR')}
                    </label>
                  </div>
                )}
              </div>
              <div className="flex-1" />
              <span className="text-xs text-muted">{t('发送到')}</span>
              <select
                id="qc-send-target-editor"
                name="qc-send-target-editor"
                value={sendTarget}
                onChange={(e) => setSendTarget(e.target.value as 'current' | 'all')}
                className="text-xs px-2 py-[3px] rounded-xs bg-sunken border border-line text-primary outline-none cursor-pointer"
              >
                <option value="current">{t('当前会话')}</option>
                {connectedSessions.length > 1 && (
                  <option value="all">{t('全部会话')} ({connectedSessions.length})</option>
                )}
              </select>
              <Button
                variant="primary"
                size="sm"
                onClick={sendEditorCommand}
                disabled={!cmdEditorText.trim()}
              ><Rocket size={14} /> {t('发送')}</Button>
            </div>
          </div>
        ) : (
          <>
        {/* ── 左侧树形列表 ── */}
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setSelectedPath(null); closeContextMenu(); } }}
          onDragOver={(e) => { e.preventDefault(); setRootDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); setRootDragOver(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setRootDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); handleDropToRoot(); }}
          className={`w-[220px] shrink-0 border-r border-line-subtle overflow-y-auto px-1.5 py-1 flex flex-col transition-colors duration-100 ${
            rootDragOver ? 'bg-active outline outline-1 outline-dashed outline-accent' : 'bg-sunken'
          }`}
        >
          {/* 搜索框 */}
          <div className="px-0.5 pt-0.5 pb-1.5 shrink-0">
            <input
              type="text"
              name="qc-search"
              aria-label={t('搜索命令...')}
              autoComplete="off"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={t('搜索命令...')}
              className={`${inputClass} px-2 py-1 rounded-sm`}
            />
          </div>
          {/* 命令树（带搜索过滤） */}
          <div
            className="flex-1 overflow-y-auto"
            onDragOver={(e) => { e.preventDefault(); setRootDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setRootDragOver(true); }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setRootDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); handleDropToRoot(); }}
          >
            {(() => {
              const displayed = filterTree(commands, searchText);
              return displayed.length === 0 ? (
                <div className="p-4 text-center text-muted text-sm">
                  {searchText ? t('无匹配结果') : t('点击上方按钮添加命令')}
                </div>
              ) : (
                displayed.map((item, i) => (
                  <TreeNode
                    key={item.name + '_' + i}
                    item={item}
                    index={i}
                    path={String(i)}
                    selectedPath={selectedPath}
                    onSelect={handleSelect}
                    onExecute={doExecute}
                    contextMenu={contextMenu}
                    onContextMenu={handleContextMenu}
                    closeContextMenu={closeContextMenu}
                    onMove={handleMove}
                    onDragStart={handleDragStart}
                    onDropItem={handleDropItem}
                    onDragEnd={clearDrag}
                    dragVersion={dragVersion}
                  />
                ))
              );
            })()}
          </div>
        </div>

        {/* ── 右侧编辑器 ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* 选中了分组 → 显示分组信息 */}
          {selectedItem && selectedItem.type === 'group' ? (
            <div className="flex-1 flex flex-col px-3.5 py-3 gap-2.5 min-h-0 overflow-auto">
              <div>
                <label htmlFor="qc-group-name" className="block mb-1 text-xs text-secondary">{t('分组名称')}</label>
                <input
                  id="qc-group-name"
                  name="qc-group-name"
                  type="text"
                  autoComplete="off"
                  value={editGroupName}
                  onChange={e => setEditGroupName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-1.5 mt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const list = structuredClone(commands);
                    const r = resolvePath(list, selectedPath || '');
                    r.parent[r.idx].name = editGroupName.trim() || selectedItem.name || '';
                    save(list);
                  }}
                ><Save size={13} /> {t('保存名称')}</Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const list = structuredClone(commands);
                    const r = resolvePath(list, selectedPath || '');
                    if (r.item) {
                      if (!r.item.children) r.item.children = [];
                      setDialog({ type: 'add', targetChildren: r.item.children, parentList: list, groupName: r.item.name });
                    }
                    setDlgName(''); setDlgCmd(''); setDlgAddCR(true);
                  }}
                >{t('＋ 添加命令')}</Button>
              </div>
              <div className="text-sm text-muted mt-2">
                {selectedItem.children?.length || 0} {t('个命令/子分组')}
              </div>
            </div>
          ) : selectedItem ? (
            /* 选中命令：内容可滚，发送栏固定在底部（不随滚动悬浮） */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto px-3 py-2.5 flex flex-col gap-2">
              {/* 第一行：命令名徽章 + 命令预览 + 编辑 */}
              <div className="flex items-center gap-2 shrink-0 px-2.5 py-2 bg-sunken border border-line rounded-md">
                <span className="badge shrink-0">
                  {editCmdName || selectedItem.name || t('未命名命令')}
                </span>
                <span
                  className="flex-1 min-w-0 font-mono text-sm text-primary overflow-hidden text-ellipsis whitespace-nowrap"
                  title={editCmdText || selectedItem.command || ''}
                >
                  {editCmdText || selectedItem.command || ''}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setDialog({ type: 'edit' });
                    setDlgName(editCmdName || selectedItem.name || '');
                    setDlgCmd(editCmdText || selectedItem.command || '');
                    setDlgAddCR(selectedItem.addCR !== false);
                  }}
                ><SquarePen size={13} /> {t('编辑')}</Button>
              </div>

              {/* 第二行：参数输入（标签在框外，输入框 + 历史） */}
              {(() => {
                const params = extractQuickCommandParams(editCmdText || selectedItem.command || '');
                if (params.length === 0) {
                  return (
                    <div className="flex-1 min-h-3" />
                  );
                }
                const cmdKey = editCmdText || selectedItem.command || '';
                return (
                  <div className="overflow-x-auto overflow-y-visible shrink-0 pb-1">
                    <div className="flex gap-3 flex-wrap items-end">
                      {params.map(p => {
                        const isOpen = historyDropdown?.cmdKey === cmdKey && historyDropdown.paramNum === p.num;
                        const histList = (paramHistory[cmdKey]?.[p.num]) || [];
                        return (
                          <div key={p.num} className="relative shrink-0">
                            <span className="text-sm font-semibold text-primary block mb-1">
                              {p.label || `${t('参数')}${p.num}`}
                            </span>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                name={`qc-param-${p.num}`}
                                autoComplete="off"
                                value={paramValues[p.num] || ''}
                                onChange={e => setParamValues(prev => ({ ...prev, [p.num]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') doExecute(selectedItem); }}
                                placeholder={p.label || `p#${p.num}`}
                                className={`${inputClass} w-[120px] font-mono bg-raised border-line`}
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-pressed={isOpen}
                                data-history-dropdown="true"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isOpen) {
                                    setHistoryDropdown(null);
                                    setHistorySearch('');
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHistoryDropdown({
                                      cmdKey,
                                      paramNum: p.num,
                                      left: Math.max(8, Math.min(rect.left, window.innerWidth - 220)),
                                      top: Math.min(rect.bottom + 4, window.innerHeight - 240),
                                    });
                                    setHistorySearch('');
                                  }
                                }}
                              >{t('历史')}</Button>
                            </div>
                            {isOpen && createPortal(
                              <div
                                data-history-dropdown="true"
                                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  position: 'fixed',
                                  left: historyDropdown.left ?? 0,
                                  top: historyDropdown.top ?? 0,
                                  zIndex: Z.MENU,
                                }}
                                className="w-[220px] max-h-[220px] flex flex-col box-border overflow-hidden bg-raised border border-line rounded-md shadow-md"
                              >
                                <div className="p-1.5 shrink-0 border-b border-line-subtle">
                                  <input
                                    type="text"
                                    name="qc-history-search"
                                    aria-label={t('搜索历史...')}
                                    autoComplete="off"
                                    autoFocus
                                    value={historySearch}
                                    onChange={e => setHistorySearch(e.target.value)}
                                    placeholder={t('搜索历史...')}
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') { setHistoryDropdown(null); setHistorySearch(''); }
                                    }}
                                    className={`${inputClass} px-2 py-[5px] rounded-sm`}
                                  />
                                </div>
                                <div
                                  onClick={() => {
                                    const pHist: Record<string, Record<string, string[]>> = { ...paramHistory, [cmdKey]: { ...(paramHistory[cmdKey] || {}) } };
                                    if (pHist[cmdKey][p.num]) {
                                      pHist[cmdKey][p.num] = [];
                                      setParamHistory(pHist);
                                      AppGo.SaveParamHistory(JSON.stringify(pHist)).catch(() => {});
                                    }
                                    setHistoryDropdown(null);
                                    setHistorySearch('');
                                  }}
                                  className="px-3 py-1.5 text-sm text-danger cursor-pointer border-b border-line-subtle shrink-0 font-semibold hover:bg-danger-dim transition-colors duration-100"
                                >{t('清空列表')}</div>
                                <div className="flex-1 overflow-y-auto">
                                  {(() => {
                                    const filtered = historySearch
                                      ? histList.filter(v => v.toLowerCase().includes(historySearch.toLowerCase()))
                                      : histList;
                                    return filtered.length === 0 ? (
                                      <div className="px-3 py-2 text-sm text-muted">
                                        {historySearch ? t('无匹配结果') : t('暂无历史')}
                                      </div>
                                    ) : filtered.map((val, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center border-b border-line-subtle"
                                      >
                                        <div
                                          title={val}
                                          onClick={() => {
                                            setParamValues(prev => ({ ...prev, [p.num]: val }));
                                            setHistoryDropdown(null);
                                            setHistorySearch('');
                                          }}
                                          className="flex-1 min-w-0 px-3 py-[7px] text-sm text-primary cursor-pointer font-mono whitespace-nowrap overflow-hidden text-ellipsis hover:bg-hover transition-colors duration-100"
                                        >{val}</div>
                                        <button
                                          type="button"
                                          title={t('删除')}
                                          aria-label={t('删除')}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const pHist: Record<string, Record<string, string[]>> = { ...paramHistory, [cmdKey]: { ...(paramHistory[cmdKey] || {}) } };
                                            pHist[cmdKey][p.num] = (pHist[cmdKey][p.num] || []).filter(v => v !== val);
                                            setParamHistory(pHist);
                                            AppGo.SaveParamHistory(JSON.stringify(pHist)).catch(() => {});
                                          }}
                                          className="shrink-0 self-stretch inline-flex items-center px-2 border-0 border-l border-line-subtle bg-transparent text-danger cursor-pointer hover:bg-danger-dim transition-colors duration-100"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              </div>,
                              document.body
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              </div>

              {/* 第三行：CR + 发送目标 + 发送（固定在右侧底部，不随内容滚动） */}
              <div className="flex items-center gap-2 shrink-0 px-3 py-2 border-t border-line-subtle bg-overlay">
                <label className="text-xs text-secondary flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    name="qc-dialog-add-cr"
                    checked={selectedItem.addCR !== false}
                    onChange={(e) => {
                      const list = structuredClone(commands);
                      const r = resolvePath(list, selectedPath || '');
                      r.parent[r.idx].addCR = e.target.checked;
                      save(list);
                    }}
                    className="accent-success"
                  />
                  {t('末尾添加回车符CR')}
                </label>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">{t('发送到')}</span>
                  <select
                    id="qc-send-target-detail"
                    name="qc-send-target-detail"
                    value={sendTarget}
                    onChange={(e) => setSendTarget(e.target.value as 'current' | 'all')}
                    className="text-xs px-1.5 py-0.5 rounded-xs bg-sunken border border-line text-primary outline-none cursor-pointer"
                  >
                    <option value="current">{t('当前会话')}</option>
                    {connectedSessions.length > 1 && (
                      <option value="all">{t('全部会话')} ({connectedSessions.length})</option>
                    )}
                  </select>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => doExecute(selectedItem)}
                ><Rocket size={14} /> {t('发送')}</Button>
              </div>
            </div>
          ) : (
            /* 未选中任何项 */
            <EmptyState
              className="flex-1 text-primary"
              icon={(
                <span className="flex items-center justify-center w-16 h-16 rounded-full bg-sunken border border-line-subtle text-accent">
                  <Zap size={26} />
                </span>
              )}
              text={t('选择左侧命令或添加新命令')}
            />
          )}
        </div>
          </>
        )}
      </div>

      {/* ── 右键上下文菜单 ── */}
      {contextMenu && createPortal(
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          minWidth={160}
          onClose={closeContextMenu}
          items={contextMenu.type === 'group' ? ([
            { label: t('＋ 添加命令'), onSelect: () => doContextAction('addCmd') },
            { label: t('添加子分组'), icon: <FolderPlus size={14} />, onSelect: () => doContextAction('addGroup') },
            'separator',
            { label: t('重命名分组'), icon: <Pencil size={14} />, onSelect: () => doContextAction('editGroup') },
            'separator',
            { label: t('删除分组'), icon: <Trash2 size={14} />, danger: true, onSelect: () => doContextAction('delete') },
          ] as MenuItem[]) : ([
            { label: t('执行'), icon: <Rocket size={14} />, onSelect: () => doContextAction('execute') },
            { label: t('编辑'), icon: <SquarePen size={14} />, onSelect: () => doContextAction('edit') },
            'separator',
            { label: t('删除'), icon: <Trash2 size={14} />, danger: true, onSelect: () => doContextAction('delete') },
          ] as MenuItem[])}
        />,
        document.body
      )}

      {/* ── 未保存修改确认对话框 ── */}
      {confirmUnsaved && (
        <Modal
          open
          size="sm"
          zIndex={Z.DIALOG}
          onClose={handleConfirmCancel}
          title={t('未保存的修改')}
        >
          <div className="text-sm text-secondary">
            {t('当前命令有未保存的修改，是否保存？')}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={handleConfirmCancel}>{t('取消')}</Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDiscard}>{t('不保存')}</Button>
            <Button variant="primary" size="sm" onClick={handleConfirmSave}>{t('保存')}</Button>
          </div>
        </Modal>
      )}

      {/* ── 添加/编辑对话框（覆盖层） ── */}
      {dialog && (
        <Modal
          open
          zIndex={Z.DIALOG}
          onClose={() => { setShowGroupPicker(false); setDialog(null); }}
          panelClassName="max-w-[480px]"
          title={
            dialog.type === 'addGroup' ? t('添加分组')
              : dialog.type === 'editGroup' ? t('重命名分组')
                : dialog.type === 'add' ? t('添加命令')
                  : t('编辑命令')
          }
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowGroupPicker(false); setDialog(null); }}
              >{t('取消')}</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDlgSave}
                disabled={!dlgName.trim() || (dialog.type !== 'addGroup' && dialog.type !== 'editGroup' && !dlgCmd.trim())}
              >{t('保存')}</Button>
            </>
          }
        >
          {/* 添加到提示（仅添加命令时显示） */}
          {dialog.type === 'add' && (
            <div className="text-sm text-muted select-none">
              <span className="mr-1.5">{t('添加到:')}</span>
              <span
                ref={groupPickerRef}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setGroupPickerPos({ x: rect.left, y: rect.bottom + 4 });
                  setShowGroupPicker(prev => !prev);
                }}
                className="badge cursor-pointer select-none"
              >
                {dialog.groupName || t('根目录')}
                <span className="text-[8px] opacity-70">▼</span>
              </span>
            </div>
          )}

          {/* 名称 */}
          <div>
            <label htmlFor="qc-dlg-name" className="block mb-1 text-xs text-secondary">{t('名称')}</label>
            <input
              id="qc-dlg-name"
              name="qc-dlg-name"
              type="text"
              autoComplete="off"
              value={dlgName}
              onChange={e => setDlgName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDlgSave(); } }}
              autoFocus
              className={inputClass}
              placeholder={dialog.type === 'addGroup' || dialog.type === 'editGroup' ? t('如：系统监控') : t('如：查看内存')}
            />
          </div>

          {/* 命令区域（仅命令类型显示） */}
          {dialog.type !== 'addGroup' && dialog.type !== 'editGroup' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="qc-dlg-cmd" className="block text-xs text-secondary">{t('命令')}</label>
                <div className="flex gap-[3px]">
                  {[1,2,3,4,5].map(n => (
                    <Tiptop key={n} text={t('插入参数 p#') + n}>
                      <button
                        onClick={() => insertParam(n)}
                        aria-label={t('插入参数 p#') + n}
                        className="bg-transparent border border-line rounded-xs text-secondary text-[10px] cursor-pointer px-1.5 py-px font-mono transition-colors duration-100 hover:bg-hover hover:text-primary"
                      >{t('参数')}{n}</button>
                    </Tiptop>
                  ))}
                </div>
              </div>
              <textarea
                id="qc-dlg-cmd"
                name="qc-dlg-cmd"
                value={dlgCmd}
                onChange={e => setDlgCmd(e.target.value)}
                rows={3}
                className={`${inputClass} resize-vertical font-mono leading-normal min-h-[70px]`}
                placeholder={t('如：free -m')}
              />

              {/* 参数预览 */}
              {extractQuickCommandParams(dlgCmd).length > 0 && (
                <div className="mt-1 text-xs text-warning">
                  {t('含')} {extractQuickCommandParams(dlgCmd).length} {t('个动态参数：')}{extractQuickCommandParams(dlgCmd).map(p => `[p#${p.num}${p.label ? ' ' + p.label : ''}]`).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* 末尾添加回车符 */}
          {dialog.type !== 'addGroup' && dialog.type !== 'editGroup' && (
            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-secondary">
              <input
                type="checkbox"
                name="qc-dlg-cr"
                checked={dlgAddCR}
                onChange={e => setDlgAddCR(e.target.checked)}
                className="accent-success"
              />
              {t('末尾添加回车符CR')}
            </label>
          )}

          {/* ── 分组选择器下拉菜单 ── */}
          {showGroupPicker && (
            <>
              {/* 点击外部关闭 */}
              <div
                onClick={() => setShowGroupPicker(false)}
                style={{ position: 'fixed', inset: 0, zIndex: Z.SUBMENU_BACKDROP, background: 'transparent' }}
              />
              <MenuPanel
                minWidth={160}
                className="fixed max-h-[220px]"
                style={{ left: groupPickerPos.x, top: groupPickerPos.y, zIndex: Z.SUBMENU }}
              >
                <MenuList
                  items={[
                    {
                      label: t('根目录'),
                      icon: <Folder size={14} />,
                      onSelect: () => {
                        setDialog(prev => (prev ? { ...prev, targetChildren: prev.parentList, groupName: '' } : prev));
                        setShowGroupPicker(false);
                      },
                    },
                    ...collectGroups(commands).map<MenuItem>((g) => ({
                      label: g.name,
                      icon: <Folder size={14} />,
                      onSelect: () => {
                        setDialog(prev => {
                          if (!prev) return prev;
                          const list = structuredClone(prev.parentList || commands);
                          const r = resolvePath(list, g.path);
                          if (r?.item?.type === 'group') {
                            if (!r.item.children) r.item.children = [];
                            return { ...prev, parentList: list, targetChildren: r.item.children, groupName: g.name };
                          }
                          return prev;
                        });
                        setShowGroupPicker(false);
                      },
                    })),
                  ]}
                  onClose={() => setShowGroupPicker(false)}
                />
              </MenuPanel>
            </>
          )}
        </Modal>
      )}

    </div>
  );
});

export default QuickCommands;
