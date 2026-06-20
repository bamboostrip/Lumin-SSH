import { Monitor } from 'lucide-react';
import { Z } from '../constants/zIndex';

export default function ConnectingCard({ connectingServer, t, onCancel }) {
  if (!connectingServer) return null;
  const server = connectingServer.server;
  const host = server.host;
  const port = server.port || 22;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: Z.FULLSCREEN_OVERLAY,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: 380, borderRadius: 16, overflow: 'hidden',
        background: 'rgba(22,27,34,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        padding: '20px 24px 22px',
      }}>
        {/* 标题行：图标 + 名称 + 按钮 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#ef4444,#dc2626)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Monitor size={22} style={{ color: '#fff' }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f6fc', marginBottom: 3 }}>
              {server.name || server.host}
            </div>
            <div style={{ fontSize: 12, color: '#3fb950', fontFamily: 'monospace' }}>
              SSH {host}:{port || 22}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              style={{
                padding: '5px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#8b949e',
              }}
              onClick={onCancel}
            >
              {t('取消')}
            </button>
          </div>
        </div>

        {/* 双进度条 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 8px #22c55e' }} />
          <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: 'linear-gradient(90deg, #22c55e, #86efac)',
              animation: 'ssh-progress-indeterminate 1.4s ease-in-out infinite',
            }} />
          </div>
          <div style={{ flexShrink: 0, fontSize: 14, color: '#22c55e' }}>📡</div>
          <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: 'linear-gradient(90deg, #22c55e, #86efac)',
              animation: 'ssh-progress-indeterminate 1.4s ease-in-out 0.4s infinite',
            }} />
          </div>
          <div style={{ flexShrink: 0, animation: 'spin 1.2s linear infinite', fontSize: 14, color: '#6e7681' }}>⟳</div>
        </div>

        {/* 提示文字 */}
        <div style={{ fontSize: 12, color: '#6e7681', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ animation: 'spin 1.5s linear infinite', display: 'inline-block' }}>⟳</span>
          {t('正在建立 SSH 连接，请稍候...')}
        </div>
      </div>
    </div>
  );
}
