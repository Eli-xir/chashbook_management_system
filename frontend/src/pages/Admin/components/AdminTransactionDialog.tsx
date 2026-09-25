import { useState } from 'react';
import type { AdminUser, Head } from '../types';
import { Dialog } from './Dialog';
import { UserPicker } from './UserPicker';
import { UserPreview } from './UserPreview';

export function AdminTransactionDialog({ title, users, heads, initialUserId = '', onClose, onSubmitted }: {
  title: string; users: AdminUser[]; heads: Head[]; initialUserId?: string;
  onClose: () => void; onSubmitted: () => Promise<void>;
}) {
  const [userId, setUserId] = useState(initialUserId);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const user = users.find((item) => item.user_id === userId && item.is_active && item.role !== 'admin');
  function close() { if (!busy) { if (dirty) setDiscard(true); else onClose(); } }
  return <Dialog title={title} onClose={close} busy={busy}>
    {user ? <UserPreview user={user} heads={heads} assigned={[]} pending={false} adminCredit transactionLabel={title}
      onClose={close} onDirtyChange={setDirty} onBusyChange={setBusy}
      onSubmitted={async () => { await onSubmitted(); onClose(); }} /> : <div className="flex-col gap-md">
      <p>Choose the user receiving the money.</p>
      <UserPicker users={users.filter((item) => item.is_active)} value={userId} onChange={setUserId} />
      <button className="btn" onClick={close}>Cancel</button>
    </div>}
    {discard && <Dialog title="Discard this transaction draft?" onClose={() => setDiscard(false)}>
      <div className="flex-row justify-end gap-sm">
        <button className="btn" onClick={() => setDiscard(false)}>Keep editing</button>
        <button className="btn btn--primary" onClick={onClose}>Discard</button>
      </div>
    </Dialog>}
  </Dialog>;
}
