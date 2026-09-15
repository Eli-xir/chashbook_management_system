import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import type { Head, PaymentMedium } from '../types'
import { Alert, Brand, Empty, Icon, money } from '../ui'
import { ImagePicker, VoicePicker } from '../Attachments'
import { fileUrl } from '../api'

type Draft = { headId: number | null; amount: string; mediumId: number | null; imageId: number | null; voiceId: number | null; payable: boolean; direction: 'debit' | 'credit'; key: string; locked: boolean }
const fresh = (): Draft => ({ headId: null, amount: '', mediumId: null, imageId: null, voiceId: null, payable: false, direction: 'debit', key: crypto.randomUUID(), locked: false })
const steps = ['amount', 'image', 'voice', 'payable', 'review']
const labels = ['Amount', 'Photo', 'Voice note', 'Payable', 'Review']
export default function UserFlow() {
  const { me, signOut } = useAuth()
  const [params, setParams] = useSearchParams()
  const storageKey = `cashbook-draft:${me?.user_id}`
  const [draft, setDraft] = useState<Draft>(() => { try { return { ...fresh(), ...JSON.parse(sessionStorage.getItem(storageKey) || '{}') } } catch { return fresh() } })
  const [tree, setTree] = useState<Head[]>([]), [mediums, setMediums] = useState<PaymentMedium[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [sending, setSending] = useState(false)
  const [sentId, setSentId] = useState<number | null>(null)
  const sent = useRef(false), flight = useRef(false), content = useRef<HTMLDivElement>(null)
  const requestedStep = params.get('step') || 'heads'
  const step = sent.current ? 'success' : draft.locked ? 'review' : ['heads', ...steps, 'success'].includes(requestedStep) ? requestedStep : 'heads', idx = steps.indexOf(step)
  const pathIds = (params.get('path') || '').split('.').map(Number).filter(Boolean)
  const path: Head[] = []; let children = tree
  for (const id of pathIds) { const node = children.find(h => h.head_id === id); if (!node) break; path.push(node); children = node.children }
  const current = path.at(-1), available = path.every(h => h.is_active)
  const direction = me?.role === 'admin' ? draft.direction : me?.role === 'credit_user' ? 'credit' : 'debit'
  const draftPath: Head[] = []
  function findPath(nodes: Head[], ids: Head[]): boolean { for (const h of nodes) { if (h.head_id === draft.headId) { draftPath.push(...ids, h); return true } if (findPath(h.children, [...ids, h])) return true } return false }
  findPath(tree, [])
  async function load() { setLoading(true); setError(''); try { const [heads, methods] = await Promise.all([api.get<Head[]>('/heads/tree'), api.get<PaymentMedium[]>('/transactions/mediums')]); setTree(heads); setMediums(methods) } catch (e) { setError((e as Error).message) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  useEffect(() => { if (!sent.current) sessionStorage.setItem(storageKey, JSON.stringify(draft)) }, [draft, storageKey])
  useEffect(() => { content.current?.scrollTo(0, 0); content.current?.focus() }, [step, params.get('path')])
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (draft.amount && !sent.current) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [draft.amount])
  function update(patch: Partial<Draft>) { setDraft(d => d.locked ? d : ({ ...d, ...patch, key: crypto.randomUUID() })) }
  function go(next: string, ids = path.map(h => h.head_id), replace = false) { setError(''); setParams({ ...(ids.length ? { path: ids.join('.') } : {}), ...(next !== 'heads' ? { step: next } : {}) }, { replace }) }
  function back() { if (busy || sending) return; if (idx > 0) go(steps[idx - 1]); else if (idx === 0) go('heads'); else go('heads', pathIds.slice(0, -1)) }
  function begin() { if (!current) return; if (draft.headId && draft.headId !== current.head_id && draft.amount && !window.confirm('Start an entry here? This will replace your unfinished entry.')) return; if (draft.headId !== current.head_id) setDraft({ ...fresh(), headId: current.head_id, mediumId: mediums[0]?.payment_medium_id ?? null }); else if (!draft.mediumId) update({ mediumId: mediums[0]?.payment_medium_id ?? null }); go(draft.locked ? 'review' : 'amount') }
  async function logout() { if (draft.amount && !sent.current && !window.confirm('Sign out and discard your unfinished entry?')) return; try { await signOut(); sessionStorage.removeItem(storageKey) } catch (e) { setError((e as Error).message) } }
  async function submit() {
    if (flight.current || sent.current) return
    flight.current = true; setSending(true); setError(''); setDraft(d => ({ ...d, locked: true }))
    try {
      const result = await api.post<{ transaction_id: number }>('/transactions/create', { head_id: draft.headId, amount: Number(draft.amount), payment_medium_id: draft.mediumId, image_id: draft.imageId, voice_id: draft.voiceId, payable: draft.payable, idempotency_key: draft.key, ...(me?.role === 'admin' ? { transaction_type_name: `${draft.payable ? 'payable_' : ''}${direction}` } : {}) })
      sent.current = true; sessionStorage.removeItem(storageKey); setSentId(result.transaction_id); go('success', [], true)
    } catch (e) { setError((e as Error).message + ' Your entry is kept. Retry Send with the same details.'); if ((e as {status?: number}).status && (e as {status: number}).status < 500) setDraft(d => ({ ...d, locked: false })) }
    finally { flight.current = false; setSending(false) }
  }
  function restart() { sent.current = false; setSentId(null); setDraft(fresh()); go('heads', [], true); void load() }
  const valid = /^\d+$/.test(draft.amount) && Number(draft.amount) <= 2147483647 && draft.mediumId !== null
  const title = step === 'heads' ? current?.head_name || 'Where does it belong?' : step === 'amount' ? 'How much?' : step === 'image' ? 'Add a photo' : step === 'voice' ? 'Add a voice note' : step === 'payable' ? 'Is this payable?' : step === 'review' ? 'Ready to send?' : 'Entry sent'
  return <div className="user-shell"><header className="user-top"><Brand/><div className="row"><span className="user-name">{me?.username}</span>{me?.role === 'admin' ? <Link className="subtle" to="/">Close</Link> : <button className="icon-button" aria-label="Sign out" onClick={logout}><Icon name="logout"/></button>}</div></header>
    <div className="flow-heading"><span className={`direction-pill ${direction}`}>{direction === 'credit' ? '↙ Money in' : '↗ Money out'}</span><p>A little less paperwork.<br/><strong>A little more clarity.</strong></p></div>
    <section className="flow-panel" aria-label="Make a transaction">
      <header className="panel-top"><button className="back-button" disabled={busy || sending || draft.locked || (step === 'heads' && !path.length) || step === 'success'} onClick={back}><Icon name="back" size={18}/>Back</button><span>{step === 'heads' ? 'CHOOSE A HEAD' : step === 'success' ? 'ALL DONE' : `STEP ${idx + 1} OF 5`}</span><span className="panel-dot"/></header>
      {idx >= 0 && <div className="step-progress" aria-label={`Step ${idx + 1} of 5`}>{steps.map((s, i) => <span key={s} className={i <= idx ? 'filled' : ''}/>)}</div>}
      <div ref={content} className="panel-content" tabIndex={-1}>
      {step !== 'success' && <><span className="eyebrow">{step === 'heads' ? path.length ? 'KEEP EXPLORING' : `HELLO, ${me?.username}` : labels[idx]?.toUpperCase()}</span><h1>{title}</h1><p className="step-help">{step === 'heads' ? 'Tap a head to continue.' : step === 'amount' ? 'Enter the amount in Pakistani rupees.' : step === 'image' ? 'A receipt or photo helps tell the story. This is optional.' : step === 'voice' ? 'Explain it in your own words. This is optional.' : step === 'payable' ? 'Choose whether this amount is owed.' : 'Take a moment to check your entry.'}</p></>}
      <Alert>{error}</Alert>{loading ? <div className="spin" aria-label="Loading heads"/> : <>
      {step === 'heads' && <>
        {path.length > 0 && <div className="breadcrumbs">Home {path.map(h => <span key={h.head_id}> / {h.head_name}</span>)}</div>}
        {!available && <Alert>This branch is inactive. Contact your administrator.</Alert>}
        {current?.granted && current.is_transactionable && available && <button className="head-card transaction-card" onClick={begin}><span className="head-symbol"><Icon name="plus"/></span><span><strong>Make transaction</strong><small>Record an entry under {current.head_name}</small></span><Icon name="arrow" size={18}/></button>}
        {!current && draft.headId && draft.amount && <button className="resume-card" onClick={() => go(draft.locked ? 'review' : 'amount', draftPath.map(h => h.head_id))}><Icon name="clock"/><span><strong>Continue your unfinished entry</strong><small>PKR {money(Number(draft.amount))}</small></span><Icon name="arrow"/></button>}
        <div className="head-options">{children.map((h, i) => <button key={h.head_id} disabled={!available || !h.is_active} className="head-card" onClick={() => go('heads', [...pathIds, h.head_id])}><span className={`head-symbol tone-${i % 4}`}>{h.image_id ? <img src={`/api/heads/${h.head_id}/image`} alt=""/> : <Icon name="folder"/>}</span><span><strong>{h.head_name}</strong><small>{!h.is_active ? 'Currently unavailable' : h.head_description || (h.children.length ? `${h.children.length} ${h.children.length === 1 ? 'subhead' : 'subheads'}` : h.is_transactionable && h.granted ? 'Tap to make an entry' : 'View head')}</small></span><Icon name="arrow" size={18}/></button>)}</div>
        {!children.length && !current && <Empty title="Your heads will appear here">Ask your administrator to assign a head to your account.</Empty>}
        {!children.length && current && (!current.granted || !current.is_transactionable) && <Empty title="No entries available here">Use Back to choose another head.</Empty>}
        {error && <button className="secondary block" onClick={load}>Try again</button>}
      </>}
      {step === 'amount' && <><div className="selected-head"><Icon name="folder"/><span>{draftPath.map(h => h.head_name).join(' / ') || 'Choose a head first'}</span></div><label htmlFor="amount">Amount</label><div className="amount-input"><span>PKR</span><input id="amount" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={draft.amount} onChange={e => update({ amount: e.target.value.replace(/[^0-9]/g, '') })} disabled={draft.locked}/></div>{draft.amount && !valid && <p className="hint">Use a whole amount from 0 to 2,147,483,647 and select a payment method.</p>}<label>Payment method</label><div className="choice-grid">{mediums.map(m => <button key={m.payment_medium_id} aria-pressed={draft.mediumId === m.payment_medium_id} className={`choice-card ${draft.mediumId === m.payment_medium_id ? 'selected' : ''}`} onClick={() => update({ mediumId: m.payment_medium_id })}><Icon name={m.payment_medium_name.toLowerCase() === 'cash' ? 'book' : 'shield'}/><strong>{m.payment_medium_name}</strong>{draft.mediumId === m.payment_medium_id && <Icon name="check" size={16}/>}</button>)}</div>{!mediums.length && <Alert>Ask your administrator to add a payment method.</Alert>}{me?.role === 'admin' && <><label htmlFor="direction">Direction</label><select id="direction" value={draft.direction} onChange={e => update({ direction: e.target.value as 'debit' | 'credit' })}><option value="debit">Debit · money out</option><option value="credit">Credit · money in</option></select></>}</>}
      {step === 'image' && <ImagePicker value={draft.imageId} onChange={id => update({ imageId: id })} onBusy={setBusy}/>}
      {step === 'voice' && <VoicePicker value={draft.voiceId} onChange={id => update({ voiceId: id })} onBusy={setBusy}/>}
      {step === 'payable' && <div className="payable-options">{[false, true].map(value => <button key={String(value)} className={`head-card ${draft.payable === value ? 'selected' : ''}`} aria-pressed={draft.payable === value} onClick={() => update({ payable: value })}><span className="head-symbol"><Icon name={value ? 'clock' : 'check'}/></span><span><strong>{value ? 'Yes, this amount is owed' : 'No, a normal entry'}</strong><small>{value ? `Record as payable ${direction}` : `Record as ${direction}`}</small></span><span className="radio-dot"/></button>)}</div>}
      {step === 'review' && <><ol className="path-review">{draftPath.map(h => <li key={h.head_id}><span/><strong>{h.head_name}</strong></li>)}</ol><div className="review-total"><span>{direction === 'credit' ? 'Money in' : 'Money out'}</span><strong><small>PKR</small> {money(Number(draft.amount))}</strong></div><dl className="review-details"><div><dt>Payment method</dt><dd>{mediums.find(m => m.payment_medium_id === draft.mediumId)?.payment_medium_name}</dd></div><div><dt>Payable</dt><dd>{draft.payable ? 'Yes' : 'No'}</dd></div><div><dt>Entered by</dt><dd>{me?.username}</dd></div></dl><h3>Attachments</h3>{draft.imageId ? <div className="review-attachment"><span><Icon name="image" size={18}/>Photo</span><img src={fileUrl('images', draft.imageId)} alt="Transaction photo"/></div> : <p className="hint">No photo attached</p>}{draft.voiceId ? <div className="review-attachment"><span><Icon name="mic" size={18}/>Voice note</span><audio controls src={fileUrl('voice', draft.voiceId)}/></div> : <p className="hint">No voice note attached</p>}<p className="review-note"><Icon name="shield" size={16}/>Your entry will be sent to your administrator.</p></>}
      {step === 'success' && <div className="success-view"><span className="success-icon"><Icon name="check" size={44}/></span><span className="eyebrow">ALL TAKEN CARE OF</span><h1>Entry sent.</h1><p>Your administrator can now see your entry.</p>{sentId && <span className="tag">Reference #{sentId}</span>}<button className="block" onClick={restart}>Make another entry<Icon name="plus" size={18}/></button>{me?.role === 'admin' && <Link className="subtle" to="/">Back to cashbook</Link>}</div>}
      </>}</div>
      {idx >= 0 && <footer className="panel-footer"><button className="block" disabled={loading || busy || sending || !draft.headId || (step === 'amount' && !valid) || (step === 'review' && !valid)} onClick={() => step === 'review' ? void submit() : go(steps[idx + 1])}>{sending ? 'Sending…' : step === 'review' ? 'Send entry' : (step === 'image' && !draft.imageId) || (step === 'voice' && !draft.voiceId) ? 'Skip for now' : step === 'payable' ? 'Review entry' : 'Continue'}<Icon name={step === 'review' ? 'check' : 'arrow'} size={18}/></button>{step === 'review' && !draft.locked && <button className="subtle block" onClick={() => go('amount')}>Go back and edit</button>}</footer>}
    </section><footer className="user-foot"><Icon name="shield" size={14}/> Private office workspace</footer></div>
}
