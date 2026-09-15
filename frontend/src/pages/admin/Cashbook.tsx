import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { AdminUser, Head, ReportResponse, ReportRow } from '../../types'

interface Filters {
  date_from: string
  date_to: string
  head_id: string
  user_id: string
  direction: '' | 'credit' | 'debit'
  include_inactive: boolean
  page: number
}

function flatten(heads: Head[], out: Head[] = []): Head[] {
  for (const h of heads) {
    out.push(h)
    flatten(h.children, out)
  }
  return out
}

export default function Cashbook() {
  const [params, setParams] = useSearchParams()
  // Filters live in the URL so returning from a detail page preserves them.
  const filters: Filters = useMemo(
    () => ({
      date_from: params.get('from') ?? '',
      date_to: params.get('to') ?? '',
      head_id: params.get('head') ?? '',
      user_id: params.get('user') ?? '',
      direction: (params.get('dir') ?? '') as Filters['direction'],
      include_inactive: params.get('inactive') === '1',
      page: Number(params.get('page') ?? '1'),
    }),
    [params],
  )

  const [data, setData] = useState<ReportResponse | null>(null)
  const [heads, setHeads] = useState<Head[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Head[]>('/heads/tree').then((t) => setHeads(flatten(t))).catch(() => setHeads([]))
    api.get<AdminUser[]>('/users').then(setUsers).catch(() => setUsers([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        page: filters.page,
        page_size: 50,
        include_inactive: filters.include_inactive,
      }
      if (filters.date_from) body.date_from = filters.date_from
      if (filters.date_to) body.date_to = filters.date_to
      if (filters.head_id) body.head_id = Number(filters.head_id)
      if (filters.user_id) body.user_id = filters.user_id
      if (filters.direction) body.direction = filters.direction
      setData(await api.post<ReportResponse>('/transactions/report', body))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load report')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void load()
  }, [load])

  function update(patch: Partial<Filters>) {
    const next = { ...filters, ...patch, page: patch.page ?? 1 }
    const p = new URLSearchParams()
    if (next.date_from) p.set('from', next.date_from)
    if (next.date_to) p.set('to', next.date_to)
    if (next.head_id) p.set('head', next.head_id)
    if (next.user_id) p.set('user', next.user_id)
    if (next.direction) p.set('dir', next.direction)
    if (next.include_inactive) p.set('inactive', '1')
    if (next.page > 1) p.set('page', String(next.page))
    setParams(p)
  }

  const t = data?.totals
  const totalPages = data && data.rows.length === 50 ? filters.page + 1 : filters.page

  return (
    <>
      <div className="top-row">
        <h1>Cashbook</h1>
      </div>

      <div className="filters">
        <div>
          <label htmlFor="from">From</label>
          <input id="from" type="date" value={filters.date_from} onChange={(e) => update({ date_from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="to">To</label>
          <input id="to" type="date" value={filters.date_to} onChange={(e) => update({ date_to: e.target.value })} />
        </div>
        <div>
          <label htmlFor="head">Head (with descendants)</label>
          <select id="head" value={filters.head_id} onChange={(e) => update({ head_id: e.target.value })}>
            <option value="">All heads</option>
            {heads.map((h) => (
              <option key={h.head_id} value={h.head_id}>{h.head_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="user">User</label>
          <select id="user" value={filters.user_id} onChange={(e) => update({ user_id: e.target.value })}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>{u.user_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dir">Direction</label>
          <select id="dir" value={filters.direction} onChange={(e) => update({ direction: e.target.value as Filters['direction'] })}>
            <option value="">Both</option>
            <option value="credit">Credit (money in)</option>
            <option value="debit">Debit (money out)</option>
          </select>
        </div>
        <div style={{ flex: 'none', minWidth: 'auto' }}>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={filters.include_inactive}
              onChange={(e) => update({ include_inactive: e.target.checked })}
            />
            Show inactive
          </label>
        </div>
      </div>

      {t && (
        <div className="summary-cards">
          <div className="card">
            <div className="hint">Credit (in)</div>
            <div className="amount">PKR {t.credit_total.toLocaleString()}</div>
          </div>
          <div className="card">
            <div className="hint">Debit (out)</div>
            <div className="amount">PKR {t.debit_total.toLocaleString()}</div>
          </div>
          <div className="card">
            <div className="hint">Balance (credit − debit)</div>
            <div className="amount">PKR {t.balance.toLocaleString()}</div>
          </div>
          {filters.include_inactive && (
            <div className="card">
              <div className="hint">Inactive entries (excluded above)</div>
              <div className="amount inactive">
                PKR {(t.inactive_credit_total - t.inactive_debit_total).toLocaleString()}
              </div>
              <div className="hint">
                in {t.inactive_credit_total.toLocaleString()} / out {t.inactive_debit_total.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="spin" />}

      {data && !loading && (
        data.rows.length === 0 ? (
          <div className="empty">No transactions match these filters.</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date (Karachi)</th>
                <th>Head</th>
                <th>User</th>
                <th>Type</th>
                <th>Medium</th>
                <th style={{ textAlign: 'right' }}>Amount (PKR)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: ReportRow) => (
                <tr key={r.transaction_id} className={r.is_active ? '' : 'inactive'}>
                  <td>{formatKarachi(r.reported_at)}</td>
                  <td>{r.head_name}</td>
                  <td>{r.user_name}</td>
                  <td><span className="tag">{r.transaction_type_name}</span>{!r.is_active && <span className="tag inactive"> inactive</span>}</td>
                  <td>{r.payment_medium_name}</td>
                  <td style={{ textAlign: 'right' }}>{r.transaction_amount.toLocaleString()}</td>
                  <td><Link to={`/transactions/${r.transaction_id}`}>Details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      <div className="pager">
        <button className="secondary" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>
          ← Prev
        </button>
        <span>Page {filters.page}</span>
        <button
          className="secondary"
          disabled={!data || data.rows.length < 50}
          onClick={() => update({ page: filters.page + 1 })}
        >
          Next →
        </button>
      </div>
      <div className="hint" style={{ textAlign: 'center' }}>
        Totals cover all matching entries, not just this page. Last page estimate: {totalPages}
      </div>
    </>
  )
}

function formatKarachi(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
