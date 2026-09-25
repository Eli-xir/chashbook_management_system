import { useEffect, useState } from 'react';
import type { CreditUser } from '../types';
import { cashbookApi } from '../../../data/cashbookApi';
import { matchesUser } from '../utils/userProfile';
import { HomeCard } from './HomeCard';

export function CreditUserCards({ users, selectedId = '', onOpen, onEdit, onChanged, onBusyChange }: {
  users: CreditUser[]; selectedId?: string; onOpen: (user: CreditUser) => void;
  onEdit: (user: CreditUser) => void; onChanged: () => Promise<void>; onBusyChange?: (busy: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const choices = users.filter((user) => matchesUser(user, search)).sort((a, b) => Number(b.is_active) - Number(a.is_active));

  useEffect(() => { onBusyChange?.(!!busyId); }, [busyId, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function change(user: CreditUser, action: 'pin' | 'delete' | 'deactivate' | 'reactivate') {
    setBusyId(user.credit_user_id); setError(''); setMessage('');
    try {
      if (action === 'pin') await cashbookApi.pinCreditUser(user.credit_user_id, !user.is_pinned);
      else if (action === 'delete') await cashbookApi.deleteCreditUser(user.credit_user_id);
      else if (action === 'deactivate') await cashbookApi.deactivateCreditUser(user.credit_user_id);
      else await cashbookApi.reactivateCreditUser(user.credit_user_id);
      await onChanged();
      setDeleteId('');
      setMessage(action === 'delete' ? 'External user deleted.' : action === 'deactivate' ? 'External user deactivated.'
        : action === 'reactivate' ? 'External user reactivated.' : user.is_pinned ? 'Removed from Home.' : 'Pinned to Home.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update external user.'); }
    finally { setBusyId(''); }
  }

  return <div className="credit-user-list flex-col gap-md">
    <input type="search" aria-label="Search external users" placeholder="Search name, contact or description"
      value={search} onChange={(event) => setSearch(event.target.value)} />
    {error && <p className="text-error" role="alert">{error}</p>}
    {message && <p className="credit-success" role="status">{message}</p>}
    <div className="admin-credit-cards">{choices.map((user, index) => <HomeCard key={user.credit_user_id}
      title={user.is_active ? user.user_name : `${user.user_name} · Inactive`} description={user.description} detail={user.contacts[0]}
      icon={<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>}
      tone={(['blue', 'gold', 'green', 'purple'] as const)[index % 4]}
      selected={selectedId === user.credit_user_id} disabled={!!busyId || !user.is_active} onClick={() => onOpen(user)} actions={<>
      {!user.is_active ? <button className="btn credit-user-reactivate" disabled={!!busyId}
        onClick={() => void change(user, 'reactivate')}>Reactivate</button> : <div className="credit-user-actions" role="group" aria-label={`${user.user_name} actions`}>
        <button className="btn credit-user-action" aria-label={`${user.is_pinned ? 'Unpin' : 'Pin'} ${user.user_name} ${user.is_pinned ? 'from' : 'to'} Home`}
          aria-pressed={user.is_pinned} title={user.is_pinned ? 'Unpin from Home' : 'Pin to Home'} disabled={!!busyId}
          onClick={() => void change(user, 'pin')}>Pin</button>
        <button className="btn credit-user-action" aria-label={`Edit ${user.user_name}`} title="Edit external user" disabled={!!busyId}
          onClick={() => onEdit(user)}>Edit</button>
        <button className="btn credit-user-action credit-user-action--danger" aria-label={`Delete ${user.user_name}`} title="Delete external user"
          aria-pressed={deleteId === user.credit_user_id} disabled={!!busyId}
          onClick={() => setDeleteId((id) => id === user.credit_user_id ? '' : user.credit_user_id)}>Delete</button>
      </div>}
      {deleteId === user.credit_user_id && <div className="credit-user-delete flex-col gap-xs">
        <span>Delete this external user if it has no transactions. Otherwise, deactivate it to keep its history.</span>
        <div className="flex-row justify-center gap-xs"><button className="btn" onClick={() => setDeleteId('')}>Cancel</button>
          <button className="btn" disabled={!!busyId} onClick={() => void change(user, 'deactivate')}>Deactivate</button>
          <button className="btn btn--danger" disabled={!!busyId} onClick={() => void change(user, 'delete')}>Delete</button></div>
      </div>}
      </>} />)}</div>
    {!choices.length && <p className="text-muted" role="status">{users.length ? 'No matching external users.' : 'No external users here yet.'}</p>}
  </div>;
}
