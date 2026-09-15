import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, fileUrl } from '../../api'
import type { PaymentMedium, TransactionType, TxnDetail } from '../../types'

export default function TransactionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [txn, setTxn] = useState<TxnDetail | null>(null)
  const [types, setTypes] = useState<TransactionType[]>([])
  const [mediums, setMediums] = useState<PaymentMedium[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')

  // Correction form state
  const [amount, setAmount] = useState('')
  const [mediumId, setMediumId] = useState('')
  const [typeName, setTypeName] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setError('')
    try {
      const t = await api.get<TxnDetail>(`/transactions/detail/${id}`)
      setTxn(t)
      const cur = t.versions[t.versions.length - 1]
      setAmount(String(cur.transaction_amount))
      setMediumId(String(cur.payment_medium_id))
      setTypeName(cur.transaction_type_name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load transaction')
    }
  }, [id])

  useEffect(() => {
    void load()
    api.get<TransactionType[]>('/transactions/types').then(setTypes).catch(() => {})
    api.get<PaymentMedium[]>('/transactions/mediums').then(setMediums).catch(() => {})
  }, [load])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveCorrection() {
    if (!txn) return
    const cur = txn.versions[txn.versions.length - 1]
    await run(() =>
      api.post(`/transactions/${txn.transaction_id}/correct`, {
        base_version_id: cur.version_id,
        amount: Number(amount),
        payment_medium_id: Number(mediumId),
        transaction_type_name: typeName,
      }),
    )
    setCorrecting(false)
  }

  if (!txn && !error) return <div className="spin" />

  const current = txn?.versions[txn.versions.length - 1]
  const pathText = txn?.head_path.map((h) => h.head_name).join(' / ')

  return (
    <div className="txn-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 480px) 1fr', gap: '1.5rem' }}>
      <section>
        <button className="subtle" onClick={() => navigate(-1)}>← Back</button>
        <h1>Transaction #{id}</h1>
        {error && <div className="error-banner">{error}</div>}
        {txn && (
          <>
            <div className="card">
              <ul className="review-list">
                <li><span className="k">User</span><span className="v">{txn.user_name}</span></li>
                <li><span className="k">Date (Karachi)</span><span className="v">{fmt(current?.created_at)}</span></li>
                <li><span className="k">Head path</span><span className="v">{pathText}</span></li>
                <li><span className="k">Amount</span><span className="v">PKR {current?.transaction_amount.toLocaleString()}</span></li>
                <li><span className="k">Type</span><span className="v">{current?.transaction_type_name}</span></li>
                <li><span className="k">Medium</span><span className="v">{current?.payment_medium_name}</span></li>
                <li>
                  <span className="k">Status</span>
                  <span className="v">
                    <span className={`tag${txn.is_active ? '' : ' inactive'}`}>{txn.is_active ? 'active' : 'inactive'}</span>
                  </span>
                </li>
              </ul>
            </div>

            {current?.image_id && (
              <div className="preview-box">
                <img src={fileUrl('images', current.image_id)} alt="Attachment" style={{ maxHeight: 240 }} />
              </div>
            )}
            {current?.voice_id && (
              <div className="preview-box">
                <audio controls src={fileUrl('voice', current.voice_id)} style={{ width: '100%' }} />
              </div>
            )}

            <div className="danger-zone">
              <h2>Actions</h2>
              {!correcting && (
                <button className="secondary block" onClick={() => setCorrecting(true)}>
                  Correct this entry
                </button>
              )}
              <button
                className="secondary block"
                disabled={busy}
                onClick={() => run(() => api.post(`/transactions/${txn.transaction_id}/${txn.is_active ? 'deactivate' : 'reactivate'}`))}
              >
                {txn.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
              <label style={{ marginTop: '1rem' }}>Delete permanently — type the transaction ID ({id}) to confirm</label>
              <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder={String(id)} />
              <button
                className="danger block"
                disabled={busy || confirmDelete !== String(id)}
                onClick={() => run(() => api.delete(`/transactions/${txn.transaction_id}`)).then(() => navigate('/'))}
              >
                Delete forever
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        {correcting && txn && (
          <div className="card">
            <h2>Correction (saved as a new version)</h2>
            <label htmlFor="camount">Amount (PKR)</label>
            <input id="camount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
            <label htmlFor="cmedium">Medium</label>
            <select id="cmedium" value={mediumId} onChange={(e) => setMediumId(e.target.value)}>
              {mediums.map((m) => (
                <option key={m.payment_medium_id} value={m.payment_medium_id}>{m.payment_medium_name}</option>
              ))}
            </select>
            <label htmlFor="ctype">Type</label>
            <select id="ctype" value={typeName} onChange={(e) => setTypeName(e.target.value)}>
              {types.map((t) => (
                <option key={t.transaction_type_id} value={t.transaction_type_name}>{t.transaction_type_name}</option>
              ))}
            </select>
            <div className="hint" style={{ marginTop: '0.4rem' }}>
              User and head stay the same; the original author is preserved. Attachments can be managed after saving.
            </div>
            <button className="block" onClick={saveCorrection} disabled={busy}>Save correction</button>
            <button className="subtle block" onClick={() => setCorrecting(false)}>Cancel</button>
          </div>
        )}

        <h2>Version history</h2>
        {txn?.versions
          .slice()
          .reverse()
          .map((v, idx, arr) => {
            const before = arr[idx + 1]
            return (
              <div className="card" key={v.version_id}>
                <div style={{ fontWeight: 700 }}>
                  {before ? 'Correction' : 'Original'} — {fmt(v.created_at)}
                  {v.version_id === txn.current_version_id && <span className="tag" style={{ marginLeft: '0.5rem' }}>current</span>}
                </div>
                <div className="diff" style={{ marginTop: '0.4rem' }}>
                  {before && (
                    <>
                      <div className="removed">
                        − PKR {before.transaction_amount.toLocaleString()} · {before.transaction_type_name} · {before.payment_medium_name}
                      </div>
                      <div className="added">+ PKR {v.transaction_amount.toLocaleString()} · {v.transaction_type_name} · {v.payment_medium_name}</div>
                    </>
                  )}
                  {!before && (
                    <div>PKR {v.transaction_amount.toLocaleString()} · {v.transaction_type_name} · {v.payment_medium_name}</div>
                  )}
                </div>
              </div>
            )
          })}
      </section>
    </div>
  )
}

function fmt(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })
}
