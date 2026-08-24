import React from 'react';
import { CheckSquare, Clipboard, Copy, ExternalLink, MessageSquarePlus, Search, Trash2 } from 'lucide-react';
import type { Terminal as XTerm } from '@xterm/xterm';
import { Z } from '../../constants/zIndex.ts';
import { formatShortcut } from '../../utils/platform.ts';
import { DEFAULT_TERMINAL_SHORTCUTS } from '../../utils/terminalHelpers.ts';
import type { I18nKey } from '../../i18n.ts';

type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string

export type TerminalContextMenuItem =
  | { type: 'separator' }
  | {
      type: 'action'
      icon: React.ReactNode
      label: string
      action: string
      shortcut?: string
      disabled?: boolean
    }

// ── 右键上下文菜单（增强版：图标 + 边界检测 + disabled 状态）──
// 从 Terminal.tsx 原样搬移。
interface TerminalContextMenuProps {
  contextMenu: { x: number; y: number; source: 'terminal' | 'input' }
  contextHasSelection: boolean
  handleMenuAction: (action: string) => void
  shortcutsRef: React.RefObject<Record<string, string> | null>
  t: LooseT
}

export function TerminalContextMenu({
  contextMenu,
  contextHasSelection,
  handleMenuAction,
  shortcutsRef,
  t,
}: TerminalContextMenuProps) {
  return (
    <div
      className="context-menu"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        backgroundColor: 'var(--term-context-bg)',
        border: 'var(--term-context-border)',
        borderRadius: '8px',
        boxShadow: 'var(--term-context-shadow)',
        zIndex: Z.MENU,
        padding: '4px 0',
        minWidth: '190px',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {(contextMenu?.source === 'input'
        ? ([
            { type: 'action', icon: <Trash2 size={13} />, label: t('剪切'), action: 'cut', shortcut: formatShortcut('Ctrl+X'), disabled: !contextHasSelection },
            { type: 'action', icon: <Copy size={13} />, label: t('复制'), action: 'copy', shortcut: formatShortcut('Ctrl+C'), disabled: !contextHasSelection },
            { type: 'action', icon: <Clipboard size={13} />, label: t('粘贴'), action: 'paste', shortcut: formatShortcut('Ctrl+V') },
            { type: 'separator' },
            { type: 'action', icon: <CheckSquare size={13} />, label: t('全选'), action: 'selectAll', shortcut: formatShortcut('Ctrl+A'), disabled: !contextHasSelection },
          ] as TerminalContextMenuItem[])
        : ([
            { type: 'action', icon: <Copy size={13} />, label: t('复制'), action: 'copy', shortcut: formatShortcut('Ctrl+C'), disabled: !contextHasSelection },
            { type: 'action', icon: <Clipboard size={13} />, label: t('粘贴'), action: 'paste', shortcut: formatShortcut('Ctrl+V') },
            { type: 'action', icon: <Clipboard size={13} />, label: t('粘贴所选项'), action: 'pasteSelection', shortcut: formatShortcut(shortcutsRef.current?.pasteSelection || DEFAULT_TERMINAL_SHORTCUTS.pasteSelection), disabled: !contextHasSelection },
            { type: 'separator' },
            { type: 'action', icon: <CheckSquare size={13} />, label: t('全选'), action: 'selectAll' },
            { type: 'action', icon: <Search size={13} />, label: t('查找'), action: 'find', shortcut: formatShortcut(shortcutsRef.current?.find || 'Ctrl+F') },
            { type: 'action', icon: <MessageSquarePlus size={13} />, label: t('添加到 AI助手'), action: 'sendToAssistant', disabled: !contextHasSelection },
            { type: 'action', icon: <Trash2 size={13} />, label: t('清空屏幕'), action: 'clear', shortcut: formatShortcut('Ctrl+L') },
          ] as TerminalContextMenuItem[])).map((item, idx) =>
        item.type === 'separator' ? (
          <div key={idx} className="context-menu-separator" />
        ) : (
          <div
            key={idx}
            className={`context-menu-item${item.disabled ? ' disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) handleMenuAction(item.action);
            }}
          >
            <span className="item-icon">{item.icon}</span>
            <span className="item-label">{item.label}</span>
            {item.shortcut && <span className="item-shortcut">{item.shortcut}</span>}
          </div>
        )
      )}
    </div>
  );
}

// ── 终端链接菜单：复制 / 打开（对齐安卓）──
interface TerminalLinkMenuProps {
  linkMenu: { x: number; y: number; url: string }
  setLinkMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; url: string } | null>>
  termRef: React.RefObject<XTerm | null>
  handleLinkMenuAction: (action: string) => void
  t: LooseT
}

export function TerminalLinkMenu({
  linkMenu,
  setLinkMenu,
  termRef,
  handleLinkMenuAction,
  t,
}: TerminalLinkMenuProps) {
  return (
    <>
      {/* 透明遮罩：挡住终端拖选，点击空白关闭 */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: Z.MENU_BACKDROP,
          background: 'transparent',
          cursor: 'default',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          try { termRef.current?.clearSelection(); } catch (_) {}
          setLinkMenu(null);
        }}
        onMouseMove={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <div
        className="context-menu"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: linkMenu.x,
          top: linkMenu.y,
          backgroundColor: 'var(--term-context-bg)',
          border: 'var(--term-context-border)',
          borderRadius: '8px',
          boxShadow: 'var(--term-context-shadow)',
          zIndex: Z.MENU,
          padding: '4px 0',
          minWidth: '200px',
          maxWidth: '360px',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <div
          style={{
            padding: '6px 12px 4px',
            fontSize: 11,
            color: 'var(--text-muted, #8899aa)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={linkMenu.url}
        >
          {linkMenu.url}
        </div>
        <div className="context-menu-separator" />
        <div
          className="context-menu-item"
          onClick={(e) => {
            e.stopPropagation();
            handleLinkMenuAction('copy');
          }}
        >
          <span className="item-icon"><Copy size={13} /></span>
          <span className="item-label">{t('复制')}</span>
        </div>
        <div
          className="context-menu-item"
          onClick={(e) => {
            e.stopPropagation();
            handleLinkMenuAction('open');
          }}
        >
          <span className="item-icon"><ExternalLink size={13} /></span>
          <span className="item-label">{t('打开')}</span>
        </div>
      </div>
    </>
  );
}

// ── 链接已复制 toast ──
export function TerminalLinkToast({ linkToast }: { linkToast: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 56,
        transform: 'translateX(-50%)',
        background: 'var(--term-context-bg, rgba(20,24,32,0.92))',
        border: 'var(--term-context-border, 1px solid rgba(255,255,255,0.08))',
        color: 'var(--text-primary, #eaf0f7)',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 12,
        zIndex: Z.POPUP,
        pointerEvents: 'none',
        boxShadow: 'var(--term-context-shadow)',
      }}
    >
      {linkToast}
    </div>
  );
}
