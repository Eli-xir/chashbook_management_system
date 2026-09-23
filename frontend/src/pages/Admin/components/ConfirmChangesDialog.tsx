// src/pages/Admin/components/ConfirmChangesDialog.tsx
import type { Head, HeadNode, StagedChange } from '../types';
import { buildDiffTree} from '../utils/headTree';
import type {DiffAnnotation} from '../utils/headTree'
import './ConfirmChangesDialog.css';

interface ConfirmChangesDialogProps {
  originalHeads: Head[];
  changes: StagedChange[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmChangesDialog({
  originalHeads,
  changes,
  isSubmitting,
  onCancel,
  onConfirm,
}: ConfirmChangesDialogProps) {
  const { tree, annotations } = buildDiffTree(originalHeads, changes);

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true">
      <div className="dialog-panel flex-col gap-md">
        <div>
          <h2>Review changes</h2>
          <p className="text-muted">
            {changes.length} pending {changes.length === 1 ? 'change' : 'changes'}. Applies as a single batch — all or nothing.
          </p>
        </div>

        <div className="diff-tree">
          {tree.map((node) => (
            <DiffNode key={node.head_id} node={node} depth={0} annotations={annotations} />
          ))}
        </div>

        <div className="dialog-actions flex-row justify-end gap-sm">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Applying…' : 'Confirm and apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffNode({
  node,
  depth,
  annotations,
}: {
  node: HeadNode;
  depth: number;
  annotations: Map<number, DiffAnnotation>;
}) {
  const annotation = annotations.get(node.head_id);

  return (
    <div>
      <div
        className={[
          'diff-node',
          annotation?.moved ? 'diff-node--moved' : '',
          annotation?.mergeRole === 'source' ? 'diff-node--merge-source' : '',
          annotation?.mergeRole === 'target' ? 'diff-node--merge-target' : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <span className={annotation?.mergeRole === 'source' ? 'diff-node-name--strike' : ''}>
          {node.head_name}
        </span>
        {annotation?.moved && (
          <span className="diff-node-tag diff-node-tag--moved">
            moved from {annotation.moved.fromParentName} → {annotation.moved.toParentName}
          </span>
        )}
        {annotation?.mergeRole === 'source' && (
          <span className="diff-node-tag diff-node-tag--merge">merging into {annotation.mergeCounterpartName}</span>
        )}
        {annotation?.mergeRole === 'target' && (
          <span className="diff-node-tag diff-node-tag--merge">receiving merge from {annotation.mergeCounterpartName}</span>
        )}
      </div>
      {node.children.map((child) => (
        <DiffNode key={child.head_id} node={child} depth={depth + 1} annotations={annotations} />
      ))}
    </div>
  );
}