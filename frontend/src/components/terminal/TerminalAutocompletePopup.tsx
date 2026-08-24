import React from 'react';
import { Z } from '../../constants/zIndex.ts';
import type { AutocompleteItem, CommandAutocompleteState } from '../../utils/terminalCommandAutocomplete.ts';
import type { I18nKey } from '../../i18n.ts';

type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string

// 命令自动补全弹层。从 Terminal.tsx 原样搬移，props 与闭包变量同名。
interface TerminalAutocompletePopupProps {
  commandAutocomplete: CommandAutocompleteState
  setCommandAutocomplete: React.Dispatch<React.SetStateAction<CommandAutocompleteState>>
  commandAutocompletePopupPos: { left: number; top: number; width: number; maxHeight: number }
  commandAutocompleteListRef: React.RefObject<HTMLDivElement | null>
  applyCommandAutocompleteItem: (item: AutocompleteItem) => void
  t: LooseT
}

export function TerminalAutocompletePopup({
  commandAutocomplete,
  setCommandAutocomplete,
  commandAutocompletePopupPos,
  commandAutocompleteListRef,
  applyCommandAutocompleteItem,
  t,
}: TerminalAutocompletePopupProps) {
  return (
    <div
      className="term-popup"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: commandAutocompletePopupPos.left,
        top: commandAutocompletePopupPos.top,
        width: commandAutocompletePopupPos.width,
        maxHeight: commandAutocompletePopupPos.maxHeight ?? 260,
        display: 'flex',
        flexDirection: 'column',
        zIndex: Z.POPUP,
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '7px 10px',
        borderBottom: '1px solid var(--term-separator)',
        fontSize: 11,
        color: 'var(--term-status-color)',
      }}>
        <span>{t('命令')}</span>
        <span style={{ color: 'var(--term-muted)', fontFamily: 'var(--font-mono)' }}>Tab</span>
      </div>
      <div ref={commandAutocompleteListRef} style={{ maxHeight: 220, overflowY: 'auto', overflowX: 'hidden' }}>
        {commandAutocomplete.loading && commandAutocomplete.items.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--term-muted)' }}>
            {t('正在搜索...')}
          </div>
        ) : commandAutocomplete.items.map((item, index) => {
          const isSelected = index === commandAutocomplete.selectedIndex;
          return (
            <button
              key={`${item.source}-${item.value}-${index}`}
              data-command-autocomplete-selected={isSelected ? 'true' : 'false'}
              type="button"
              onMouseEnter={() => {
                setCommandAutocomplete((previous) => ({
                  ...previous,
                  selectedIndex: index,
                }));
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                applyCommandAutocompleteItem(item);
              }}
              style={{
                width: '100%',
                minWidth: 0,
                display: 'grid',
                gap: 4,
                padding: '9px 12px',
                textAlign: 'left',
                border: 'none',
                borderBottom: index === commandAutocomplete.items.length - 1 && !commandAutocomplete.loading ? 'none' : '1px solid var(--term-separator)',
                background: isSelected ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: 'var(--term-input-color)',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  fontFamily: 'var(--font-terminal)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.label}
                </span>
                <span style={{
                  flexShrink: 0,
                  padding: '2px 6px',
                  borderRadius: 999,
                  border: '1px solid var(--term-btn-border)',
                  color: 'var(--term-status-color)',
                  fontSize: 10,
                  lineHeight: 1.2,
                }}>
                  {item.badge}
                </span>
              </div>
              {item.description ? (
                <span style={{
                  fontSize: 11,
                  color: 'var(--term-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.description}
                </span>
              ) : null}
            </button>
          );
        })}
        {commandAutocomplete.loading && commandAutocomplete.items.length > 0 ? (
          <div style={{
            padding: '8px 12px',
            fontSize: 11,
            color: 'var(--term-muted)',
            borderTop: '1px solid var(--term-separator)',
          }}>
            {t('正在刷新结果...')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
