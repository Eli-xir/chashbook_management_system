import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { Head } from '../../types'

interface Node extends Head {
  children: Node[]
}

export default function Heads() {
  const [tree, setTree] = useState<Node[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const [form, setForm] = useState({ name: '', description: '', parent: '', transactionable: false })
  const [editing, setEditing] = useState<Head | null>(null)
  const [moveHead, setMoveHead] = useState<Head | null>(null)
  const [moveTarget, setMoveTarget] = useState('')

  const load = useCallback(async () => {
    try {
      // The API already returns a nested tree; use it directly.
      setTree((await api.get<Head[]>('/heads/tree')) as Node[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load heads')
    }
  }, [])

  useEffect(() => {
    void load()
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

  async function createHead() {
    if (!form.name.trim()) return
    await run(() =>
      api.post('/heads', {
        head_name: form.name.trim(),
        head_description: form.description || null,
        parent_head_id: form.parent ? Number(form.parent) : null,
        is_transactionable: form.transactionable,
      }),
    )
    setForm({ name: '', description: '', parent: '', transactionable: false })
  }

  function toggleExpand(id: number) {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const flat: Node[] = []
  function walk(ns: Node[]) {
    ns.forEach((n) => {
      flat.push(n)
      walk(n.children)
    })
  }
  walk(tree)

  return (
    <>
      <h1>Heads</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card tree-view">
        {tree.length === 0 && <div className="empty">No heads yet. Create the first one below.</div>}
        <ul style={{ paddingLeft: 0 }}>
          {tree.map((n) => (
            <NodeRow key={n.head_id} node={n} expanded={expanded} toggle={toggleExpand} onEdit={setEditing} onMove={setMoveHead} />
          ))}
        </ul>
      </div>

      {editing && (
        <div className="card">
          <h2>Edit “{editing.head_name}”</h2>
          <label htmlFor="ename">Name</label>
          <input id="ename" value={editing.head_name} onChange={(e) => setEditing({ ...editing, head_name: e.target.value })} />
          <label htmlFor="edesc">Description</label>
          <textarea id="edesc" value={editing.head_description ?? ''} onChange={(e) => setEditing({ ...editing, head_description: e.target.value })} />
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 700 }}>Accepts transactions</div>
              <div className="hint">“Make transaction” appears for permitted users on this head.</div>
            </div>
            <div className="switch">
              <input
                type="checkbox"
                checked={editing.is_transactionable}
                onChange={(e) => setEditing({ ...editing, is_transactionable: e.target.checked })}
              />
              <span className="slider" />
            </div>
          </div>
          <div className="toggle-row">
            <div>
              <div style={{ fontWeight: 700 }}>Active</div>
              <div className="hint">An inactive head blocks new entries in its whole subtree.</div>
            </div>
            <div className="switch">
              <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
              <span className="slider" />
            </div>
          </div>
          <button className="block" disabled={busy} onClick={() => run(() => api.patch(`/heads/${editing.head_id}`, {
            head_name: editing.head_name,
            head_description: editing.head_description,
            is_transactionable: editing.is_transactionable,
            is_active: editing.is_active,
          })).then(() => setEditing(null))}>
            Save changes
          </button>
          <button className="subtle block" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}

      {moveHead && (
        <div className="card">
          <h2>Move “{moveHead.head_name}”</h2>
          <div className="hint" style={{ marginBottom: '0.6rem' }}>
            Moving a head moves its whole subtree. Inherited permissions change accordingly;
            existing transactions stay linked to this head and will show its new location.
          </div>
          <label htmlFor="moveto">New parent</label>
          <select id="moveto" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
            <option value="">(no parent — top level)</option>
            {flat
              .filter((n) => n.head_id !== moveHead.head_id)
              .map((n) => (
                <option key={n.head_id} value={n.head_id}>{n.head_name}</option>
              ))}
          </select>
          <button
            className="block"
            disabled={busy}
            onClick={() => run(() => api.post(`/heads/${moveHead.head_id}/move`, {
              new_parent_head_id: moveTarget ? Number(moveTarget) : null,
            })).then(() => { setMoveHead(null); setMoveTarget('') })}
          >
            Move here
          </button>
          <button className="subtle block" onClick={() => { setMoveHead(null); setMoveTarget('') }}>Cancel</button>
        </div>
      )}

      <div className="card">
        <h2>Create a head</h2>
        <label htmlFor="nname">Name</label>
        <input id="nname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label htmlFor="ndesc">Description</label>
        <textarea id="ndesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <label htmlFor="nparent">Parent</label>
        <select id="nparent" value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })}>
          <option value="">(none — top level)</option>
          {flat.map((n) => (
            <option key={n.head_id} value={n.head_id}>{n.head_name}</option>
          ))}
        </select>
        <div className="toggle-row">
          <div>
            <div style={{ fontWeight: 700 }}>Accepts transactions</div>
            <div className="hint">Can be on roots, middles, or leaves.</div>
          </div>
          <div className="switch">
            <input
              type="checkbox"
              checked={form.transactionable}
              onChange={(e) => setForm({ ...form, transactionable: e.target.checked })}
            />
            <span className="slider" />
          </div>
        </div>
        <button className="block" disabled={busy} onClick={createHead}>Create head</button>
      </div>
    </>
  )
}

function NodeRow({ node, expanded, toggle, onEdit, onMove, depth = 0 }: {
  node: Node
  expanded: Set<number>
  toggle: (id: number) => void
  onEdit: (h: Head) => void
  onMove: (h: Head) => void
  depth?: number
}) {
  const open = expanded.has(node.head_id)
  return (
    <li>
      <div className="tree-item">
        {node.children.length > 0 ? (
          <button className="subtle" style={{ minHeight: 32, padding: '0 0.5rem' }} onClick={() => toggle(node.head_id)}>
            {open ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: 34, display: 'inline-block' }} />
        )}
        <span className="name">{node.head_name}</span>
        {node.is_transactionable && <span className="flag tx">transactions</span>}
        {!node.is_active && <span className="flag off">inactive</span>}
        <span style={{ flex: 1 }} />
        <button className="subtle" onClick={() => onEdit(node)}>Edit</button>
        <button className="subtle" onClick={() => onMove(node)}>Move</button>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <NodeRow key={c.head_id} node={c} expanded={expanded} toggle={toggle} onEdit={onEdit} onMove={onMove} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
