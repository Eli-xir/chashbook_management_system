import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminUser, UserAction } from '../types';
import { cashbookApi } from '../../../data/cashbookApi';
import { matchesUser, userContacts } from '../utils/userProfile';
import { HomeCard } from './HomeCard';
import { UserEditor } from './UserEditor';
import { Dialog } from './Dialog';

export function UserCards({ users, onOpen, onChanged, search: sharedSearch, management = false, selectedId,
  onEdit, onAction, extraActions, onAttachments }: {
  onAttachments?: (user: AdminUser) => void;
  users: AdminUser[]; onOpen: (user: AdminUser) => void; onChanged: () => Promise<void>; search?: string;
  management?: boolean; selectedId?: string; onEdit?: (user: AdminUser) => void;
  onAction?: (id: string, action: UserAction) => Promise<void>;
  extraActions?: (user: AdminUser, busy: boolean) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const choices = users.filter((user) => (management || (user.is_active && user.role !== 'admin')) && matchesUser(user, sharedSearch ?? search));
  async function act(user: AdminUser, action: UserAction) {
    setBusy(true); setError('');
    try {
      if (onAction) await onAction(user.user_id, action);
      else { await cashbookApi.userAction(user.user_id, action); await onChanged(); }
      setDeleting(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update user.'); }
    finally { setBusy(false); }
  }
  return <div className={`credit-user-list flex-col gap-md${management ? ' user-management-list' : ''}`}>
    {sharedSearch === undefined && <input type="search" aria-label="Search users" placeholder="Search name, contact or description"
      value={search} onChange={(event) => setSearch(event.target.value)} />}
    {error && !deleting && <p className="text-error" role="alert">{error}</p>}
    <div className="home-cards">{choices.map((user, index) => <HomeCard onAttachments={!management && onAttachments ? () => onAttachments(user) : undefined} key={user.user_id}
      accountType={user.role === 'admin' ? 'admin' : 'user'} selected={selectedId === user.user_id}
      title={user.is_active ? user.user_name : `${user.user_name} · Inactive`} description={user.description} detail={userContacts(user).join(' · ')}
      tone={(['blue', 'gold', 'green', 'purple'] as const)[index % 4]} disabled={busy} onClick={() => onOpen(user)}
      icon={<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>}
      actions={<>
        <div className={`credit-user-actions${user.role === 'admin' ? ' credit-user-actions--admin' : ''}`} role="group" aria-label={`${user.user_name} actions`}>
          {user.role !== 'admin' && <button className="btn credit-user-action" disabled={busy || !user.is_active} aria-pressed={!!user.is_pinned}
            aria-label={`${user.is_pinned ? 'Unpin' : 'Pin'} ${user.user_name}`} title={user.is_pinned ? 'Unpin from Home' : 'Pin to Home'}
            onClick={() => void act(user, user.is_pinned ? 'unpin' : 'pin')}>Pin</button>}
          <button className="btn credit-user-action" disabled={busy} aria-label={`Edit ${user.user_name}`}
            onClick={() => onEdit ? onEdit(user) : setEditing(user)}>Edit</button>
          {user.role !== 'admin' && <button className="btn credit-user-action credit-user-action--danger" disabled={busy} aria-label={`Delete ${user.user_name}`}
            onClick={() => { setError(''); setDeleting(user); }}>Delete</button>}
        </div>
        {(extraActions || management && onAttachments) && <div className="user-management-actions">
          {extraActions?.(user, busy)}
          {management && onAttachments && <button className="btn" disabled={busy} onClick={() => onAttachments(user)}>Attachments</button>}
        </div>}
      </>} />)}</div>
    {!choices.length && sharedSearch === undefined && <p className="text-muted">No matching users.</p>}
    {editing && <UserEditor user={editing} mode="profile" onClose={() => setEditing(null)}
      onCreateUser={async () => {}} onSaveProfile={async (id, profile) => { await cashbookApi.saveProfile(id, profile); await onChanged(); }} />}
    {deleting && <Dialog title={`Delete ${deleting.user_name}?`} onClose={() => setDeleting(null)} busy={busy}>
      <p>Users with transaction history cannot be deleted. Deactivate the account to keep its history.</p>
      {error && <p className="text-error" role="alert">{error}</p>}
      <div className="flex-row flex-wrap gap-sm">
        <button className="btn" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
        {deleting.is_active && <button className="btn" disabled={busy} onClick={() => void act(deleting, 'deactivate')}>Deactivate</button>}
        <button className="btn btn--danger" disabled={busy} onClick={() => void act(deleting, 'delete')}>Delete</button>
      </div>
    </Dialog>}
  </div>;
}
