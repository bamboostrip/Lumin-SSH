import React from 'react';
import { CaseSensitive, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Z } from '../../constants/zIndex.ts';
import Tiptop from '../Tiptop.tsx';
import type { I18nKey } from '../../i18n.ts';

type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string

// 终端输出搜索栏。从 Terminal.tsx 原样搬移，props 与闭包变量同名。
interface TerminalSearchBarProps {
  termSearchInputRef: React.RefObject<HTMLInputElement | null>
  termSearchQuery: string
  setTermSearchQuery: React.Dispatch<React.SetStateAction<string>>
  termSearchResult: { resultCount: number; resultIndex: number }
  termSearchCaseSensitive: boolean
  setTermSearchCaseSensitive: React.Dispatch<React.SetStateAction<boolean>>
  closeTermSearch: () => void
  findTermNext: (reverse: boolean) => void
  findTermPrevious: () => void
  t: LooseT
}

export function TerminalSearchBar({
  termSearchInputRef,
  termSearchQuery,
  setTermSearchQuery,
  termSearchResult,
  termSearchCaseSensitive,
  setTermSearchCaseSensitive,
  closeTermSearch,
  findTermNext,
  findTermPrevious,
  t,
}: TerminalSearchBarProps) {
  return (
    <div
      className="term-search-bar"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderBottom: '1px solid var(--term-separator)',
        background: 'var(--term-status-bg)',
        flexShrink: 0,
        zIndex: Z.SEARCH_PANEL,
      }}
    >
      <Search size={13} style={{ color: 'var(--term-muted)', flexShrink: 0 }} />
      <input
        name="terminal-search"
        autoComplete="off"
        aria-label={t('终端输出搜索')}
        ref={termSearchInputRef}
        value={termSearchQuery}
        onChange={(e) => setTermSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeTermSearch();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) findTermPrevious();
            else findTermNext(false);
          }
        }}
        placeholder={t('查找...')}
        className="term-search-input"
        style={{
          flex: 1,
          minWidth: 0,
          padding: '4px 8px',
          background: 'var(--term-input-bg)',
          border: '1px solid var(--term-btn-border)',
          borderRadius: 4,
          color: 'var(--term-input-color)',
          fontSize: 12,
          outline: 'none',
          fontFamily: 'var(--font-ui)',
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: termSearchQuery && termSearchResult.resultCount === 0
            ? 'var(--danger, #ff7b72)'
            : 'var(--term-muted)',
          fontFamily: 'var(--font-mono)',
          minWidth: 52,
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {!termSearchQuery
          ? ''
          : termSearchResult.resultCount <= 0
            ? t('无匹配')
            : termSearchResult.resultIndex < 0
              ? `${termSearchResult.resultCount}`
              : `${termSearchResult.resultIndex + 1}/${termSearchResult.resultCount}`}
      </span>
      <Tiptop text={t('区分大小写')}>
        <button
          type="button"
          onClick={() => setTermSearchCaseSensitive((v) => !v)}
          aria-label={t('区分大小写')}
          aria-pressed={termSearchCaseSensitive}
          className={`term-btn${termSearchCaseSensitive ? ' active' : ''}`}
          style={{ padding: '4px 6px', minWidth: 28, height: 26 }}
        >
          <CaseSensitive size={13} />
        </button>
      </Tiptop>
      <Tiptop text={t('上一个')}>
        <button
          type="button"
          onClick={() => findTermPrevious()}
          aria-label={t('上一个')}
          className="term-btn"
          style={{ padding: '4px 6px', minWidth: 28, height: 26 }}
          disabled={!termSearchQuery}
        >
          <ChevronUp size={13} />
        </button>
      </Tiptop>
      <Tiptop text={t('下一个')}>
        <button
          type="button"
          onClick={() => findTermNext(false)}
          aria-label={t('下一个')}
          className="term-btn"
          style={{ padding: '4px 6px', minWidth: 28, height: 26 }}
          disabled={!termSearchQuery}
        >
          <ChevronDown size={13} />
        </button>
      </Tiptop>
      <Tiptop text={t('关闭')}>
        <button
          type="button"
          onClick={closeTermSearch}
          aria-label={t('关闭')}
          className="term-btn"
          style={{ padding: '4px 6px', minWidth: 28, height: 26 }}
        >
          <X size={13} />
        </button>
      </Tiptop>
    </div>
  );
}
