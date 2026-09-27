import { useCallback, useState } from 'react';
import type { AdminUser, Head } from '../types';
import { UserCards } from './UserCards';
import { Dialog } from './Dialog';
import { UserPreview } from './UserPreview';

export function AdminDebitFlow({ users, heads, onClose, onSubmitted, onDirtyChange, onBusyChange, initialUserId = '' }: {
  users: AdminUser[]; heads: Head[]; initialUserId?: string;
  onClose: () => void; onSubmitted: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [userId, setUserId] = useState(initialUserId);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const changeDirty = useCallback((value: boolean) => { setDirty(value); onDirtyChange(value); }, [onDirtyChange]);
  const changeBusy = useCallback((value: boolean) => { setBusy(value); onBusyChange(value); }, [onBusyChange]);
  const user = users.find((item) => item.user_id === userId && item.is_active && item.role !== 'admin');
  function back() { if (!busy) { if (dirty) setDiscard(true); else setUserId(''); } }
  return <section className="admin-credit-page flex-col gap-md">
    {user ? <UserPreview key={userId} user={user} heads={heads} assigned={[]} pending={false} adminCredit transactionLabel="User debit"
      onClose={back} onDirtyChange={changeDirty} onBusyChange={changeBusy}
      onSubmitted={async () => { await onSubmitted(); onClose(); }} /> : <>
      <header className="flex-row items-center gap-sm"><button className="btn" onClick={onClose}>← Home</button><h1>User debit</h1></header>
      <UserCards users={users} onOpen={(item) => setUserId(item.user_id)} onChanged={onSubmitted} />
    </>}
    {discard && <Dialog title="Discard this transaction draft?" onClose={() => setDiscard(false)}>
      <div className="flex-row gap-sm"><button className="btn" onClick={() => setDiscard(false)}>Keep editing</button>
        <button className="btn btn--primary" onClick={() => { setDiscard(false); setUserId(''); }}>Discard</button></div>
    </Dialog>}
  </section>;
}
