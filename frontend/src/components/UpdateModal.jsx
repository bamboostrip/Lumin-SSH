import { Z } from '../constants/zIndex';

export default function UpdateModal({ visible, updateInfo, downloadProgress, t, onClose, onUpdate }) {
  if (!visible || !updateInfo) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: Z.MODAL,
      width: 340, background: 'rgba(22, 27, 34, 0.95)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.15)',
      boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
      borderRadius: 16, padding: '16px 20px',
      animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ fontSize: 28, lineHeight: 1, filter: 'drop-shadow(0 4px 8px rgba(16,185,129,0.3))' }}>🚀</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f6fc', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            {t('发现新版本')} <span style={{ color: '#34d399', fontSize: 13, background: 'rgba(52, 211, 153, 0.1)', padding: '2px 6px', borderRadius: 6 }}>{updateInfo.version}</span>
          </div>
          <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, marginBottom: 16 }}>
            {t('为了给您提供更极致的体验，建议您立即升级。')}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8b949e', cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={onClose}
              onMouseEnter={e => { e.currentTarget.style.color = '#f0f6fc'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.background = 'transparent'; }}
              disabled={downloadProgress >= 0}
            >
              {t('稍等')}
            </button>
            <button
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#10b981', border: 'none', color: '#fff', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}
              onClick={onUpdate}
              onMouseEnter={e => e.currentTarget.style.background = '#059669'}
              onMouseLeave={e => e.currentTarget.style.background = '#10b981'}
              disabled={downloadProgress >= 0}
            >
              {downloadProgress >= 0 && (
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${downloadProgress}%`, background: 'rgba(0,0,0,0.2)', transition: 'width 0.2s ease-out' }} />
              )}
              <span style={{ position: 'relative', zIndex: Z.CONTENT, display: 'flex', alignItems: 'center', gap: 6 }}>
                {downloadProgress >= 0 ? (
                  <>
                    <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                    {downloadProgress}%
                  </>
                ) : (
                  t('立即更新')
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
