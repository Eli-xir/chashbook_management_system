import { useEffect, useState } from 'react';
import type { Contract, CreditUser } from '../types';
import { cashbookApi } from '../../../data/cashbookApi';
import { matchesUser } from '../utils/userProfile';
import { Dialog } from './Dialog';

export function ContractEditor({ contract, users, onClose, onRefresh, onDirtyChange, onBusyChange }: {
  contract?: Contract; users: CreditUser[]; onClose: () => void; onRefresh: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState(contract?.name ?? '');
  const [description, setDescription] = useState(contract?.description ?? '');
  const [total, setTotal] = useState(contract ? String(contract.totalAmount) : '');
  const [ids, setIds] = useState(contract?.creditUserIds ?? []);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const dirty = !saved && (name !== (contract?.name ?? '') || description !== (contract?.description ?? '') || total !== (contract ? String(contract.totalAmount) : '') || JSON.stringify(ids) !== JSON.stringify(contract?.creditUserIds ?? []));
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  function close() { if (dirty) setDiscard(true); else onClose(); }
  async function save() {
    if (busy || saved) return;
    setBusy(true); setError('');
    try {
      await cashbookApi.saveContract({ name: name.trim(), description, totalAmount: Number(total), creditUserIds: ids }, contract?.id, contract?.revision);
      setSaved(true); onDirtyChange(false);
      await onRefresh(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the contract.'); }
    finally { setBusy(false); }
  }
  return <Dialog title={contract ? 'Edit contract' : 'New contract'} onClose={close} busy={busy}>
    {saved ? <><p role="status">Contract saved. Close and refresh to reload the balances.</p><button className="btn" onClick={onClose}>Close</button></> : <form className="flex-col gap-md" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className="field flex-col gap-md">
        <label className="field"><span>Contract name</span><input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>Total contract amount (PKR)</span><input required type="number" inputMode="decimal" min="0.01" step="0.01" max="999999999999.99" value={total} onChange={(event) => setTotal(event.target.value)} /></label>
        <label className="field"><span>Description</span><textarea maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <p>The amount belongs to the contract. Any linked user can pay toward it.</p>
        <label className="field"><span>Find external users</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, contact or description" /></label>
        <span>{ids.length} external users linked</span>
        <div className="filter-choices">{users.filter((user) => (user.is_active || contract?.creditUserIds.includes(user.credit_user_id)) && matchesUser(user, search)).map((user) => <label key={user.credit_user_id} className="entry-selection-check">
          <input type="checkbox" checked={ids.includes(user.credit_user_id)} onChange={(event) => setIds((current) => event.target.checked ? [...current, user.credit_user_id] : current.filter((id) => id !== user.credit_user_id))} />{user.user_name}{!user.is_active && ' · Inactive'}
        </label>)}</div>
        {!users.some((user) => user.is_active) && <p>Create an external user in Admin credit before creating a contract.</p>}
      </fieldset>
      <div className="flex-row gap-sm"><button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button><button className="btn" disabled={busy || !ids.length || !name.trim() || Number(total) <= 0}>{busy ? 'Saving…' : 'Save contract'}</button></div>
    </form>}
    {error && <p role="alert" className="text-error">{error}</p>}
    {discard && <div><p>Discard contract changes?</p><button className="btn" onClick={() => setDiscard(false)}>Keep editing</button><button className="btn" onClick={onClose}>Discard</button></div>}
  </Dialog>;
}
