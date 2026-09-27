import { useEffect, useState } from 'react';
import type { AdminUser, CreateUserInput, UserAction, UserProfile } from '../types';
import { matchesUser } from '../utils/userProfile';
import { UserCards } from './UserCards';
import { UserEditor } from './UserEditor';
import './UsersTab.css';

interface UsersTabProps {
  currentAdminUserId: string;
  selectedUserId: string;
  users: AdminUser[];
  onSelect: (userId: string) => void;
  onAttachments: (userId: string) => void;
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
  const [editing, setEditing] = useState<{ user: AdminUser; mode: 'profile' | 'password' | 'create' } | null>(null);
  const dirty = editing !== null;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function act(user: AdminUser, action: UserAction) {
    setBusy(true);
    setMessage('');
    try {
      await onAction(user.user_id, action);
      setMessage('Account updated.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update the account.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex-col gap-md">
      <button className="btn btn--primary" onClick={() => setEditing({
        mode: 'create', user: { user_id: '', user_name: '', contacts: [], is_active: true },
      })}>+ Create user</button>
      <input type="search" autoComplete="off" aria-label="Search users" placeholder="Search name, description or contact" value={search} onChange={(event) => setSearch(event.target.value)} />
      {!users.some((user) => matchesUser(user, search)) && <p className="text-muted" role="status">No matching users.</p>}
      {[true, false].map((self) => (
        <section key={String(self)} className="flex-col gap-sm">
          <h3 className="section-label">{self ? 'Your account' : 'All users'}</h3>
          {!self && users.every((user) => user.user_id === currentAdminUserId) && <p className="text-muted">No other users yet.</p>}
          <UserCards users={users.filter((user) => (user.user_id === currentAdminUserId) === self)} management search={search}
            onAttachments={self ? undefined : (user) => props.onAttachments(user.user_id)} selectedId={selectedUserId} onOpen={(user) => { onSelect(user.user_id); setEditing({ user, mode: 'profile' }); }}
            onEdit={(user) => setEditing({ user, mode: 'profile' })} onChanged={async () => {}} onAction={onAction}
            extraActions={(user, cardBusy) => <>
              <button className="btn" disabled={busy || cardBusy} onClick={() => setEditing({ user, mode: 'password' })}>Password</button>
              {!self && <>
                <button className="btn" disabled={busy || cardBusy} onClick={() => onViewLedger(user.user_id)}>Statement</button>
                <button className="btn" disabled={busy || cardBusy} onClick={() => act(user, user.is_active ? 'deactivate' : 'reactivate')}>
                  {user.is_active ? 'Deactivate' : 'Reactivate'}</button>
                {user.role !== 'admin' && <>
                  <button className="btn" disabled={busy || cardBusy} onClick={() => props.onOpenHeadView(user.user_id, 'permissions')}>Permissions</button>
                  <button className="btn" disabled={busy || cardBusy} onClick={() => props.onOpenHeadView(user.user_id, 'preview')}>Preview</button>
                </>}
              </>}
            </>} />
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
