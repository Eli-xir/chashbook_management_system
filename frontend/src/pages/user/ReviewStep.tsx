import { useRef, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useFlow } from '../UserFlow'

function idempotencyKey(): string {
  // 32 hex chars via crypto random — meets the backend's 16-64 length rule.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default function ReviewStep() {
  const { draft, setDraft, setStep, mediums } = useFlow()
  const { me } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const keyRef = useRef<string>(idempotencyKey())

  const medium = mediums.find((m) => m.payment_medium_id === draft.mediumId)
  const role = me?.role
  const derivedType = role === 'debit_user' ? (draft.payable ? 'payable_debit' : 'debit') : draft.payable ? 'payable_credit' : 'credit'
  const pathText = draft.headPath.map((h) => h.head_name).join(' / ')

  async function send() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await api.post('/transactions/create', {
        head_id: draft.headId,
        amount: Number(draft.amount || 0),
        payment_medium_id: draft.mediumId,
        payable: draft.payable,
        idempotency_key: keyRef.current,
      })
      setDraft({ ...draft, submitted: true })
      setStep('success')
    } catch (err) {
      // Draft is preserved; the same idempotency key is reused for the retry.
      setError(err instanceof Error ? err.message : 'Could not send. Your entry is saved — try again.')
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="topbar">
        <button className="secondary" onClick={() => setStep('payable')}>
          ← Back
        </button>
        <span className="title">Review</span>
      </div>

      <div className="card">
        <ul className="review-list">
          <li><span className="k">Head</span><span className="v">{pathText}</span></li>
          <li><span className="k">Amount</span><span className="v">PKR {draft.amount}</span></li>
          <li><span className="k">Medium</span><span className="v">{medium?.payment_medium_name ?? '—'}</span></li>
          <li><span className="k">Type</span><span className="v">{derivedType}</span></li>
        </ul>
      </div>

      {draft.imageUrl && (
        <div className="preview-box">
          <img src={draft.imageUrl} alt="Attached photo" style={{ maxHeight: 220 }} />
        </div>
      )}
      {draft.voiceId && (
        <div className="preview-box">
          <audio controls src={draft.voiceUrl ?? undefined} style={{ width: '100%' }} />
        </div>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}
      <button className="block" onClick={send} disabled={busy}>
        {busy ? 'Sending…' : 'Send'}
      </button>
      {busy && <div className="hint" style={{ textAlign: 'center' }}>Do not close the app while sending…</div>}
    </section>
  )
}
