import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Head } from '../../types'
import { useFlow } from '../UserFlow'

/** Top level and nested head levels: permitted children as tappable cards,
 * Make transaction FIRST on a transactionable head, Back goes one level up. */
export default function HeadLevel() {
  const { setDraft, setStep, draft } = useFlow()
  const [path, setPath] = useState<Head[]>([]) // current drill-down trail
  const [roots, setRoots] = useState<Head[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<Head[]>('/heads/tree')
      .then((tree) => {
        setRoots(tree)
        // Draft in progress? Return to that head (with context trail if available).
        if (draft.headId) {
          const trail = findTrail(tree, draft.headId)
          if (trail) setPath(trail)
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load heads'))
      .finally(() => setLoading(false))
  }, [draft.headId])

  function findTrail(tree: Head[], id: number): Head[] | null {
    for (const h of tree) {
      if (h.head_id === id) return [h]
      const sub = findTrail(h.children, id)
      if (sub) return [h, ...sub]
    }
    return null
  }

  const current = path.length ? path[path.length - 1] : null
  const children = current ? current.children : roots
  const crumbs = path.map((h) => h.head_name).join(' / ')

  function openHead(h: Head) {
    setPath((p) => [...p, h])
  }

  function goBack() {
    setPath((p) => p.slice(0, -1))
  }

  function startTransaction(h: Head) {
    setDraft({
      ...draft,
      headId: h.head_id,
      // path already ends at this head; don't append it twice.
      headPath: path.map((x) => ({ head_id: x.head_id, head_name: x.head_name })),
    })
    setStep('amount')
  }

  const canMakeTxn = current !== null && current.is_transactionable && current.is_active

  return (
    <section>
      <div className="topbar" style={{ marginBottom: 0 }}>
        {path.length > 0 && (
          <button className="secondary" onClick={goBack}>
            ← Back
          </button>
        )}
        <span className="title" style={{ textAlign: path.length ? 'center' : 'left' }}>
          {current ? current.head_name : 'My heads'}
        </span>
        {path.length > 0 && <span style={{ width: 74 }} />}
      </div>
      {crumbs && <div className="crumb">{crumbs}</div>}
      {current?.head_description && <div className="hint" style={{ marginBottom: '0.5rem' }}>{current.head_description}</div>}
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="spin" />}

      {!loading && canMakeTxn && (
        <button className="block" onClick={() => startTransaction(current)}>
          ＋ Make transaction
        </button>
      )}

      {!loading && children.length === 0 && !canMakeTxn && (
        <div className="empty">No heads here yet.</div>
      )}

      {!loading &&
        children.map((h) => (
          <button
            key={h.head_id}
            className={`head-card${h.is_active ? '' : ' inactive'}`}
            onClick={() => openHead(h)}
          >
            <span>{h.head_name}</span>
            <span className="chev">›</span>
          </button>
        ))}
    </section>
  )
}
