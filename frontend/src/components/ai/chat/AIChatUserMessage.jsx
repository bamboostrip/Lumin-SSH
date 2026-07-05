import AIChatMessageActionBar from './AIChatMessageActionBar.jsx'

const userTitleKey = '用户'

export default function AIChatUserMessage({ message, onRetry, onEdit, onDelete, messageActionBarAtBottom = false }) {
  const text = typeof message?.text === 'string' ? message.text : ''
  const time = typeof message?.time === 'string' ? message.time : ''
  const messageId = typeof message?.id === 'string' ? message.id : ''
  const images = Array.isArray(message?.images) ? message.images.filter((item) => typeof item === 'string' && item.trim()) : []
  const hasText = Boolean(text)
  const hasImages = images.length > 0
  const hasContent = hasText || hasImages
  const handleCopyText = () => {
    if (!text.trim()) {
      return
    }
    navigator.clipboard.writeText(text).catch(() => {})
  }
  const messageActions = [
    { key: 'retry', onClick: () => onRetry?.(messageId, text, images) },
    { key: 'copy', onClick: handleCopyText },
    { key: 'edit', onClick: () => onEdit?.(messageId, text, images) },
    { key: 'delete', onClick: () => onDelete?.(messageId) },
  ]

  const renderActionBar = () => (
    <AIChatMessageActionBar
      variant="user"
      title={userTitleKey}
      time={time}
      actions={messageActions}
    />
  )

  const renderImages = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
      {images.map((image, index) => (
        <a
          key={`${messageId}-image-${index}`}
          href={image}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'block',
            borderRadius: 12,
            overflow: 'hidden',
            border: messageActionBarAtBottom ? '1px solid rgba(var(--accent-rgb), 0.18)' : '1px solid var(--accent-border)',
            background: 'var(--surface-base)',
          }}>
          <img
            src={image}
            alt=""
            style={{
              width: '100%',
              height: 120,
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </a>
      ))}
    </div>
  )

  if (messageActionBarAtBottom) {
    return (
      <div style={{ display: 'flex', width: '100%' }}>
        <div style={{ width: '100%', display: 'grid', gap: 0 }}>
          <div style={{ width: '100%', display: 'grid', gap: 0, borderRadius: 12, background: 'linear-gradient(180deg, rgba(var(--accent-rgb), 0.16), rgba(var(--accent-rgb), 0.08))', border: '1px solid var(--accent-border)', boxShadow: 'inset 0 1px 0 rgba(var(--accent-rgb), 0.12)', overflow: 'hidden' }}>
            {hasContent ? (
              <div style={{ padding: '10px 12px', display: 'grid', gap: hasText && hasImages ? 8 : 0 }}>
                {hasText ? (
                  <div style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {text}
                  </div>
                ) : null}
                {hasImages ? renderImages() : null}
              </div>
            ) : null}
            <div style={{ borderTop: hasContent ? '1px solid rgba(var(--accent-rgb), 0.18)' : 'none', padding: '0 12px' }}>
              {renderActionBar()}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', width: '100%' }}>
      <div style={{ width: '100%', display: 'grid', gap: 6 }}>
        <div>
          {renderActionBar()}
        </div>
        {hasText ? (
          <div style={{ padding: '10px 12px', borderRadius: 12, background: 'linear-gradient(180deg, rgba(var(--accent-rgb), 0.16), rgba(var(--accent-rgb), 0.08))', border: '1px solid var(--accent-border)', boxShadow: 'inset 0 1px 0 rgba(var(--accent-rgb), 0.12)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {text}
          </div>
        ) : null}
        {hasImages ? renderImages() : null}
      </div>
    </div>
  )
}