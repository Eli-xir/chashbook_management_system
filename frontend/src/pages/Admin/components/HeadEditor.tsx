import { useState } from 'react';
import type { DeleteHeadChange, EditHeadChange, Head } from '../types';
import { Dialog } from './Dialog';
import { AttachmentInput } from './AttachmentInput';

export function HeadEditor({ head, onSave, onClose }: {
  head: Head; onSave: (change: EditHeadChange | DeleteHeadChange) => boolean; onClose: () => void;
}) {
  const [name, setName] = useState(head.head_name);
  const [image, setImage] = useState(head.image_url ?? null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [transactionHandling, setTransactionHandling] = useState<DeleteHeadChange['transaction_handling'] | ''>('');

  return (
    <Dialog title={deleting ? `Delete ${head.head_name}` : 'Edit head'} onClose={onClose} busy={reading}>
      <form className="flex-col gap-md" onSubmit={(event) => {
        event.preventDefault();
        if (deleting) {
          if (!transactionHandling) return;
          if (onSave({ op: 'delete', head_id: head.head_id, transaction_handling: transactionHandling })) onClose();
          else setError('Could not stage this deletion. Check the head and try again.');
        } else if (onSave({ op: 'edit', head_id: head.head_id, head_name: name, image_url: image,
          is_transactionable: head.is_transactionable })) onClose();
        else setError('Check the name: it must be unique and contain 1–48 characters.');
      }}>
        {deleting ? <>
          <p>Delete this head only. Its subheads will move up one level.</p>
          <label className="field">
            <span>What should happen to this head’s transactions?</span>
            <select required value={transactionHandling} onChange={(event) =>
              setTransactionHandling(event.target.value as DeleteHeadChange['transaction_handling'] | '')}>
              <option value="">Choose an option…</option>
              <option value="hard_delete">Hard-delete all its transactions</option>
              <option value="backup">Create a backup file on the backend</option>
            </select>
          </label>
          <p className="hint text-muted">Deletion is staged until Apply. Transaction deletion and backend backup creation are simulated for now.</p>
        </> : <>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={48} autoFocus />
        </label>
        <AttachmentInput kind="image" multiple={false}
          items={image ? [{ id: 'head-image', kind: 'image', name: 'Head image', url: image }] : []}
          onChange={(items) => setImage(items[0]?.url ?? null)} onBusyChange={setReading} />
        <button type="button" className="btn btn--danger" disabled={reading}
          onClick={() => { setDeleting(true); setError(''); }}>Delete head…</button>
        </>}
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex-row justify-end gap-sm">
          <button type="button" className="btn" onClick={onClose} disabled={reading}>Cancel</button>
          {deleting && <button type="button" className="btn" onClick={() => { setDeleting(false); setError(''); }}>Back to editing</button>}
          <button className={`btn ${deleting ? 'btn--danger' : 'btn--primary'}`} disabled={reading || (deleting && !transactionHandling)}>
            {reading ? 'Reading image…' : deleting ? 'Stage deletion' : 'Stage changes'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
