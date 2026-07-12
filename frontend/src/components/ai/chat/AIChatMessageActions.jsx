import { useState } from 'react'
import { Check, Clipboard, RefreshCw, SquarePen, Trash2 } from 'lucide-react'
import { t } from '../../../i18n.js'

const actionMap = {
  retry: { icon: RefreshCw, title: '重试' },
  copy: { icon: Clipboard, title: '复制' },
  edit: { icon: SquarePen, title: '编辑' },
  delete: { icon: Trash2, title: '删除' },
}

export default function AIChatMessageActions({ actions = [], style }) {
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...style }}>
      {actions.map((action) => {
        const normalizedAction = typeof action === 'string'
          ? { key: action, ...actionMap[action] }
          : { ...actionMap[action?.key], ...action }

        if (!normalizedAction?.icon || !normalizedAction?.key) {
          return null
        }

        const isCopied = normalizedAction.key === 'copy' && copied
        const Icon = isCopied ? Check : normalizedAction.icon
        const title = isCopied ? '已复制' : normalizedAction.title

        return (
          <button
            key={normalizedAction.key}
            type="button"
            title={t(title)}
            aria-label={t(title)}
            onClick={(event) => {
              event.stopPropagation()
              normalizedAction.onClick?.()
              if (normalizedAction.key === 'copy') {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              }
            }}
            style={{
              width: 26,
              height: 26,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 7,
              color: isCopied ? 'var(--success)' : 'var(--text-muted)',
              background: 'transparent',
              border: '1px solid transparent',
              transition: 'var(--transition)',
              cursor: 'pointer',
            }}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}