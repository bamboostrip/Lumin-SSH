import { useEffect, useState } from 'react';
import { WindowIsMaximised } from '../../../wailsjs/runtime/runtime.js';

/**
 * WindowResizeBorders
 * 在非最大化窗口边缘与四角提供顶层无边框调整热区，
 * 解决原生滚动条（AI 面板 / 监控面板 / 文件管理器）以及边缘折叠条遮挡/阻断窗口拖动缩放的问题。
 */
export default function WindowResizeBorders() {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    let unmounted = false;
    const syncState = async () => {
      try {
        const max = await WindowIsMaximised();
        if (!unmounted) setIsMax(max);
      } catch {}
    };

    syncState();
    window.addEventListener('resize', syncState);
    const interval = window.setInterval(syncState, 400);

    return () => {
      unmounted = true;
      window.removeEventListener('resize', syncState);
      window.clearInterval(interval);
    };
  }, []);

  if (isMax) return null;

  const startResize = (e: React.MouseEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    const w = window as unknown as {
      wails?: { flags?: { resizeEdge?: string } };
      WailsInvoke?: (cmd: string) => void;
    };
    if (w.wails?.flags) {
      w.wails.flags.resizeEdge = edge;
    }
    if (w.WailsInvoke) {
      w.WailsInvoke('resize:' + edge);
    }
  };

  const handleMouseEnter = (edge: string) => {
    const wailsFlags = (window as unknown as { wails?: { flags?: { resizeEdge?: string } } })?.wails?.flags;
    if (wailsFlags) {
      wailsFlags.resizeEdge = edge;
    }
  };

  const handleMouseLeave = () => {
    const wailsFlags = (window as unknown as { wails?: { flags?: { resizeEdge?: string } } })?.wails?.flags;
    if (wailsFlags?.resizeEdge) {
      delete wailsFlags.resizeEdge;
    }
  };

  const borderThickness = 5;
  const cornerSize = 10;

  return (
    <>
      {/* 边缘缩放热区 */}
      <div
        className="window-resize-border window-resize-border-right"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: `${borderThickness}px`,
          zIndex: 99999,
          cursor: 'e-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 'e-resize')}
        onMouseEnter={() => handleMouseEnter('e-resize')}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className="window-resize-border window-resize-border-left"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: `${borderThickness}px`,
          zIndex: 99999,
          cursor: 'w-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 'w-resize')}
        onMouseEnter={() => handleMouseEnter('w-resize')}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className="window-resize-border window-resize-border-bottom"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${borderThickness}px`,
          zIndex: 99999,
          cursor: 's-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 's-resize')}
        onMouseEnter={() => handleMouseEnter('s-resize')}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className="window-resize-border window-resize-border-top"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: 0,
          height: `${borderThickness}px`,
          zIndex: 99999,
          cursor: 'n-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 'n-resize')}
        onMouseEnter={() => handleMouseEnter('n-resize')}
        onMouseLeave={handleMouseLeave}
      />

      {/* 四角缩放热区 */}
      <div
        className="window-resize-corner window-resize-corner-tl"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          zIndex: 100000,
          cursor: 'nw-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 'nw-resize')}
        onMouseEnter={() => handleMouseEnter('nw-resize')}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className="window-resize-corner window-resize-corner-tr"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          zIndex: 100000,
          cursor: 'ne-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 'ne-resize')}
        onMouseEnter={() => handleMouseEnter('ne-resize')}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className="window-resize-corner window-resize-corner-bl"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          zIndex: 100000,
          cursor: 'sw-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 'sw-resize')}
        onMouseEnter={() => handleMouseEnter('sw-resize')}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className="window-resize-corner window-resize-corner-br"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          zIndex: 100000,
          cursor: 'se-resize',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => startResize(e, 'se-resize')}
        onMouseEnter={() => handleMouseEnter('se-resize')}
        onMouseLeave={handleMouseLeave}
      />
    </>
  );
}
