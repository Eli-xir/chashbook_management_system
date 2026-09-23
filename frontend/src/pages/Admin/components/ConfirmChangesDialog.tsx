import type { Head, StagedChange } from '../types';
import { applyHeadChanges, buildHeadTree, describeChanges } from '../utils/headTree';
import { HeadTreeNode } from './HeadTreeNode';
import { Dialog } from './Dialog';

export function ConfirmChangesDialog({ originalHeads, changes, isSubmitting, error, onCancel, onConfirm }: {
  originalHeads: Head[]; changes: StagedChange[]; isSubmitting: boolean; error: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog title="Review changes" onClose={onCancel} busy={isSubmitting}>
        <ol className="change-list">
          {describeChanges(originalHeads, changes).map((description, index) => <li key={index}>{description}</li>)}
        </ol>
        <h3 className="section-label">Resulting head tree</h3>
        <ul className="heads-tree">
          {buildHeadTree(applyHeadChanges(originalHeads, changes)).map((node) => <HeadTreeNode key={node.head_id} node={node} />)}
        </ul>
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex-row justify-end gap-sm">
          <button type="button" className="btn" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Applying…' : 'Confirm and apply'}
          </button>
        </div>
    </Dialog>
  );
}
