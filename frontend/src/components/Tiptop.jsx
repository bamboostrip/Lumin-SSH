import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function Tiptop({
  text,
  children,
  placement = 'top',
  className = '',
  style,
  triggerClassName = '',
}) {
  const triggerRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState(null)
  const hasText = text !== null && text !== undefined && text !== ''

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      setPosition(null)
      return
    }
    setPosition({
      left: rect.left + rect.width / 2,
      top: placement === 'bottom' ? rect.bottom + 6 : rect.top - 6,
    })
  }, [placement])

  useEffect(() => {
    if (!visible) {
      return undefined
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [updatePosition, visible])

  const show = useCallback(() => {
    if (!hasText) {
      return
    }
    updatePosition()
    setVisible(true)
  }, [hasText, updatePosition])

  const hide = useCallback(() => {
    setVisible(false)
  }, [])

  const bubbleClassName = `tiptop-bubble${placement === 'bottom' ? ' tiptop-bubble-bottom' : ''}`
  const wrapperClassName = `tiptop ${className}`.trim()
  const tiptopTriggerClassName = `tiptop-trigger ${triggerClassName}`.trim()

  return (
    <>
      <div
        className={wrapperClassName}
        style={style}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <div ref={triggerRef} className={tiptopTriggerClassName}>
          {children}
        </div>
      </div>
      {visible && position && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={bubbleClassName}
              style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                bottom: 'auto',
                transform: placement === 'bottom' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                opacity: 1,
                visibility: 'visible',
              }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}