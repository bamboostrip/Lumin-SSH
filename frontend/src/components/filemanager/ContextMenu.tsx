import React, { useRef, useState, useEffect } from 'react';
import {
  FolderOpen, FilePlus, FileArchive,
  Archive, Download, Lock, SquarePen, PenLine,
  Pin, X, ClipboardPaste, Scissors,
  MonitorSmartphone, PencilLine, FolderPlus, Trash2, Copy,
} from 'lucide-react';
import { Z } from '../../constants/zIndex.ts';
import { clampMenuPosition } from '../../utils/menuPosition.ts';
import { isArchive } from '../../utils/fileTypeClassify.ts';
import { isEditable } from '../../utils/fileManagerHelpers.tsx';
import type { FileManagerFileItem, LooseT } from './fileManagerTypes.ts';

export interface ContextMenuProps {
  pos: { x: number; y: number }
  item: FileManagerFileItem | null
  mode?: string
  isPinned?: boolean
  isSystemPinned?: boolean
  canTogglePinned?: boolean
  canCloseTab?: boolean
  showCreateActions?: boolean
  deleteItemCount?: number
  clipboardItemCount?: number
  canPaste?: boolean
  clipboardActionArrow?: string
  onClose: () => void
  onDownload: () => void
  onEdit: () => void
  onOpenSystemEditor: () => void
  onOpenWithEditor: () => void
  onRename: () => void
  onDelete: () => void
  onDeleteShell: () => void
  onMkdir: () => void
  onNewFile: () => void
  onCompress: () => void
  onUncompress: () => void
  onChmod: () => void
  onCopyPath: () => void
  onCopyItem: () => void
  onCutItem: () => void
  onPaste: () => void
  onOpenInNewTab: () => void
  onTogglePinned: () => void
  onCloseTab: () => void
  t: LooseT
}

// Context menu component
export function ContextMenu({ pos, item, mode = 'item', isPinned = false, isSystemPinned = false, canTogglePinned = false, canCloseTab = false, showCreateActions = false, deleteItemCount = 1, clipboardItemCount = 1, canPaste = false, clipboardActionArrow = '', onClose, onDownload, onEdit, onOpenSystemEditor, onOpenWithEditor, onRename, onDelete, onDeleteShell, onMkdir, onNewFile, onCompress, onUncompress, onChmod, onCopyPath, onCopyItem, onCutItem, onPaste, onOpenInNewTab, onTogglePinned, onCloseTab, t }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [adjusted, setAdjusted] = useState({ left: pos.x, top: pos.y });
  const isTabMenu = mode === 'tab';
  const shouldShowCreateActions = showCreateActions || !item;
  const shouldShowDividerBeforeCreate = Boolean(item && shouldShowCreateActions);
  const shouldShowDeleteActions = Boolean(item) && !isTabMenu;
  const shouldShowDividerBeforeDelete = shouldShowDeleteActions;

  React.useLayoutEffect(() => {
    if (!ref.current) return;
    // 使用 offsetWidth/offsetHeight 测量：菜单带有 scale(0.94) 入场动画，
    // getBoundingClientRect 会拿到变换后的缩小尺寸，导致底部 clamp 不足、末尾项被裁剪
    const clamped = clampMenuPosition(pos.x, pos.y, ref.current.offsetWidth, ref.current.offsetHeight);
    setAdjusted({ left: clamped.x, top: clamped.y });
  }, [pos.x, pos.y]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: adjusted.left, top: adjusted.top, zIndex: Z.MENU }}
    >
      {item && item.isDirectory && (
        <div className="context-menu-item" onClick={onOpenInNewTab}>
          <FolderOpen size={14} /> {t('在新标签页打开')}
        </div>
      )}
      {isTabMenu && canTogglePinned && !isSystemPinned && (
        <div className="context-menu-item" onClick={onTogglePinned}>
          <Pin size={14} /> {isPinned ? t('取消固定') : t('固定')}
        </div>
      )}
      {canCloseTab && (
        <div className="context-menu-item" onClick={onCloseTab}>
          <X size={14} /> {t('关闭标签')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onCopyPath}>
          <Copy size={14} /> {t('复制路径')}
        </div>
      )}
      {item && !isTabMenu && (
        <div className="context-menu-item" onClick={onCopyItem}>
          <Copy size={14} /> {clipboardActionArrow === '<-' ? `${clipboardActionArrow} ${t('复制')}` : `${t('复制')}${clipboardActionArrow ? ` ${clipboardActionArrow}` : ''}`}{clipboardItemCount > 1 ? ` (${clipboardItemCount}${t('项')})` : ''}
        </div>
      )}
      {item && !isTabMenu && (
        <div className="context-menu-item" onClick={onCutItem}>
          <Scissors size={14} /> {clipboardActionArrow === '<-' ? `${clipboardActionArrow} ${t('剪切')}` : `${t('剪切')}${clipboardActionArrow ? ` ${clipboardActionArrow}` : ''}`}{clipboardItemCount > 1 ? ` (${clipboardItemCount}${t('项')})` : ''}
        </div>
      )}
      {!isTabMenu && canPaste && (
        <div className="context-menu-item" onClick={onPaste}>
          <ClipboardPaste size={14} /> {t('粘贴')}
        </div>
      )}
      {item && !item.isDirectory && isEditable(item.name) && (
        <div className="context-menu-item" onClick={onEdit}>
          <SquarePen size={14} /> {t('编辑')}
        </div>
      )}
      {item && !item.isDirectory && (
        <div className="context-menu-item" onClick={onOpenSystemEditor}>
          <MonitorSmartphone size={14} /> {t('系统编辑器打开')}
        </div>
      )}
      {item && !item.isDirectory && (
        <div className="context-menu-item" onClick={onOpenWithEditor}>
          <PencilLine size={14} /> {t('指定编辑器打开')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onDownload}>
          <Download size={14} /> {item.isDirectory ? t('下载文件夹到本地') : t('下载到本地')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onCompress}>
          <Archive size={14} /> {t('压缩 (tar.gz)')}
        </div>
      )}
      {item && !item.isDirectory && isArchive(item.name) && (
        <div className="context-menu-item" onClick={onUncompress}>
          <FileArchive size={14} /> {t('解压')}
        </div>
      )}
      {item && (!isTabMenu || !isSystemPinned) && (
        <div className="context-menu-item" onClick={onRename}>
          <PenLine size={14} /> {isTabMenu ? t('重命名标签标题') : t('重命名')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onChmod}>
          <Lock size={14} /> {t('修改权限')}
        </div>
      )}
      {shouldShowDividerBeforeCreate && <div className="context-menu-divider" />}
      {shouldShowCreateActions && (
        <div className="context-menu-item" onClick={onNewFile}>
          <FilePlus size={14} /> {t('新建文件')}
        </div>
      )}
      {shouldShowCreateActions && (
        <div className="context-menu-item" onClick={onMkdir}>
          <FolderPlus size={14} /> {t('新建文件夹')}
        </div>
      )}
      {shouldShowDividerBeforeDelete && <div className="context-menu-divider" />}
      {shouldShowDeleteActions && (
        <div className="context-menu-item danger" onClick={onDelete}>
          <Trash2 size={14} /> {t('删除')}{deleteItemCount > 1 ? ` (${deleteItemCount}${t('项')})` : ''}
        </div>
      )}
    </div>
  );
}
