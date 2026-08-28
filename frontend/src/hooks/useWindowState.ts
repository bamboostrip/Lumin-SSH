import { useCallback, useEffect } from 'react';
import {
  WindowGetSize,
  WindowIsMaximised,
  WindowMaximise,
  WindowSetSize,
  WindowToggleMaximise,
} from '../../wailsjs/runtime/runtime.js';

interface SavedWindowSize {
  w: number;
  h: number;
  maximized: boolean;
}

function shouldRememberWindowSize(): boolean {
  return typeof localStorage !== 'undefined'
    && localStorage.getItem('rememberWindowSize') !== 'false';
}

function readSavedWindowSize(): SavedWindowSize | null {
  try {
    const parsed = JSON.parse(localStorage.getItem('windowSize') || 'null') as unknown;
    const saved = parsed as SavedWindowSize | null;
    return saved && saved.w > 100 && saved.h > 100 ? saved : null;
  } catch {
    return null;
  }
}

export default function useWindowState(): () => Promise<void> {
  // 保持 Wails 窗口边缘缩放状态与最大化状态同步，并增强无边框边缘缩放光标与拖拽判定
  useEffect(() => {
    let isMax = false;

    const clearResizeState = () => {
      const wailsFlags = (window as unknown as { wails?: { flags?: { enableResize?: boolean; resizeEdge?: string } } })?.wails?.flags;
      if (wailsFlags && 'resizeEdge' in wailsFlags) {
        delete wailsFlags.resizeEdge;
      }
      if (document.documentElement.hasAttribute('data-wails-resize-edge')) {
        document.documentElement.removeAttribute('data-wails-resize-edge');
      }
      if (document.documentElement.style.cursor && document.documentElement.style.cursor.includes('resize')) {
        document.documentElement.style.cursor = '';
      }
    };

    const syncMaximizeState = async () => {
      try {
        isMax = await WindowIsMaximised();
        const wailsFlags = (window as unknown as { wails?: { flags?: { enableResize?: boolean; resizeEdge?: string; defaultCursor?: string | null } } })?.wails?.flags;
        if (wailsFlags) {
          wailsFlags.enableResize = !isMax;
        }
        if (isMax) {
          clearResizeState();
        }
      } catch {}
    };

    syncMaximizeState();
    const onResize = () => {
      syncMaximizeState();
    };
    window.addEventListener('resize', onResize);
    const timer = window.setInterval(syncMaximizeState, 400);

    const onMouseMove = (e: MouseEvent) => {
      const wailsFlags = (window as unknown as { wails?: { flags?: { enableResize?: boolean; resizeEdge?: string; borderThickness?: number } } })?.wails?.flags;
      if (isMax) {
        if (wailsFlags) {
          wailsFlags.enableResize = false;
        }
        clearResizeState();
        return;
      }

      if (!wailsFlags || wailsFlags.enableResize === false) {
        return;
      }

      const borderThickness = Math.max(wailsFlags.borderThickness || 0, 8);
      wailsFlags.borderThickness = borderThickness;
      const rightBorder = (window.innerWidth - e.clientX < borderThickness) || (window.outerWidth - e.clientX < borderThickness);
      const leftBorder = e.clientX < borderThickness;
      const topBorder = e.clientY < borderThickness;
      const bottomBorder = (window.innerHeight - e.clientY < borderThickness) || (window.outerHeight - e.clientY < borderThickness);

      let edge: string | null = null;
      if (rightBorder && bottomBorder) edge = 'se-resize';
      else if (leftBorder && bottomBorder) edge = 'sw-resize';
      else if (leftBorder && topBorder) edge = 'nw-resize';
      else if (topBorder && rightBorder) edge = 'ne-resize';
      else if (leftBorder) edge = 'w-resize';
      else if (topBorder) edge = 'n-resize';
      else if (bottomBorder) edge = 's-resize';
      else if (rightBorder) edge = 'e-resize';

      if (edge) {
        wailsFlags.resizeEdge = edge;
        document.documentElement.style.cursor = edge;
        document.documentElement.setAttribute('data-wails-resize-edge', edge);
      } else if (wailsFlags.resizeEdge !== undefined || document.documentElement.hasAttribute('data-wails-resize-edge')) {
        clearResizeState();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (isMax) return;
      const wailsFlags = (window as unknown as { wails?: { flags?: { resizeEdge?: string } } })?.wails?.flags;
      if (wailsFlags?.resizeEdge) {
        const w = window as unknown as { WailsInvoke?: (cmd: string) => void };
        if (w.WailsInvoke) {
          w.WailsInvoke('resize:' + wailsFlags.resizeEdge);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mouseleave', clearResizeState);
    window.addEventListener('blur', clearResizeState);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove, { capture: true });
      window.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mouseleave', clearResizeState);
      window.removeEventListener('blur', clearResizeState);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!shouldRememberWindowSize()) return undefined;
    const saved = readSavedWindowSize();
    if (!saved) return undefined;
    const frame = window.requestAnimationFrame(async () => {
      try {
        await WindowSetSize(saved.w, saved.h);
        if (saved.maximized) await WindowMaximise();
      } catch { }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!shouldRememberWindowSize()) return undefined;
    const saved = readSavedWindowSize();
    let lastW = saved && saved.w > 100 ? saved.w : 0;
    let lastH = saved && saved.h > 100 ? saved.h : 0;
    let lastMaximized: boolean | null = null;
    let debounceTimer = 0;

    const persist = async () => {
      try {
        const [size, maximized] = await Promise.all([WindowGetSize(), WindowIsMaximised()]);
        if (maximized) {
          if (lastMaximized === true) return;
          lastMaximized = true;
          const w = lastW > 100 ? lastW : size?.w;
          const h = lastH > 100 ? lastH : size?.h;
          if (w > 100 && h > 100) {
            localStorage.setItem('windowSize', JSON.stringify({ w, h, maximized: true }));
          }
          return;
        }
        if (size?.w > 100 && size?.h > 100
          && (size.w !== lastW || size.h !== lastH || lastMaximized !== false)) {
          lastW = size.w;
          lastH = size.h;
          lastMaximized = false;
          localStorage.setItem('windowSize', JSON.stringify({ w: size.w, h: size.h, maximized: false }));
        }
      } catch { }
    };

    const onResize = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(persist, 150);
    };
    window.addEventListener('resize', onResize);
    const interval = window.setInterval(persist, 2000);
    return () => {
      window.clearTimeout(debounceTimer);
      window.removeEventListener('resize', onResize);
      window.clearInterval(interval);
    };
  }, []);

  return useCallback(async () => {
    try {
      if (shouldRememberWindowSize()) {
        const [size, maximized] = await Promise.all([WindowGetSize(), WindowIsMaximised()]);
        if (!maximized && size?.w > 100 && size?.h > 100) {
          localStorage.setItem('windowSize', JSON.stringify({ w: size.w, h: size.h, maximized: true }));
        }
      }
    } catch { }
    WindowToggleMaximise();
    setTimeout(async () => {
      try {
        const isMax = await WindowIsMaximised();
        const wailsFlags = (window as unknown as { wails?: { flags?: { enableResize?: boolean; resizeEdge?: string } } })?.wails?.flags;
        if (wailsFlags) {
          wailsFlags.enableResize = !isMax;
          if (isMax) {
            delete wailsFlags.resizeEdge;
            if (document.documentElement.style.cursor && document.documentElement.style.cursor.includes('resize')) {
              document.documentElement.style.cursor = '';
            }
          }
        }
      } catch {}
    }, 100);
  }, []);
}
