import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Head, UserDetail } from '../../types'

interface Node extends Head {
  children: Node[]
}

function withChildren(heads: Head[]): Node[] {
  const byId = new Map<number, Node>()
  heads.forEach((h) => byId.set(h.head_id, { ...h, children: [] }))
  const roots: Node[] = []
  byId.forEach((n) => {
    if (n.parent_head_id && byId.has(n.parent_head_id)) byId.get(n.parent_head_id)!.children.push(n)
    else roots.push(n)
  })
  return roots
}

/** Admin user management: role, password, active, recovery number, head
 * permissions (direct vs inherited), and a preview of the user's own view. */
export default function UserDetail() {
  const { id } = useParams()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [direct, setDirect] = useState<number[]>([])
  const [effective, setEffective] = useState<number[]>([])
  const [tree, setTree] = useState<Node[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [recovery, setRecovery] = useState('')
  const [previewing, setPreviewing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const u = await api.get<UserDetail>(`/users/${id}`)
      setUser(u)
      setRecovery(u.recovery_number ?? '')
      const p = await api.get<{ direct: number[]; effective: number[] }>(`/users/${id}/permissions`)
      setDirect(p.direct)
      setEffective(p.effective)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load user')
    }
  }, [id])

  useEffect(() => {
    void load()
    api.get<Head[]>('/heads/tree').then((t) => setTree(withChildren(t))).catch(() => {})
  }, [load])

  async function run(fn: () => Promise<unknown>, okMessage?: string) {
    setError('')
    setNotice('')
    try {
      await fn()
      if (okMessage) setNotice(okMessage)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  function togglePermission(headId: number, granted: boolean) {
    void run(() => api.post(`/users/${id}/permissions`, { head_id: headId, granted }))
  }

  if (!user && !error) return <div className="spin" />

  return (
    <>
      <Link to="/users" className="subtle" style={{ textDecoration: 'none', fontWeight: 600 }}>← All users</Link>
      <h1>{user?.user_name}</h1>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="ok-banner">{notice}</div>}

      {user && (
        <div className="txn-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: '1.5rem' }}>
          <section>
            <div className="card">
              <h2>Account</h2>
              <ul className="review-list">
                <li><span className="k">Role</span><span className="v">{user.user_role_name}</span></li>
                <li>
                  <span className="k">Status</span>
                  <span className="v"><span className={`tag${user.is_active ? '' : ' inactive'}`}>{user.is_active ? 'active' : 'inactive'}</span></span>
                </li>
              </ul>
              <label htmlFor="role">Change role (affects future entries only)</label>
              <select
                id="role"
                value={user.user_role_name}
                onChange={(e) => run(() => api.patch(`/users/${id}`, { role: e.target.value }), 'Role updated; their sessions were signed out.')}
              >
                <option value="admin">admin</option>
                <option value="debit_user">debit_user</option>
                <option value="credit_user">credit_user</option>
              </select>
              <div className="toggle-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Active</div>
                  <div className="hint">Inactive users cannot sign in or recover.</div>
                </div>
                <div className="switch">
                  <input
                    type="checkbox"
                    checked={!!user.is_active}
                    onChange={(e) => run(() => api.patch(`/users/${id}`, { is_active: e.target.checked }))}
                  />
                  <span className="slider" />
                </div>
              </div>
            </div>

            <div className="card">
              <h2>Security</h2>
              <label htmlFor="npass">Set / reset password</label>
              <input id="npass" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
              <button
                className="block secondary"
                disabled={!newPassword}
                onClick={() => run(() => api.patch(`/users/${id}`, { new_password: newPassword }), 'Password changed; old sessions signed out.').then(() => setNewPassword(''))}
              >
                Reset password
              </button>
              <label htmlFor="rec" style={{ marginTop: '1rem' }}>Recovery number (designated, unique across accounts)</label>
              <input id="rec" value={recovery} onChange={(e) => setRecovery(e.target.value)} />
              <button
                className="block secondary"
                onClick={() => run(() => api.patch(`/users/${id}`, { recovery_number: recovery || null }), 'Recovery number saved.')}
              >
                Save recovery number
              </button>
            </div>
          </section>

          <section>
            <div className="card">
              <h2>Assigned heads</h2>
              <div className="hint" style={{ marginBottom: '0.6rem' }}>
                Ticking a parent includes all of its sub-heads. Yellow = inherited access from a granted ancestor.
              </div>
              <div className="perm-checks tree-view">
                <PermissionTree
                  nodes={tree}
                  direct={direct}
                  effective={effective}
                  onToggle={togglePermission}
                />
              </div>
            </div>
            <button className="secondary" onClick={() => setPreviewing(!previewing)}>
              {previewing ? 'Hide user view preview' : 'Preview user view'}
            </button>
            {previewing && <UserPreview effective={effective} />}
          </section>
        </div>
      )}
    </>
  )
}

function PermissionTree({ nodes, direct, effective, onToggle }: {
  nodes: Node[]
  direct: number[]
  effective: number[]
  onToggle: (id: number, granted: boolean) => void
}) {
  return (
    <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
      {nodes.map((n) => {
        const isDirect = direct.includes(n.head_id)
        const isInherited = !isDirect && effective.includes(n.head_id)
        return (
          <li key={n.head_id}>
            <div className="tree-item">
              <input
                type="checkbox"
                checked={isDirect}
                onChange={(e) => onToggle(n.head_id, e.target.checked)}
                aria-label={`Grant ${n.head_name}`}
              />
              <span className="name">{n.head_name}</span>
              {isInherited && <span className="flag inherited">inherited</span>}
              {n.is_transactionable && <span className="flag tx">transactions</span>}
              {!n.is_active && <span className="flag off">inactive</span>}
            </div>
            {n.children.length > 0 && (
              <PermissionTree nodes={n.children} direct={direct} effective={effective} onToggle={onToggle} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Renders the same tree the regular user sees: only effective branches. */
function UserPreview({ effective }: { effective: number[] }) {
  const [allHeads, setAllHeads] = useState<Head[]>([])

  useEffect(() => {
    api.get<Head[]>('/heads/tree').then(setAllHeads).catch(() => {})
  }, [])

  const flat = new Map<number, Head>()
  function walk(ns: Head[]) {
    ns.forEach((h) => {
      flat.set(h.head_id, h)
      walk(h.children)
    })
  }
  walk(allHeads)

  const visible = [...flat.values()].filter((h) => effective.includes(h.head_id))
  const roots = visible.filter((h) => !h.parent_head_id || !effective.includes(h.parent_head_id))

  return (
    <div className="card" style={{ maxWidth: 360, marginTop: '0.8rem' }}>
      <h2>What this user sees</h2>
      {roots.length === 0 && <div className="empty">No heads granted yet.</div>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {roots.map((h) => (
          <li key={h.head_id}>
            <button className="head-card" style={{ pointerEvents: 'none' }}>
              <span>{h.head_name}</span>
              <span className="chev">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
