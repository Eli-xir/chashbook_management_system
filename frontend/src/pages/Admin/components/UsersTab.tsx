import { useEffect, useState } from 'react';
import type { AdminUser, CreateUserInput, UserAction, UserProfile } from '../types';
import { userContacts } from '../utils/userProfile';
import { UserEditor } from './UserEditor';
import './UsersTab.css';

interface UsersTabProps {
  currentAdminUserId: string;
  selectedUserId: string;
  users: AdminUser[];
  onSelect: (userId: string) => void;
  onViewLedger: (userId: string) => void;
  onOpenHeadView: (userId: string, mode: 'permissions' | 'preview') => void;
  onAction: (userId: string, action: UserAction) => Promise<void>;
  onSaveProfile: (userId: string, profile: UserProfile) => Promise<void>;
  onCreateUser: (input: CreateUserInput) => Promise<AdminUser>;
  onChangePassword?: (userId: string, password: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

export function UsersTab(props: UsersTabProps) {
  const { currentAdminUserId, users, selectedUserId, onSelect, onViewLedger, onAction, onDirtyChange } = props;
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ user: AdminUser; mode: 'profile' | 'password' | 'create' } | null>(null);
  const dirty = editing !== null;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function act(user: AdminUser, action: UserAction) {
    setBusy(true);
    setMessage('');
    try {
      await onAction(user.user_id, action);
      setMessage('Account updated.');
      setDeleting(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update the account.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex-col gap-md">
      <button className="btn btn--primary" onClick={() => setEditing({
        mode: 'create', user: { user_id: '', user_name: '', contacts: [], is_active: true },
      })}>+ Create user</button>
      <input type="search" aria-label="Search users" placeholder="Search users by name or description" value={search} onChange={(event) => setSearch(event.target.value)} />
      {[true, false].map((self) => (
        <section key={String(self)} className="flex-col gap-sm">
          <h3 className="section-label">{self ? 'Your account' : 'All users'}</h3>
          {!self && users.every((user) => user.user_id === currentAdminUserId) && <p className="text-muted">No other users yet.</p>}
          {users.filter((user) => (user.user_id === currentAdminUserId) === self && (self || `${user.user_name} ${user.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))).map((user) => (
            <details key={user.user_id} className={`user-card ${selectedUserId === user.user_id ? 'user-card--selected' : ''}`}
              open={self ? true : undefined} name={self ? undefined : 'users'}>
              <summary className="user-card-header" onClick={() => { if (!self) onSelect(user.user_id); }}>
                {user.user_name} {!user.is_active && <span className="head-node-badge">deactivated</span>}
              </summary>
              <div className="user-card-body flex-col gap-sm">
                <p className="text-muted">{user.description}</p>
                <dl className="flex-col gap-xs">
                  <div className="field-row"><dt className="text-muted">Name</dt><dd>{user.user_name}</dd></div>
                  <div className="field-row">
                    <dt className="text-muted">Contacts</dt>
                    <dd>{userContacts(user).length ? userContacts(user).map((contact) => <div key={contact}>{contact}</div>) : '—'}</dd>
                  </div>
                </dl>
                <div className="flex-row flex-wrap gap-sm">
                  <button className="btn" disabled={busy} onClick={() => setEditing({ user, mode: 'profile' })}>Info</button>
                  <button className="btn" disabled={busy} onClick={() => setEditing({ user, mode: 'password' })}>Password</button>
                  {!self && <>
                    <button className="btn" onClick={() => onViewLedger(user.user_id)}>Statement</button>
                    <button className="btn" disabled={busy} onClick={() => act(user, user.is_active ? 'deactivate' : 'reactivate')}>
                      {user.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {user.role !== 'admin' && <>
                      <button className="btn" disabled={busy} onClick={() => props.onOpenHeadView(user.user_id, 'permissions')}>Permissions</button>
                      <button className="btn" disabled={busy} onClick={() => props.onOpenHeadView(user.user_id, 'preview')}>Preview</button>
                    </>}
                    <button className="btn btn--danger" disabled={busy} onClick={() => setDeleting(user.user_id)}>Delete</button>
                  </>}
                </div>
                {deleting === user.user_id && (
                  <div className="flex-col gap-sm">
                    <p>Delete {user.user_name}?</p>
                    <div className="flex-row gap-sm">
                      <button className="btn" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
                      <button className="btn btn--danger" disabled={busy} onClick={() => act(user, 'delete')}>Confirm delete</button>
                    </div>
                  </div>
                )}
              </div>
            </details>
          ))}
        </section>
      ))}
      {message && <p role="status">{message}</p>}
      {editing && <UserEditor {...editing} onClose={() => setEditing(null)}
        onCreateUser={async (input) => { const user = await props.onCreateUser(input); onSelect(user.user_id); setMessage('User created.'); }}
        onSaveProfile={async (id, profile) => { await props.onSaveProfile(id, profile); setMessage('Account saved.'); }}
        onChangePassword={props.onChangePassword ? async (id, password) => {
          await props.onChangePassword!(id, password); setMessage('Password changed.');
        } : undefined} />}
    </div>
  );
}
