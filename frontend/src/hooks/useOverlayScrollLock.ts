import { useLayoutEffect } from 'react';

/**
 * Linux WebKitGTK overlay scrollbar 会在滚动后 1s 内处于淡出动画中，
 * 若背景容器仍为 overflow:auto，thumb 会以独立合成层画到 fixed 弹层之上。
 * 复用 Modal 的 modalCount 计数，保证多层弹层嵌套时仅在最后一层关闭时解锁。
 */
export function useOverlayScrollLock(open: boolean) {
  useLayoutEffect(() => {
    if (!open) return undefined;

    const docEl = document.documentElement;
    const body = document.body;
    const previousCount = Number(body.dataset.modalCount || '0');
    const nextCount = previousCount + 1;

    body.dataset.modalCount = String(nextCount);
    body.classList.add('modal-open');
    docEl.classList.add('modal-open');

    return () => {
      const remaining = Math.max(0, Number(body.dataset.modalCount || '1') - 1);
      if (remaining === 0) {
        body.classList.remove('modal-open');
        docEl.classList.remove('modal-open');
        delete body.dataset.modalCount;
      } else {
        body.dataset.modalCount = String(remaining);
      }
    };
  }, [open]);
}
