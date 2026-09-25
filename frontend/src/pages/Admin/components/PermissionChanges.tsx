import { useState } from 'react';
import type { AdminUser, Head } from '../types';
import type { PermissionEditorState } from '../hooks/usePermissionChanges';
import { permissionDiff } from '../utils/permissions';
import { Dialog } from './Dialog';

export function PermissionChanges({ user, heads, editor, onSave }: {
  user: AdminUser; heads: Head[]; editor: PermissionEditorState;
  onSave: (userId: string, ids: number[]) => Promise<number[]>;
}) {
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = editor.get(user.user_id);
  const assigned = editor.ids(user.user_id);
  const diff = permissionDiff(state.history[0], assigned);
  const count = diff.granted.length + diff.revoked.length;
  const name = (id: number) => heads.find((head) => head.head_id === Math.abs(id))?.head_name ?? 'Unavailable head';

  async function apply() {
    setBusy(true);
    setError('');
    try {
      editor.commit(user.user_id, await onSave(user.user_id, assigned));
      setReview(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save permissions. Please retry.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex-col gap-md">
      <p>Permission changes for <strong>{user.user_name}</strong></p>
      <div className="flex-row gap-sm">
        <button className="btn" disabled={busy || !state.cursor} onClick={() => editor.undo(user.user_id)}>Undo</button>
        <button className="btn" disabled={busy || state.cursor === state.history.length - 1}
          onClick={() => editor.redo(user.user_id)}>Redo</button>
      </div>
      <button className="btn btn--primary" disabled={busy || !count} onClick={() => { setError(''); setReview(true); }}>
        Apply permissions{count ? ` (${count})` : ''}
      </button>
      {review && (
        <Dialog title={`Review permissions · ${user.user_name}`} onClose={() => setReview(false)} busy={busy}>
          <ul className="change-list">
            {diff.granted.map((id) => <li key={`grant-${id}`}>{id > 0 ? 'Allow branch' : 'Deny branch'}: {name(id)}</li>)}
            {diff.revoked.map((id) => <li key={`revoke-${id}`}>Remove previous rule: {name(id)}</li>)}
          </ul>
          {error && <p role="alert" className="text-error">{error}</p>}
          <div className="flex-row justify-end gap-sm">
            <button className="btn" disabled={busy} onClick={() => setReview(false)}>Cancel</button>
            <button className="btn btn--primary" disabled={busy} onClick={apply}>
              {busy ? 'Applying…' : 'Confirm and apply'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
