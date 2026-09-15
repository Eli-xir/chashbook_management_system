import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { AdminUser } from '../../types'

export default function Users() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', role: 'debit_user', recovery: '' })

  const load = useCallback(async () => {
    try {
      setUsers(await api.get<AdminUser[]>('/users'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    setError('')
    try {
      await api.post('/users', {
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        recovery_number: form.recovery || null,
      })
      setCreating(false)
      setForm({ username: '', password: '', role: 'debit_user', recovery: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user')
    }
  }

  return (
    <>
      <div className="top-row">
        <h1>Users</h1>
        <button onClick={() => setCreating(!creating)}>{creating ? 'Close' : '+ New user'}</button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {creating && (
        <div className="card">
          <h2>Create user</h2>
          <label htmlFor="uname">Username</label>
          <input id="uname" value={form.username} autoCapitalize="none" onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <label htmlFor="upass">Initial password</label>
          <input id="upass" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <label htmlFor="urole">Role</label>
          <select id="urole" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="debit_user">debit_user — records debits/payable debits</option>
            <option value="credit_user">credit_user — records credits/payable credits</option>
            <option value="admin">admin — manages everything</option>
          </select>
          <label htmlFor="urec">Recovery number (optional, unique per account)</label>
          <input id="urec" value={form.recovery} onChange={(e) => setForm({ ...form, recovery: e.target.value })} />
          <button className="block" onClick={create}>Create user</button>
        </div>
      )}

      <table className="data">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Recovery number</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} className={u.is_active ? '' : 'inactive'}>
              <td>{u.user_name}</td>
              <td><span className="tag">{u.user_role_name}</span></td>
              <td>{u.recovery_number ?? '—'}</td>
              <td><span className={`tag${u.is_active ? '' : ' inactive'}`}>{u.is_active ? 'active' : 'inactive'}</span></td>
              <td><Link to={`/users/${u.user_id}`}>Manage</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
