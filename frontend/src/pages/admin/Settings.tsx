import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import type { PaymentMedium } from '../../types'

export default function Settings() {
  const { me } = useAuth()
  const [mediums, setMediums] = useState<PaymentMedium[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })

  const load = useCallback(async () => {
    try {
      setMediums(await api.get<PaymentMedium[]>('/settings/payment-mediums'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load settings')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError('')
    setNotice('')
    try {
      await fn()
      setNotice(ok)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  async function changePassword() {
    if (pw.next !== pw.confirm) {
      setError('New passwords do not match')
      return
    }
    await run(
      () => api.post('/auth/change-password', { current_password: pw.current, new_password: pw.next }),
      'Password changed.',
    )
    setPw({ current: '', next: '', confirm: '' })
  }

  return (
    <>
      <h1>Settings</h1>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="ok-banner">{notice}</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Payment mediums</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Used by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {mediums.map((m) => (
              <tr key={m.payment_medium_id}>
                <td>
                  <input
                    value={m.payment_medium_name}
                    onChange={(e) =>
                      setMediums((ms) => ms.map((x) => (x.payment_medium_id === m.payment_medium_id ? { ...x, payment_medium_name: e.target.value } : x)))
                    }
                  />
                </td>
                <td style={{ textAlign: 'right' }}>{m.reference_count ?? '—'} entries</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="secondary"
                    style={{ minHeight: 40 }}
                    onClick={() => run(() => api.patch(`/settings/payment-mediums/${m.payment_medium_id}`, { name: m.payment_medium_name }), 'Medium renamed.')}
                  >
                    Save
                  </button>{' '}
                  <button
                    className="danger"
                    style={{ minHeight: 40 }}
                    disabled={(m.reference_count ?? 0) > 0}
                    title={m.reference_count ? 'Used by existing entries; cannot be deleted' : 'Delete'}
                    onClick={() => run(() => api.delete(`/settings/payment-mediums/${m.payment_medium_id}`), 'Medium deleted.')}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>
          <input value={name} placeholder="New medium name (e.g. Easypaisa)" onChange={(e) => setName(e.target.value)} />
          <button
            style={{ flex: 'none' }}
            onClick={() => run(() => api.post('/settings/payment-mediums', { name }), 'Medium added.').then(() => setName(''))}
            disabled={!name.trim()}
          >
            Add
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>My account ({me?.username})</h2>
        <label htmlFor="curpw">Current password</label>
        <input id="curpw" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <label htmlFor="npw">New password</label>
        <input id="npw" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <label htmlFor="cpw">Confirm new password</label>
        <input id="cpw" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        <button className="block" onClick={changePassword} disabled={!pw.current || !pw.next}>
          Change password
        </button>
      </div>

      <div className="hint">
        Transaction types and user roles are fixed system values and are not editable here.
      </div>
    </>
  )
}
