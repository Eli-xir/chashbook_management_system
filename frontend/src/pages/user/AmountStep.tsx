import { useState } from 'react'
import { useFlow } from '../UserFlow'

export default function AmountStep() {
  const { draft, setDraft, setStep, mediums } = useFlow()
  const [error, setError] = useState('')

  const headName = draft.headPath[draft.headPath.length - 1]?.head_name ?? ''
  const pathText = draft.headPath.map((h) => h.head_name).join(' / ')

  function next() {
    const n = Number(draft.amount)
    if (!/^\d+$/.test(draft.amount) && draft.amount !== '') {
      setError('Enter a whole number of rupees')
      return
    }
    if (draft.mediumId === null) {
      setError('Choose a payment medium')
      return
    }
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a valid amount')
      return
    }
    setError('')
    setStep('image')
  }

  return (
    <section>
      <div className="topbar">
        <button className="secondary" onClick={() => setStep('heads')}>
          ← Back
        </button>
        <span className="title">Amount</span>
      </div>
      <div className="crumb">{pathText}</div>

      <div className="card">
        <label htmlFor="amount">Amount for “{headName}”</label>
        <input
          id="amount"
          className="amount-input"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^\d]/g, '') })}
          autoFocus
        />
        <div className="currency-label">PKR (Rupees)</div>
      </div>

      <label>Payment medium</label>
      {mediums.map((m) => (
        <button
          key={m.payment_medium_id}
          className="head-card"
          style={draft.mediumId === m.payment_medium_id ? { borderColor: 'var(--blue)', borderWidth: 2 } : {}}
          onClick={() => setDraft({ ...draft, mediumId: m.payment_medium_id })}
        >
          <span>{m.payment_medium_name}</span>
          <span>{draft.mediumId === m.payment_medium_id ? '✓' : ''}</span>
        </button>
      ))}

      {error && <div className="error-banner" role="alert">{error}</div>}
      <button className="block" onClick={next}>
        Next
      </button>
    </section>
  )
}
