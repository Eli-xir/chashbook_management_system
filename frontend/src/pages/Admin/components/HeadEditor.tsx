import { useState } from 'react';
import type { ActiveHeadChange, BackupHeadChange, DeleteHeadChange, EditHeadChange, Head } from '../types';
import { Dialog } from './Dialog';
import { AttachmentInput } from './AttachmentInput';

export function HeadEditor({ head, onSave, onClose }: {
  head: Head; onSave: (change: EditHeadChange | DeleteHeadChange | ActiveHeadChange | BackupHeadChange) => boolean; onClose: () => void;
}) {
  const [description, setDescription] = useState(head.head_description ?? '');
  const [name, setName] = useState(head.head_name);
  const [image, setImage] = useState(head.image_url ?? null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <Dialog title={deleting ? `Delete ${head.head_name}` : 'Edit head'} onClose={onClose} busy={reading}>
      <form className="flex-col gap-md" onSubmit={(event) => {
        event.preventDefault();
        if (deleting) {
          if (onSave({ op: 'delete', head_id: head.head_id })) onClose();
          else setError('Could not stage this deletion. Check the head and try again.');
        } else if (onSave({ op: 'edit', head_id: head.head_id, head_name: name, head_description: description, image_url: image,
          is_transactionable: head.is_transactionable })) onClose();
        else setError('Check the name: it must be unique and contain 1–160 characters.');
      }}>
        {deleting ? <>
          <p>Applying this change permanently deletes this head, all its subheads, and their transactions.</p>
          <p>Create a backup first if you want to keep a copy.</p>
        </> : <>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} onFocus={(event) => event.target.select()} required maxLength={160} autoFocus />
        </label>
        <label className="field"><span>Description</span><textarea maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <AttachmentInput kind="image" multiple={false}
          items={image ? [{ id: 'head-image', kind: 'image', name: 'Head image', url: image }] : []}
          onChange={(items) => setImage(items[0]?.url ?? null)} onBusyChange={setReading} />
        <button type="button" className="btn" disabled={reading} onClick={() => {
          if (onSave({ op: 'active', head_id: head.head_id, is_active: !head.is_active })) onClose();
        }}>{head.is_active ? 'Deactivate head and subheads' : 'Reactivate head'}</button>
        <button type="button" className="btn btn--danger" disabled={reading}
          onClick={() => { setDeleting(true); setError(''); }}>Delete head…</button>
        <button type="button" className="btn" disabled={reading} onClick={() => {
          if (onSave({ op: 'backup', head_id: head.head_id })) onClose();
        }}>Create backup</button>
        <p className="hint text-muted">Creates a dated copy at the top level, including all subheads and transaction history. All copied heads and transactions are deactivated.</p>
        </>}
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex-row justify-end gap-sm">
          <button type="button" className="btn" onClick={onClose} disabled={reading}>Cancel</button>
          {deleting && <button type="button" className="btn" onClick={() => { setDeleting(false); setError(''); }}>Back to editing</button>}
          <button className={`btn ${deleting ? 'btn--danger' : 'btn--primary'}`} disabled={reading}>
            {reading ? 'Reading image…' : deleting ? 'Stage deletion' : 'Stage changes'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
