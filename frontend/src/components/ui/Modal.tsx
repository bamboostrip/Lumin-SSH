import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../../i18n.ts';
import { Z } from '../../constants/zIndex.ts';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[800px]',
  xl: 'max-w-[1100px]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  align?: 'center' | 'top';
  zIndex?: number;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  hideClose?: boolean;
  panelClassName?: string;
  bodyClassName?: string;
  panelStyle?: React.CSSProperties;
  overlayProps?: React.HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  icon,
  footer,
  size = 'md',
  align = 'center',
  zIndex = Z.MODAL,
  closeOnOverlay = true,
  closeOnEscape = true,
  hideClose = false,
  panelClassName = '',
  bodyClassName = '',
  panelStyle,
  overlayProps,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, closeOnEscape, onClose]);

  // 关键：用 useLayoutEffect 同步在 paint 前加上 modal-open，避免首帧穿透。
  // Linux WebKitGTK 的 overlay scrollbar 在滚动后 1s 内处于可见态（自动淡出），
  // 若用 useEffect（paint 后才加类），首帧会把仍在淡出动画中的 thumb 画到 fixed 弹层之上，
  // 表现为“滚动后立马开设置才穿透、等一会就消失”。
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

  if (!open) return null;

  const hasHeader = title != null || !hideClose;

  const overlayNode = (
    <div
      data-modal-overlay="true"
      className={`fixed inset-0 flex ${align === 'top' ? 'items-start pt-[52px]' : 'items-center'} justify-center bg-scrim animate-[fadeIn_0.12s_ease]`}
      style={{ zIndex, isolation: 'isolate' }}
      {...overlayProps}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full overflow-y-auto bg-raised border border-line rounded-[var(--radius-lg)] shadow-xl animate-[slideUp_0.12s_ease] ${align === 'top' ? '' : 'max-h-[90vh]'} ${SIZE_CLASS[size]} ${panelClassName}`}
        style={panelStyle}
      >
        {hasHeader && (
          <div className="flex items-center justify-between gap-2 px-5 pt-4">
            <div className="flex items-center gap-2 min-w-0 text-md font-semibold text-primary [&>svg]:shrink-0">
              {icon}
              {title}
            </div>
            {!hideClose && (
              <button
                type="button"
                aria-label={t('关闭')}
                onClick={onClose}
                className="shrink-0 inline-flex items-center justify-center w-[26px] h-[26px] rounded-sm border border-transparent bg-transparent text-secondary cursor-pointer outline-none transition-colors duration-[80ms] hover:bg-hover hover:text-primary"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className={`flex flex-col gap-3 px-5 py-4 ${bodyClassName}`}>{children}</div>
        {footer != null && (
          <div className="flex justify-end gap-2 px-5 pt-3 pb-4 border-t border-line">{footer}</div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(overlayNode, document.body);
  }
  return overlayNode;
}
