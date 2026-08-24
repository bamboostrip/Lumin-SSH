import React from 'react';
import { createPortal } from 'react-dom';
import { Play, Trash2, X, Zap } from 'lucide-react';
import * as AppGo from '../../../wailsjs/go/wailsapp/App.js';
import { Z } from '../../constants/zIndex.ts';
import { extractQuickCommandParams, fillQuickCommandParams, type QuickCommandParamHistory } from '../../utils/quickCommandParams.ts';
import type { FlattenedQuickCommand } from '../../utils/terminalCommandAutocomplete.ts';
import type { I18nKey } from '../../i18n.ts';

type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string

// 快捷命令二次确认框（复用 PC 既有 .modal 结构，仅 z 层降到 Z.DIALOG）。
// 从 Terminal.tsx 原样搬移，props 与闭包变量同名。
interface TerminalQuickCmdConfirmProps {
  pendingQuickCmd: { item: FlattenedQuickCommand; values: Record<string, string> }
  setPendingQuickCmd: React.Dispatch<React.SetStateAction<{ item: FlattenedQuickCommand; values: Record<string, string> } | null>>
  sendQuickCmdConfirmed: () => void | Promise<void>
  isConnected: boolean
  quickCmdHistoryParam: number | null
  setQuickCmdHistoryParam: React.Dispatch<React.SetStateAction<number | null>>
  quickCmdHistoryPosition: { left: number; top: number }
  setQuickCmdHistoryPosition: React.Dispatch<React.SetStateAction<{ left: number; top: number }>>
  quickCmdHistorySearch: string
  setQuickCmdHistorySearch: React.Dispatch<React.SetStateAction<string>>
  quickCmdParamHistory: QuickCommandParamHistory
  setQuickCmdParamHistory: React.Dispatch<React.SetStateAction<QuickCommandParamHistory>>
  quickCmdParamHistoryRef: React.RefObject<QuickCommandParamHistory>
  t: LooseT
}

export function TerminalQuickCmdConfirm({
  pendingQuickCmd,
  setPendingQuickCmd,
  sendQuickCmdConfirmed,
  isConnected,
  quickCmdHistoryParam,
  setQuickCmdHistoryParam,
  quickCmdHistoryPosition,
  setQuickCmdHistoryPosition,
  quickCmdHistorySearch,
  setQuickCmdHistorySearch,
  quickCmdParamHistory,
  setQuickCmdParamHistory,
  quickCmdParamHistoryRef,
  t,
}: TerminalQuickCmdConfirmProps) {
  const params = extractQuickCommandParams(pendingQuickCmd.item.command);
  const filled = fillQuickCommandParams(pendingQuickCmd.item.command, pendingQuickCmd.values);
  return (
    // 遮罩不响应点击：只能用「取消」/ 右上 X / Esc 关闭，避免误点丢失已填参数
    <div
      className="modal-overlay"
      style={{ zIndex: Z.DIALOG_BACKDROP }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="modal modal-sm" style={{ zIndex: Z.DIALOG }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Zap size={16} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pendingQuickCmd.item.name || t('发送快捷命令')}
            </span>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setPendingQuickCmd(null)}
            aria-label={t('取消')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {params.map((p, i) => (
            <div key={p.num} className="form-group">
              <label className="form-label" htmlFor={`quick-cmd-param-${p.num}`}>
                {p.label || `${t('参数')}${p.num}`}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                name={`terminal-quick-cmd-param-${p.num}`}
                autoComplete="off"
                aria-label={p.label || `${t('参数')}${p.num}`}
                id={`quick-cmd-param-${p.num}`}
                type="text"
                className="input"
                value={pendingQuickCmd.values[p.num] || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setPendingQuickCmd((prev) => (prev
                    ? { ...prev, values: { ...prev.values, [p.num]: value } }
                    : prev));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    sendQuickCmdConfirmed();
                  }
                }}
                autoFocus={i === 0}
                placeholder={p.label || `p#${p.num}`}
                style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                data-terminal-quick-cmd-history="true"
                aria-expanded={quickCmdHistoryParam === p.num}
                onClick={(event) => {
                  setQuickCmdHistorySearch('');
                  if (quickCmdHistoryParam === p.num) {
                    setQuickCmdHistoryParam(null);
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setQuickCmdHistoryPosition({
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 228)),
                    top: Math.min(rect.bottom + 4, window.innerHeight - 228),
                  });
                  setQuickCmdHistoryParam(p.num);
                }}
              >
                {t('历史')}
              </button>
              </div>
              {quickCmdHistoryParam === p.num && createPortal((() => {
                const history = quickCmdParamHistory[pendingQuickCmd.item.command]?.[p.num] || [];
                const filteredHistory = quickCmdHistorySearch
                  ? history.filter((value) => value.toLowerCase().includes(quickCmdHistorySearch.toLowerCase()))
                  : history;
                const saveHistory = (values: string[]) => {
                  const command = pendingQuickCmd.item.command;
                  const nextHistory = {
                    ...quickCmdParamHistoryRef.current,
                    [command]: { ...(quickCmdParamHistoryRef.current[command] || {}), [p.num]: values },
                  };
                  quickCmdParamHistoryRef.current = nextHistory;
                  setQuickCmdParamHistory(nextHistory);
                  AppGo.SaveParamHistory(JSON.stringify(nextHistory)).catch(() => {});
                };
                return (
                  <div
                    data-terminal-quick-cmd-history="true"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      position: 'fixed',
                      left: quickCmdHistoryPosition.left,
                      top: quickCmdHistoryPosition.top,
                      zIndex: Z.SUBMENU,
                      width: 220,
                      maxHeight: 220,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <div style={{ padding: 6, flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
                      <input
                        type="text"
                        className="input"
                        name={`terminal-quick-cmd-history-search-${p.num}`}
                        autoComplete="off"
                        autoFocus
                        value={quickCmdHistorySearch}
                        onChange={(event) => setQuickCmdHistorySearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setQuickCmdHistoryParam(null);
                            setQuickCmdHistorySearch('');
                          }
                        }}
                        placeholder={t('搜索历史...')}
                        aria-label={t('搜索历史...')}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        saveHistory([]);
                        setQuickCmdHistoryParam(null);
                        setQuickCmdHistorySearch('');
                      }}
                      style={{ width: '100%', flexShrink: 0, justifyContent: 'flex-start', color: 'var(--danger)', borderBottom: '1px solid var(--border-subtle)', borderRadius: 0 }}
                    >
                      {t('清空列表')}
                    </button>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {filteredHistory.length === 0 ? (
                        <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                          {quickCmdHistorySearch ? t('无匹配结果') : t('暂无历史')}
                        </div>
                      ) : filteredHistory.map((value) => (
                        <div
                          key={value}
                          style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          <button
                            type="button"
                            className="btn btn-ghost"
                            title={value}
                            onClick={() => {
                              setPendingQuickCmd((prev) => prev ? { ...prev, values: { ...prev.values, [p.num]: value } } : prev);
                              setQuickCmdHistoryParam(null);
                              setQuickCmdHistorySearch('');
                            }}
                            style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', borderRadius: 0, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {value}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            title={t('删除')}
                            aria-label={t('删除')}
                            onClick={() => saveHistory(history.filter((entry) => entry !== value))}
                            style={{ flexShrink: 0, color: 'var(--danger)', borderRadius: 0 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })(), document.body)}
            </div>
          ))}

          <div className="form-group">
            <div className="form-label">{t('将要发送')}</div>
            <div className="term-quick-cmd-preview">{filled}</div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setPendingQuickCmd(null)}>
            {t('取消')}
          </button>
          <button
            className="btn btn-primary"
            onClick={sendQuickCmdConfirmed}
            disabled={!isConnected || !filled.trim()}
            autoFocus={params.length === 0}
            style={{ minWidth: 80 }}
          >
            <Play size={14} style={{ marginRight: 6 }} />{t('发送')}
          </button>
        </div>
      </div>
    </div>
  );
}
