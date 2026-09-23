import { useEffect, useRef, useState } from 'react';
import type { AdminUser, Attachment, Head, Transaction, UserOverview } from '../types';
import { permittedHeads } from '../utils/permissions';
import { cashbookApi } from '../../../data/cashbookApi';
import { AttachmentInput } from './AttachmentInput';
import { Dialog } from './Dialog';
import { TransactionCard } from '../../Ledger/TransactionCard';
import { creditDocument, exportLedger } from '../../Ledger/ledgerExport';

type Screen = 'home' | 'category' | 'heads' | 'images' | 'voice' | 'review';
const formatAmount = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 20 });
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
  const workflowPanel = useRef<HTMLElement>(null);
  const ledgerPanel = useRef<HTMLElement>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [openedCredit, setOpenedCredit] = useState<Transaction | null>(null);
  const [exporting, setExporting] = useState(false);
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
    cashbookApi.userOverview(user.user_id).then((data) => {
      if (!ignore) { setOverview(data); setError(''); }
    }).catch((error) => { if (!ignore) setError(error instanceof Error ? error.message : 'Could not load your balance.'); });
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
    if (!valid || pending || !user.is_active || locked) return;
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
  async function exportCredits(format: 'pdf' | 'excel' | 'print') {
    if (!overview) return;
    setExporting(true); setError('');
    try { await exportLedger(creditDocument(overview, user.user_name), format); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not export credits.'); }
    finally { setExporting(false); }
  }

  return <div className="user-preview flex-col gap-md">
    <header className="preview-toolbar flex-row items-center justify-between gap-sm">
      <span className="hint text-muted">{adminCredit ? `Credit · ${user.user_name}` : preview ? `Preview · ${user.user_name}` : 'Cashbook'}</span>
      <button className={`btn${preview ? ' preview-close' : ''}`} disabled={locked}
        onClick={() => !preview && dirty ? setConfirmLogout(true) : onClose()}
        aria-label={adminCredit ? 'Close credit workflow' : preview ? 'Close user preview' : 'Logout'} title={preview ? 'Back to admin ledger' : 'Logout'}>
        {preview ? '×' : 'Logout'}
      </button>
    </header>
    {pending && <p role="status" className="hint">Preview includes unapplied permissions. Apply them before submitting.</p>}
    {!user.is_active && <p role="status">This account is deactivated and cannot transact.</p>}
    {error && <p role="alert" className="text-error">{error}</p>}
    {!overview ? <>
      <p role="status">{error ? 'Balance unavailable.' : 'Loading balance…'}</p>
      {error && <button className="btn" onClick={() => setReload((value) => value + 1)}>Retry</button>}
    </> : <div className={adminCredit ? '' : 'user-swipe'}>
      <section ref={workflowPanel} className="user-pane user-workspace flex-col gap-md" aria-label="User screen" aria-busy={locked}>
      {!adminCredit && <div className="flex-row items-center justify-between gap-sm">
        <button className="btn" onClick={() => ledgerPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })}>← Your ledger</button>
        {screen === 'home' && <span className="hint text-muted">Swipe right</span>}
      </div>}
      {screen !== 'home' && <header className="user-screen-header flex-row items-center gap-sm">
        <button className="btn user-back" disabled={locked} onClick={back} aria-label="Back" title="Back">←</button>
        <h2>{title}</h2>
      </header>}
      {screen === 'home' && <>
        {success && <p role="status">{adminCredit ? 'Credit applied successfully.' : 'Transaction sent successfully.'}</p>}
        <article className="user-card-panel balance-card flex-col gap-sm">
          <h2>{adminCredit ? 'User’s total credits' : 'Total balance'}</h2>
          <p className="balance-value">{formatAmount(overview.balance)}</p>
        </article>
        <form className="flex-col gap-md" onSubmit={(event) => {
          event.preventDefault();
          if (amountValid && user.is_active) { setSuccess(false); go('category'); }
        }}>
          <label className="user-card-panel field amount-card">
            <span>Enter amount</span>
            <input type="number" inputMode="decimal" min="0" step="any" required value={amount}
              onChange={(event) => setAmount(event.target.value)} placeholder="0.00" aria-label="Enter amount" />
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
            onChange={(items) => updateAttachments(screen === 'images' ? 'image' : 'voice', items)} onBusyChange={setAttachmentBusy} />
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
        <button className="btn btn--primary user-next" disabled={locked || !valid || pending || !user.is_active}
          onClick={submit}>{busy ? 'Sending…' : adminCredit ? 'Send credit' : 'Send transaction'}</button>
      </>}
      </section>
      {!adminCredit && <section ref={ledgerPanel} className="user-pane user-workspace flex-col gap-md" aria-label="Your credits ledger">
        <header className="flex-row items-center justify-between gap-sm">
          <h2>Your ledger</h2>
          <button className="btn" onClick={() => workflowPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })}>Transaction →</button>
        </header>
        <div className="flex-row flex-wrap gap-sm">
          {(['pdf', 'excel', 'print'] as const).map((format) => <button key={format} className="btn" disabled={exporting}
            onClick={() => void exportCredits(format)}>{format === 'pdf' ? 'PDF' : format === 'excel' ? 'Excel' : 'Print'}</button>)}
        </div>
        <dl className="user-card-panel flex-col gap-md">
          <div><dt>Total received by {user.user_name}</dt><dd className="credit-amount">{formatAmount(overview.totalReceived)}</dd></div>
          <div><dt>Total Bill Payment</dt><dd>{formatAmount(overview.totalBillPayment)}</dd></div>
          <div><dt>Remaining Payable Balance</dt><dd className="credit-amount">{formatAmount(overview.remainingPayable)}</dd></div>
        </dl>
        <p className="hint text-muted">{overview.remainingPayable > 0 ? 'This amount is payable to you.' : overview.remainingPayable < 0 ? 'Your received amount exceeds your bills; the difference remains with you.' : 'No remaining payable balance.'}</p>
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
