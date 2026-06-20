import { Z } from '../constants/zIndex';

export default function TrayPanel({ show, sessions, t, logoImg, onSessionClick, onClose, onQuit, onShowWindow }) {
  if (!show) return null;

  const handleWindowShow = () => {
    onShowWindow();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', bottom: 48, right: 16, zIndex: Z.TRAY_PANEL,
        width: 280,
        borderRadius: 14,
        background: 'rgba(13,17,23,0.97)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 标题栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logoImg} alt="logo" style={{ width: 24, height: 24, borderRadius: 6 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f0f6fc' }}>Lumin</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', fontSize: 14, padding: '2px 6px' }}
            title={t('展开窗口')}
            onClick={handleWindowShow}
          >⤢</button>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', fontSize: 14, padding: '2px 6px' }}
            onClick={onClose}
          >✕</button>
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, padding: '12px 0', minHeight: 120 }}>
        {sessions.filter(s => s.status === 'connected').length > 0 ? (
          <>
            <div style={{ fontSize: 11, color: '#6e7681', padding: '0 16px 8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>{t('会话')}</div>
            {sessions.filter(s => s.status === 'connected').map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => onSessionClick(s.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                  <span style={{ fontSize: 14, color: '#f0f6fc', fontWeight: 500 }}>{s.serverName}</span>
                </div>
                <span style={{ fontSize: 12, color: '#6e7681' }}>{t('已连接')}</span>
              </div>
            ))}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', gap: 10 }}>
            <div style={{ fontSize: 40 }}>😤</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>{t('一切都很安静')}</div>
            <div style={{ fontSize: 12, color: '#6e7681', textAlign: 'center', lineHeight: 1.6 }}>
              {t('去连接个服务器吧，已经想念你了 🌿')}
            </div>
          </div>
        )}
      </div>

      {/* 底部退出按钮 */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 16px' }}>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', background: 'none', border: 'none',
            cursor: 'pointer', color: '#6e7681', fontSize: 13,
            padding: '6px 0', transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#f0f6fc'}
          onMouseLeave={e => e.currentTarget.style.color = '#6e7681'}
          onClick={onQuit}
        >
          <span>⏻</span> {t('退出 Lumin')}
        </button>
      </div>
    </div>
  );
}
