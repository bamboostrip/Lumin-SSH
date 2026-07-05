import { MessageCircleQuestionMark } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '../../../i18n.js'

export default function AIChatFollowUpCard({ question, suggestions, onSelectSuggestion }) {
  const { t } = useTranslation()
  const [submittingValue, setSubmittingValue] = useState('')

  const handleSelectSuggestion = async (value) => {
    const nextValue = typeof value === 'string' ? value.trim() : ''
    if (!nextValue || submittingValue || typeof onSelectSuggestion !== 'function') {
      return
    }
    setSubmittingValue(nextValue)
    try {
      const accepted = await onSelectSuggestion(nextValue)
      if (accepted === false) {
        setSubmittingValue('')
      }
    } catch {
      setSubmittingValue('')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <MessageCircleQuestionMark size={14} color="var(--text-secondary)" />
        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{t('追问建议')}</span>
      </div>
      <div style={{ width: '100%', display: 'grid', gap: 10 }}>
        <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-overlay)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word' }}>
          {question}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              disabled={typeof onSelectSuggestion !== 'function' || Boolean(submittingValue)}
              onClick={() => void handleSelectSuggestion(item)}
              style={{
                minHeight: 38,
                padding: '8px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 13,
                textAlign: 'left',
                transition: 'var(--transition)',
                cursor: typeof onSelectSuggestion !== 'function' || submittingValue ? 'not-allowed' : 'pointer',
                opacity: typeof onSelectSuggestion !== 'function' || submittingValue ? 0.6 : 1,
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}