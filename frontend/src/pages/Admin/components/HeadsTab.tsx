// src/pages/Admin/components/HeadsTab.tsx
import { useMemo, useState} from 'react';
import type {DragEvent} from 'react';
import type { Head, StagedChange } from '../types';
import { buildHeadTree, applyStagedMoves } from '../utils/headTree';
import { useStagedHeadChanges } from '../hooks/useStagedHeadChanges';
import { HeadTreeNode } from './HeadTreeNode';
import { ConfirmChangesDialog } from './ConfirmChangesDialog.tsx';
import './HeadsTab.css';

interface HeadsTabProps {
  heads: Head[];
  onSubmitChanges: (changes: StagedChange[]) => Promise<void>;
}

export function HeadsTab({ heads, onSubmitChanges }: HeadsTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [mergeMode, setMergeMode] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { changes, addChange, undo, redo, clear, canUndo, canRedo, hasPendingChanges } =
    useStagedHeadChanges();

  const displayedHeads = useMemo(() => applyStagedMoves(heads, changes), [heads, changes]);
  const tree = useMemo(() => buildHeadTree(displayedHeads), [displayedHeads]);

  function toggleExpand(headId: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(headId) ? next.delete(headId) : next.add(headId);
      return next;
    });
  }

  function handleReparent(headId: number, newParentId: number | null) {
    if (headId === newParentId) return;
    addChange({ op: 'move', head_id: headId, new_parent_id: newParentId });
  }

  function handleMerge(sourceHeadId: number, targetHeadId: number) {
    if (sourceHeadId === targetHeadId) return;
    addChange({ op: 'merge', source_head_id: sourceHeadId, target_head_id: targetHeadId });
  }

  function handleDropToRoot(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (mergeMode) return; // "merge onto root" isn't a meaningful gesture
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (draggedId) handleReparent(draggedId, null);
  }

  async function handleConfirmApply() {
    setIsSubmitting(true);
    try {
      await onSubmitChanges(changes);
      clear();
      setIsConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="heads-tab flex-col gap-md">
      <div className="heads-toolbar flex-row items-center justify-between">
        <button
          type="button"
          className={`btn btn--toggle ${mergeMode ? 'btn--toggle-active' : ''}`}
          onClick={() => setMergeMode((v) => !v)}
        >
          {mergeMode ? 'Merge mode: on' : 'Merge mode: off'}
        </button>

        <div className="flex-row gap-sm">
          <button type="button" className="btn btn--ghost" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="btn btn--ghost" onClick={redo} disabled={!canRedo}>
            Redo
          </button>
        </div>
      </div>

      {mergeMode && (
        <p className="heads-tab-hint text-muted">
          Drag a head onto another to merge it in. Nodes shake while merge mode is on.
        </p>
      )}

      <div className="heads-tree" onDragOver={(e) => e.preventDefault()} onDrop={handleDropToRoot}>
        {tree.map((rootNode) => (
          <HeadTreeNode
            key={rootNode.head_id}
            node={rootNode}
            depth={0}
            allHeads={displayedHeads}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            mergeMode={mergeMode}
            onReparent={handleReparent}
            onMerge={handleMerge}
          />
        ))}
        <div className="heads-tree-root-dropzone text-muted">Drop here to move to top level</div>
      </div>

      <button
        type="button"
        className="btn btn--primary"
        disabled={!hasPendingChanges}
        onClick={() => setIsConfirmOpen(true)}
      >
        Apply {hasPendingChanges ? `(${changes.length})` : ''}
      </button>

      {isConfirmOpen && (
        <ConfirmChangesDialog
          originalHeads={heads}
          changes={changes}
          isSubmitting={isSubmitting}
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={handleConfirmApply}
        />
      )}
    </div>
  );
}