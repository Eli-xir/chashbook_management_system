import { useEffect, useRef, useState } from 'react';
import type { AdminUser, Attachment, Head, Transaction, UserOverview } from '../types';
import { permittedHeads } from '../utils/permissions';
import { cashbookApi } from '../../../data/cashbookApi';
import { AttachmentInput } from './AttachmentInput';
import { Dialog } from './Dialog';
import { TransactionCard } from '../../Ledger/TransactionCard';
import { creditDocument } from '../../Ledger/ledgerExport';
import { ReportActions } from '../../Ledger/ReportActions';
import { money } from '../../Ledger/ledgerModel';

type Screen = 'home' | 'category' | 'heads' | 'images' | 'voice' | 'review';
const formatAmount = (value: number) => money(value);
const ignoreChange = (_value: boolean) => {};

export function UserPreview({ user, heads, assigned, pending, onClose, preview = true, adminCredit = false, onSubmitted,
  onDirtyChange = ignoreChange, onBusyChange = ignoreChange }: {
  user: AdminUser; heads: Head[]; assigned: number[]; pending: boolean; onClose: () => void;
  preview?: boolean;
  adminCredit?: boolean;
  onSubmitted?: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [ledgerOpen, showLedger] = useState(false);
  const swipeStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [openedCredit, setOpenedCredit] = useState<Transaction | null>(null);
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const previewOnly = preview && !adminCredit;
  const visible = adminCredit ? heads.filter((head) => head.is_active) : permittedHeads(heads, assigned);
  const headId = path.at(-1);
  const selectedHead = visible.find((head) => head.head_id === headId);
  const visibleIds = new Set(visible.map((head) => head.head_id));
  const children = visible.filter((head) => headId === undefined
    ? head.parent_head_id === null || !visibleIds.has(head.parent_head_id)
    : head.parent_head_id === headId).sort((a, b) => a.head_name.localeCompare(b.head_name));
  const category = overview?.categories.find((item) => item.id === categoryId);
  const amountValid = amount.trim() !== '' && Number.isFinite(Number(amount)) && Number(amount) > 0;
  const valid = amountValid && !!category && !!selectedHead?.is_transactionable;
  const dirty = amount !== '' || attachments.length > 0 || screen !== 'home';
  const locked = busy || attachmentBusy;
  const title = screen === 'category' ? 'Choose a category' : screen === 'heads'
    ? selectedHead?.head_name ?? (headId === undefined ? 'Choose a head' : 'Head unavailable')
    : screen === 'images' ? 'Images' : screen === 'voice' ? 'Voice notes' : 'Review transaction';
  const choices = screen === 'category'
    ? (overview?.categories ?? []).map((item) => ({ id: item.id, name: item.name, image: null as string | null }))
    : children.map((head) => ({ id: head.head_id, name: head.head_name, image: head.image_url }));

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(locked); }, [locked, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    let ignore = false;
    setRefreshing(true);
    cashbookApi.userOverview(user.user_id).then((data) => {
      if (!ignore) { setOverview(data); setError(''); }
    }).catch((error) => { if (!ignore) setError(error instanceof Error ? error.message : 'Could not load your balance.'); })
      .finally(() => { if (!ignore) setRefreshing(false); });
    return () => { ignore = true; };
  }, [user.user_id, reload]);

  function go(next: Screen) { setError(''); setScreen(next); }
  function back() {
    if (locked) return;
    if (screen === 'heads' && path.length) { setPath((current) => current.slice(0, -1)); setError(''); }
    else go(screen === 'category' ? 'home' : screen === 'heads' ? 'category'
      : screen === 'images' ? 'heads' : screen === 'voice' ? 'images' : 'voice');
  }
  async function submit() {
    if (previewOnly || !valid || pending || !user.is_active || locked) return;
    setBusy(true); setError('');
    try {
      const input = { amount: Number(amount), categoryId: categoryId!, headId: headId!, attachments };
      if (adminCredit) await cashbookApi.creditUser(user.user_id, input);
      else await cashbookApi.submitTransaction(user.user_id, input);
      setScreen('home'); setAmount(''); setCategoryId(null); setPath([]); setAttachments([]); setSuccess(true);
      setReload((value) => value + 1);
      await onSubmitted?.();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not submit. Your input has been kept.'); }
    finally { setBusy(false); }
  }
  function updateAttachments(kind: Attachment['kind'], items: Attachment[]) {
    setAttachments((current) => [...current.filter((item) => item.kind !== kind), ...items]);
  }

  return <div className="user-preview flex-col gap-md">
    <header className="preview-toolbar flex-row items-center justify-between gap-sm">
      <span className="hint text-muted">{adminCredit ? `Credit · ${user.user_name}` : preview ? `Preview · ${user.user_name}` : 'Cashbook'}</span>
      <div className="flex-row items-center gap-sm">
      <button className="btn" disabled={locked || refreshing} onClick={() => setReload((value) => value + 1)}>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <button className={`btn${preview ? ' preview-close' : ''}`} disabled={locked}
        onClick={() => !preview && dirty ? setConfirmLogout(true) : onClose()}
        aria-label={adminCredit ? 'Close credit workflow' : preview ? 'Close user preview' : 'Logout'} title={preview ? 'Back to admin ledger' : 'Logout'}>
        {preview ? '×' : 'Logout'}
      </button>
      </div>
    </header>
    {previewOnly && <p role="status" className="hint">Preview only. Uploads and transaction submission are disabled.</p>}
    {pending && <p role="status" className="hint">Preview includes unapplied permissions.</p>}
    {!user.is_active && <p role="status">This account is deactivated and cannot transact.</p>}
    {error && <p role="alert" className="text-error">{error}</p>}
    {!overview ? <>
      <p role="status">{error ? 'Balance unavailable.' : 'Loading balance…'}</p>
      {error && <button className="btn" disabled={refreshing} onClick={() => setReload((value) => value + 1)}>Retry</button>}
    </> : <div className={adminCredit ? '' : `user-swipe${ledgerOpen ? ' user-swipe--ledger' : ''}`}
      onPointerDown={(event) => {
        swiped.current = false;
        swipeStart.current = null;
        if (adminCredit || !event.isPrimary || event.pointerType === 'mouse' ||
          (event.target as HTMLElement).closest('input, textarea, select, audio')) return;
        swipeStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }}
      onPointerMove={(event) => {
        const start = swipeStart.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) swipeStart.current = null;
        else if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          showLedger(dx > 0);
          swiped.current = true;
          swipeStart.current = null;
        }
      }}
      onPointerUp={() => { swipeStart.current = null; }}
      onPointerCancel={() => { swipeStart.current = null; }}
      onClickCapture={(event) => {
        if (swiped.current) { event.preventDefault(); event.stopPropagation(); swiped.current = false; }
      }}>
      <section inert={!adminCredit && ledgerOpen} aria-hidden={!adminCredit && ledgerOpen}
        className="user-pane user-workspace flex-col gap-md" aria-label="User screen" aria-busy={locked}>
      {!adminCredit && <div className="flex-row items-center justify-between gap-sm">
        <button className="btn" onClick={() => showLedger(true)}>← Your ledger</button>
        {screen === 'home' && <span className="hint text-muted">Swipe right</span>}
      </div>}
      {screen !== 'home' && <header className="user-screen-header flex-row items-center gap-sm">
        <button className="btn user-back" disabled={locked} onClick={back} aria-label="Back" title="Back">←</button>
        <h2>{title}</h2>
      </header>}
      {screen === 'home' && <>
        {success && <p role="status">{adminCredit ? 'Credit applied successfully.' : 'Transaction sent successfully.'}</p>}
        <article className="user-card-panel balance-card flex-col gap-sm">
          <h2>{adminCredit ? 'User’s total credits' : 'Remaining balance'}</h2>
          <p className="balance-value"><span>{money(adminCredit ? overview.totalReceived : overview.balance)}</span></p>
        </article>
        <form className="flex-col gap-md" onSubmit={(event) => {
          event.preventDefault();
          if (amountValid && user.is_active) { setSuccess(false); go('category'); }
        }}>
          <label className="user-card-panel field amount-card">
            <span>Enter amount (PKR)</span>
            <input type="number" inputMode="decimal" min="0" max="999999999999.99" step="0.01" required value={amount}
              onChange={(event) => setAmount(event.target.value)} placeholder="0" aria-label="Enter amount in PKR" />
          </label>
          <button className="btn btn--primary user-next" disabled={!amountValid || !user.is_active}>Next</button>
        </form>
      </>}
      {(screen === 'category' || screen === 'heads') && <>
        {screen === 'heads' && selectedHead?.is_transactionable &&
          <button className="btn btn--primary user-next" disabled={!user.is_active || !amountValid || !category}
            onClick={() => go('images')}>Make a new transaction</button>}
        <div className="user-card-list flex-col gap-md">
          {choices.map((item) => <button key={item.id} className="user-choice-card" onClick={() => {
            if (screen === 'category') { setCategoryId(item.id); setPath([]); go('heads'); }
            else { setPath((current) => [...current, item.id]); setError(''); }
          }}>
            <span className="user-card-art" aria-hidden="true">
              {item.image ? <img src={item.image} alt="" /> :
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" />
                </svg>}
            </span>
            <span className="user-card-label">{item.name}</span>
            <span className="user-card-arrow" aria-hidden="true">›</span>
          </button>)}
        </div>
        {screen === 'heads' && !children.length && !selectedHead?.is_transactionable &&
          <p className="text-muted empty-state">{headId === undefined ? 'No heads available yet.' : 'No transactions or subheads available here.'}</p>}
      </>}
      {(screen === 'images' || screen === 'voice') && <>
        <div className="user-card-panel flex-col gap-md">
          <p className="hint text-muted">Optional</p>
          <AttachmentInput key={screen} kind={screen === 'images' ? 'image' : 'voice'}
            items={attachments.filter((item) => item.kind === (screen === 'images' ? 'image' : 'voice'))}
            onChange={previewOnly ? undefined : (items) => updateAttachments(screen === 'images' ? 'image' : 'voice', items)} onBusyChange={setAttachmentBusy} />
        </div>
        <button className="btn btn--primary user-next" disabled={locked} onClick={() => go(screen === 'images' ? 'voice' : 'review')}>
          {screen === 'voice' ? 'Review transaction' : attachments.some((item) => item.kind === 'image') ? 'Next' : 'Skip'}
        </button>
      </>}
      {screen === 'review' && <>
        <div className="user-card-panel flex-col gap-md">
          <dl className="review-details">
            {adminCredit && <><dt>Credit to</dt><dd>{user.user_name}</dd></>}
            <dt>Amount</dt><dd>{formatAmount(Number(amount))}</dd>
            <dt>Category</dt><dd>{category?.name ?? 'Choose a category'}</dd>
            <dt>Head</dt><dd>{selectedHead?.head_name ?? 'Head no longer available'}</dd>
          </dl>
          {!valid && <p role="alert">Go back and check the amount, category and head.</p>}
        </div>
        {(['image', 'voice'] as const).map((kind) => attachments.some((item) => item.kind === kind) &&
          <div className="user-card-panel flex-col gap-sm" key={kind}>
            <h3>{kind === 'image' ? 'Images' : 'Voice notes'}</h3>
            <AttachmentInput kind={kind} items={attachments.filter((item) => item.kind === kind)} />
          </div>)}
        <button className="btn btn--primary user-next" disabled={previewOnly || locked || !valid || pending || !user.is_active}
          onClick={submit}>{busy ? 'Sending…' : adminCredit ? 'Send credit' : 'Send transaction'}</button>
      </>}
      </section>
      {!adminCredit && <section inert={!ledgerOpen} aria-hidden={!ledgerOpen}
        className="user-pane user-pane--ledger user-workspace flex-col gap-md" aria-label="Your credits ledger">
        <header className="flex-row items-center justify-between gap-sm">
          <h2>Your ledger</h2>
          <button className="btn" onClick={() => showLedger(false)}>Transaction →</button>
        </header>
        <div className="flex-row flex-wrap gap-sm">
          <ReportActions getReport={() => creditDocument(overview, user.user_name)} />
        </div>
        <dl className="user-card-panel flex-col gap-md">
          <div><dt>Total received</dt><dd className="credit-amount">{formatAmount(overview.totalReceived)}</dd></div>
          <div><dt>Total paid</dt><dd>{formatAmount(overview.totalBillPayment)}</dd></div>
          <div><dt>Remaining balance</dt><dd className="credit-amount">{formatAmount(overview.balance)}</dd></div>
        </dl>
        {!overview.credits.length && <p className="text-muted empty-state">No credits received yet.</p>}
        {overview.credits.map((credit) => <button key={credit.id} className="user-card-panel credit-card flex-col gap-sm" onClick={() => setOpenedCredit(credit)}>
          <div className="flex-row items-center justify-between gap-sm">
            <span>Credit received</span>
            <strong className="credit-amount">+{formatAmount(credit.amount)}</strong>
          </div>
          <time className="hint text-muted" dateTime={credit.createdAt}>{new Date(credit.createdAt).toLocaleString()}</time>
          <span className="hint text-muted">{credit.headPath} · {credit.categoryName}</span>
          {credit.attachments.length > 0 && <span className="hint">{credit.attachments.length} attachments</span>}
        </button>)}
      </section>}
    </div>}
    {openedCredit && <TransactionCard key={openedCredit.id} entry={openedCredit} heads={heads}
      categories={overview?.categories} onClose={() => setOpenedCredit(null)} />}
    {confirmLogout && <Dialog title="Discard draft and log out?" onClose={() => setConfirmLogout(false)}>
      <p>Your transaction has not been sent yet.</p>
      <div className="flex-row justify-end gap-sm">
        <button className="btn" onClick={() => setConfirmLogout(false)}>Keep editing</button>
        <button className="btn btn--primary" onClick={onClose}>Discard and log out</button>
      </div>
    </Dialog>}
  </div>;
}
