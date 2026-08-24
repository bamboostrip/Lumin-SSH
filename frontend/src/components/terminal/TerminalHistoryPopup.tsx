import React from 'react';
import { Clipboard, Play, X } from 'lucide-react';
import * as AppGo from '../../../wailsjs/go/wailsapp/App.js';
import { Z } from '../../constants/zIndex.ts';
import { btnStyle, iconBtnStyle } from '../../utils/terminalHelpers.ts';
import { ToggleSwitch } from '../settings/SharedComponents.tsx';
import Tiptop from '../Tiptop.tsx';
import type { I18nKey } from '../../i18n.ts';

type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string

interface HistoryItem {
  id: string
  command: string
}

// 历史指令弹窗（fixed 定位，不受 overflow:hidden 裁剪）。从 Terminal.tsx 原样搬移。
interface TerminalHistoryPopupProps {
  historyPopupPos: { left: number; bottom: number }
  historyPopupRef: React.RefObject<HTMLDivElement | null>
  historyScrollRef: React.RefObject<HTMLDivElement | null>
  historySearchInputRef: React.RefObject<HTMLInputElement | null>
  altOpenHistoryEnabled: boolean
  setAltOpenHistoryEnabled: React.Dispatch<React.SetStateAction<boolean>>
  historyMode: 'server' | 'global'
  setHistoryMode: React.Dispatch<React.SetStateAction<'server' | 'global'>>
  setHistoryList: React.Dispatch<React.SetStateAction<HistoryItem[]>>
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>
  setHistoryPopupPos: React.Dispatch<React.SetStateAction<{ left: number; bottom: number } | null>>
  filteredHistory: HistoryItem[]
  displayHistory: HistoryItem[]
  searchQuery: string
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>
  historySelectedIndex: number
  handleHistorySearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  selectHistoryCmd: (cmd: string) => void
  executeCommand: (directCmd?: string) => void
  deleteHistoryItem: (id: string) => void | Promise<void>
  serverId: string
  historyServerId: string
  t: LooseT
}

export function TerminalHistoryPopup({
  historyPopupPos,
  historyPopupRef,
  historyScrollRef,
  historySearchInputRef,
  altOpenHistoryEnabled,
  setAltOpenHistoryEnabled,
  historyMode,
  setHistoryMode,
  setHistoryList,
  setShowHistory,
  setHistoryPopupPos,
  filteredHistory,
  displayHistory,
  searchQuery,
  setSearchQuery,
  historySelectedIndex,
  handleHistorySearchKeyDown,
  selectHistoryCmd,
  executeCommand,
  deleteHistoryItem,
  serverId,
  historyServerId,
  t,
}: TerminalHistoryPopupProps) {
  return (
    <div ref={historyPopupRef} className="term-popup" style={{
        left: historyPopupPos.left,
        bottom: historyPopupPos.bottom,
        width: 480,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 280,
        boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
        zIndex: Z.POPUP,
        fontFamily: 'var(--font-terminal)',
        fontSize: 12,
      }}>
        {/* 弹窗头部（标题 + 操作按钮） */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid var(--term-separator)',
          flexShrink: 0,
        }}>
          <span style={{ color: 'var(--term-status-color)', fontSize: 11 }}>{t('历史命令')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'var(--term-muted)', fontSize: 11 }}>{t('Alt 打开历史指令')}</span>
              <ToggleSwitch checked={altOpenHistoryEnabled} onChange={() => {
                const enabled = !altOpenHistoryEnabled;
                setAltOpenHistoryEnabled(enabled);
                localStorage.setItem('altOpenHistory', String(enabled));
                window.dispatchEvent(new CustomEvent('alt-open-history-changed', { detail: enabled }));
              }} />
            </div>
            <button
              onClick={async () => {
                const scope = historyMode;
                // 二次确认，与历史页清空行为一致；按作用域给出不同提示
                const msg = scope === 'global'
                  ? t('确定要清空全部服务器的历史指令吗？')
                  : t('确定要清空该服务器的历史指令吗？');
                const result = await window.luminDialog?.confirm(msg);
                const confirmed = typeof result === 'object' ? result?.confirmed : result === true;
                if (!confirmed) return;
                try {
                  if (scope === 'global') {
                    await AppGo.SaveGlobalCommandHistory('[]');
                  } else {
                    await AppGo.SaveCommandHistory(historyServerId, '[]');
                  }
                  setHistoryList([]);
                  // 通知历史页 / 自动补全按作用域刷新（全局清空不触碰服务器历史）
                  window.dispatchEvent(new CustomEvent('ssh-history-cleared', {
                    detail: { sessionId: serverId, historyServerId, scope }
                  }));
                } catch (error) {
                  console.error('[Terminal] 清空历史失败:', error);
                }
              }}
              style={{ ...btnStyle('red'), fontSize: 11, padding: '2px 8px' }}
            >
              {t('清空列表')}
            </button>
            <button
              onClick={() => { setShowHistory(false); setHistoryPopupPos(null); }}
              aria-label={t('关闭')}
              style={btnStyle('red')}
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* 历史列表（可滚动） */}
        <div ref={historyScrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {filteredHistory.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--term-muted)', fontSize: 12 }}>
            {searchQuery ? t('无匹配结果') : t('暂无历史记录')}
          </div>
        ) : displayHistory.map((item, index) => (
          <div
            key={item.id}
            className="history-item"
            data-history-index={index}
            role="option"
            aria-selected={historySelectedIndex === index}
            onClick={() => selectHistoryCmd(item.command)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--term-separator)',
              transition: 'background 0.1s',
              background: historySelectedIndex === index ? 'var(--surface-active)' : undefined,
            }}
          >
            <span
              style={{
                flex: 1,
                color: 'var(--term-input-color)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                paddingRight: 8,
              }}
              title={item.command}
            >
              {item.command}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              {/* 执行（绿色） */}
              <Tiptop text={t('执行')}>
                <button
                  onClick={(e) => { e.stopPropagation(); executeCommand(item.command); }}
                  aria-label={t('执行')}
                  style={{ ...iconBtnStyle('var(--text-secondary)') }}
                >
                  <Play size={12} />
                </button>
              </Tiptop>
              {/* 复制（蓝色） */}
              <Tiptop text={t('复制')}>
                <button
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.command).catch(() => {}); }}
                  aria-label={t('复制')}
                  style={{ ...iconBtnStyle('var(--text-secondary)') }}>
                  <Clipboard size={12} />
                </button>
              </Tiptop>
              {/* 删除（红色） */}
              <Tiptop text={t('删除')}>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                  aria-label={t('删除')}
                  style={{ ...iconBtnStyle('var(--danger)', 'rgba(255,123,114,0.15)') }}
                >
                  <X size={12} />
                </button>
              </Tiptop>
            </div>
          </div>
        ))}
        </div>

        {/* 搜索 + 模式切换 */}
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center',
          padding: '6px 10px',
          borderTop: '1px solid var(--term-separator)',
          flexShrink: 0,
        }}>
          <input
            ref={historySearchInputRef}
            name="terminal-history-search"
            autoComplete="off"
            aria-label={t('搜索命令历史')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleHistorySearchKeyDown}
            placeholder={t('搜索命令...')}
            style={{
              flex: 1,
              padding: '4px 8px',
              background: 'var(--term-input-bg)',
              border: '1px solid var(--term-btn-border)',
              borderRadius: 4,
              color: 'var(--term-input-color)',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <div className="segment-control">
            <button className={historyMode === 'server' ? 'active' : ''} onClick={() => setHistoryMode('server')}>
              {t('当前服务器')}
            </button>
            <button className={historyMode === 'global' ? 'active' : ''} onClick={() => setHistoryMode('global')}>
              {t('全部服务器')}
            </button>
          </div>
        </div>
      </div>
  );
}
