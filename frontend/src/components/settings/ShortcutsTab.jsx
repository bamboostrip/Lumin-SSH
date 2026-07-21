import React from 'react';
import { t as $t } from '../../i18n.js';

const SHORTCUT_ROWS = [
  { labelKey: '从终端复制', key: 'copy' },
  { labelKey: '粘贴到终端', key: 'paste' },
  { labelKey: '清空终端缓冲区', key: 'clear' },
  { labelKey: '新建本地标签页', key: 'newTab' },
  { labelKey: '查找终端内容', key: 'find' },
  { labelKey: '打断当前指令 (SIGINT)', key: 'sigint' },
  { labelKey: '结束终端会话 (EOF)', key: 'eof' },
  { labelKey: '后台挂起进程 (SIGTSTP)', key: 'suspend' },
  { labelKey: '清空当前输入行', key: 'clearLine' },
];

function ShortcutRow({ label, keyName, shortcuts, listeningKey, onSetListening, withBorder }) {
  const isListening = listeningKey === keyName;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', ...(withBorder ? { borderBottom: '1px solid var(--border)' } : {}) }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</span>
      <button
        onClick={() => onSetListening(keyName)}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: isListening ? 'var(--success)' : 'var(--text-tertiary)',
          background: 'var(--surface-raised)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
          border: isListening ? '1px solid var(--success)' : '1px solid var(--border)',
          transition: 'var(--transition)'
        }}
      >
        {isListening ? $t('请按下快捷键...') : shortcuts[keyName]}
      </button>
    </div>
  );
}

export default function ShortcutsTab({ shortcuts, listeningKey, onSetListeningKey }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h3 style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 12, fontWeight: 600 }}>{$t('终端快捷键')}</h3>
        <div className="form-group" style={{ background: 'var(--surface-overlay)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          {SHORTCUT_ROWS.map((row, idx) => (
            <ShortcutRow
              key={row.key}
              label={$t(row.labelKey)}
              keyName={row.key}
              shortcuts={shortcuts}
              listeningKey={listeningKey}
              onSetListening={onSetListeningKey}
              withBorder={idx < SHORTCUT_ROWS.length - 1}
            />
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>{$t('注：部分快捷键行为受终端内的 Shell 设置影响。')}</p>
      </div>
    </div>
  );
}
