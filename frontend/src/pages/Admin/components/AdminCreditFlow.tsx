import { useEffect, useState } from 'react';
import type { AdminUser, CreditUser, Head } from '../types';
import { cashbookApi } from '../../../data/cashbookApi';
import { validateProfile } from '../utils/userProfile';
import { Dialog } from './Dialog';
import { CreditUserCards } from './CreditUserCards';
import { HomeCard } from './HomeCard';
import { UserPreview } from './UserPreview';

type Screen = 'menu' | 'create' | 'choose' | 'edit' | 'transaction';

export function AdminCreditFlow({ admin, creditUsers, heads, initialCreditUserId = '', initialEditCreditUserId = '', onClose, onRefresh, onDirtyChange, onBusyChange }: {
  admin: AdminUser; creditUsers: CreditUser[]; heads: Head[]; initialCreditUserId?: string; initialEditCreditUserId?: string;
  onClose: () => void; onRefresh: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const initialEdit = creditUsers.find((item) => item.credit_user_id === initialEditCreditUserId);
  const [screen, setScreen] = useState<Screen>(initialCreditUserId ? 'transaction' : initialEdit ? 'edit' : 'menu');
  const [selected, setSelected] = useState(initialCreditUserId);
  const [editingId, setEditingId] = useState(initialEditCreditUserId);
  const [name, setName] = useState(initialEdit?.user_name ?? '');
  const [description, setDescription] = useState(initialEdit?.description ?? '');
  const [contacts, setContacts] = useState(initialEdit?.contacts.length ? initialEdit.contacts : ['']);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cardsBusy, setCardsBusy] = useState(false);
  const [transactionDirty, setTransactionDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const payer = creditUsers.find((item) => item.credit_user_id === selected && item.is_active);
  const editing = creditUsers.find((item) => item.credit_user_id === editingId);
  const formDirty = screen === 'create' ? !!(name || description || contacts.some(Boolean))
    : screen === 'edit' && !!editing && (name !== editing.user_name || description !== editing.description ||
      JSON.stringify(contacts.filter(Boolean)) !== JSON.stringify(editing.contacts));
  const dirty = formDirty || (screen === 'transaction' && transactionDirty);
  const locked = busy || cardsBusy;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange(locked), [locked, onBusyChange]);
  useEffect(() => () => { onDirtyChange(false); onBusyChange(false); }, [onDirtyChange, onBusyChange]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function resetForm() { setName(''); setDescription(''); setContacts(['']); setEditingId(''); setError(''); }
  function back() {
    if (locked) return;
    if (dirty) { setDiscard(true); return; }
    if (screen === 'edit' && initialEditCreditUserId) { onClose(); return; }
    if (screen === 'transaction' || screen === 'edit') { setTransactionDirty(false); setScreen('choose'); }
    else if (screen === 'menu') onClose();
    else { resetForm(); setScreen('menu'); }
  }
  function edit(user: CreditUser) {
    setEditingId(user.credit_user_id); setName(user.user_name); setDescription(user.description);
    setContacts(user.contacts.length ? user.contacts : ['']); setError(''); setScreen('edit');
  }

  async function save() {
    setError('');
    let profile;
    try { profile = validateProfile({ user_name: name, description, contacts }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the external user details.'); return; }
    setBusy(true);
    try {
      if (screen === 'edit') await cashbookApi.editCreditUser(editingId, profile);
      else await cashbookApi.createCreditUser(profile);
      await onRefresh();
      if (screen === 'edit' && initialEditCreditUserId) { onClose(); return; }
      setNotice(screen === 'edit' ? 'External user updated successfully.' : 'External user created successfully.');
      const next = screen === 'edit' ? 'choose' : 'menu';
      resetForm(); setScreen(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save external user.'); }
    finally { setBusy(false); }
  }
  return <section className="admin-credit-page flex-col gap-md">
    {screen !== 'transaction' && <header className="flex-row items-center gap-sm">
      <button className="btn" onClick={back} disabled={locked}>← {screen === 'menu' ? 'Home' : screen === 'edit' ? 'External users' : 'Back'}</button>
      <h1>{screen === 'menu' ? 'Admin credit' : screen === 'create' ? 'New external user' : screen === 'edit' ? 'Edit external user' : 'Credit amount'}</h1>
    </header>}
    {notice && screen !== 'transaction' && <p className="credit-success" role="status">{notice}</p>}
    {error && screen !== 'create' && screen !== 'edit' && <p className="text-error" role="alert">{error}</p>}
    {screen === 'menu' && <nav className="home-cards admin-credit-cards" aria-label="Admin credit options">
      {([['create', 'New external user', 'M12 5v14M5 12h14'], ['choose', 'Credit amount', 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5']] as const).map(([target, label, icon]) =>
        <HomeCard key={target} title={label} tone={target === 'create' ? 'blue' : 'green'}
          icon={<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>}
          onClick={() => { setNotice(''); setError(''); setScreen(target); }} />)}
    </nav>}
    {(screen === 'create' || screen === 'edit') && <form className="admin-credit-form user-card-panel flex-col gap-md" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="field"><span>Name</span><input required maxLength={48} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <h3 className="section-label">Contacts</h3>
      {contacts.map((contact, index) => <div key={index} className="contact-editor flex-row items-center gap-sm">
        <label className="field"><span>Contact {index + 1}</span><input type="tel" maxLength={24} value={contact}
          onChange={(event) => setContacts((items) => items.map((value, i) => i === index ? event.target.value : value))} /></label>
        <button type="button" className="btn" disabled={busy} onClick={() => setContacts((items) => items.filter((_, i) => i !== index))}>Remove</button>
      </div>)}
      <button type="button" className="btn" disabled={busy || contacts.length >= 20} onClick={() => setContacts((items) => [...items, ''])}>+ Add contact</button>
      <label className="field"><span>Description</span><textarea maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {error && <p role="alert" className="text-error">{error}</p>}
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : screen === 'edit' ? 'Save changes' : 'Save external user'}</button>
    </form>}
    {screen === 'choose' && <div className="flex-col gap-md">
      <CreditUserCards users={creditUsers} selectedId={selected} onChanged={onRefresh} onBusyChange={setCardsBusy}
        onOpen={(item) => { setSelected(item.credit_user_id); setTransactionDirty(false); setScreen('transaction'); }} onEdit={edit} />
    </div>}
    {screen === 'transaction' && payer && <UserPreview key={payer.credit_user_id} user={admin} creditUser={payer} heads={heads} assigned={[]} pending={false}
      adminCredit transactionLabel="Admin credit" onClose={back} onDirtyChange={setTransactionDirty} onBusyChange={setBusy}
      onSubmitted={async () => { await onRefresh(); onClose(); }} />}
    {discard && <Dialog title="Discard these changes?" onClose={() => setDiscard(false)}>
      <div className="flex-row gap-sm"><button className="btn" onClick={() => setDiscard(false)}>Keep editing</button>
        <button className="btn btn--danger" onClick={() => { setDiscard(false); setTransactionDirty(false);
          if (screen === 'edit' && initialEditCreditUserId) { onClose(); return; }
          if (screen === 'transaction' || screen === 'edit') setScreen('choose'); else setScreen('menu');
          resetForm();
        }}>Discard</button></div>
    </Dialog>}
  </section>;
}
