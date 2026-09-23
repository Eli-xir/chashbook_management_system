import { useEffect, useState } from 'react';
import type { Head, StagedChange } from '../types';
import { applyHeadChanges, buildHeadTree } from '../utils/headTree';
import { useStagedHeadChanges } from '../hooks/useStagedHeadChanges';
import { HeadTreeNode } from './HeadTreeNode';
import { ConfirmChangesDialog } from './ConfirmChangesDialog';
import { PendingHeadBlob } from './PendingHeadBlob';
import { HeadEditor } from './HeadEditor';
import './HeadsTab.css';

export function HeadsTab({ heads, reservedIds, onSubmitChanges, onDirtyChange, filterHeadId, onFilterHead }: {
  heads: Head[]; onSubmitChanges: (changes: StagedChange[]) => Promise<Head[]>;
  reservedIds: number[];
  onDirtyChange: (dirty: boolean) => void;
  filterHeadId?: number | null;
  onFilterHead: (headId: number | null) => void;
}) {
  const staged = useStagedHeadChanges(heads);
  const [mergeMode, setMergeMode] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('New head');
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Head | null>(null);
  const [pickingFilter, setPickingFilter] = useState(false);
  const displayed = applyHeadChanges(staged.heads, staged.changes);
  const dirty = staged.changes.length > 0 || editing !== null || name !== 'New head';
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function stage(change: StagedChange) {
    try {
      applyHeadChanges(displayed, [change]);
      staged.addChange(change);
      setSelected(null);
      setError('');
      return true;
    } catch (error) { setError((error as Error).message); return false; }
  }

  function drop(source: string, target: number | null) {
    if (submitting) return;
    const id = Number(source);
    if (source !== 'new' && (!source || !Number.isFinite(id))) return;
    if (source !== 'new' && id === target) { setSelected(null); return; }
    if (mergeMode && source !== 'new' && target === null) {
      setError('Choose a head to merge into.'); return;
    }
    const change: StagedChange = source === 'new'
      ? { op: 'create', temp_id: Math.min(0, ...reservedIds, ...staged.heads.map((h) => h.head_id),
          ...staged.changes.filter((c) => c.op === 'create').map((c) => c.temp_id)) - 1,
          head_name: name, parent_head_id: target, is_transactionable: true }
      : mergeMode
        ? { op: 'merge', source_head_id: id, target_head_id: target! }
        : { op: 'move', head_id: id, new_parent_id: target };
    if (change.op === 'move' && displayed.find((h) => h.head_id === id)?.parent_head_id === target) return;
    if (stage(change) && source === 'new') setName('New head');
  }

  async function apply() {
    setSubmitting(true);
    setError('');
    try {
      const savedHeads = await onSubmitChanges(staged.changes);
      staged.clear(savedHeads);
      setReviewing(false);
      setSelected(null);
    } catch { setError('Could not save changes. Your edits are still here; please try again.'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="flex-col gap-md">
      <div className="field">
        <span className="section-label">Selected head · ledger filter</span>
        <div className="flex-row items-center gap-sm">
          <button className="btn" aria-pressed={pickingFilter} onClick={() => {
            setPickingFilter(!pickingFilter); setSelected(null);
          }}>{filterHeadId == null ? 'All heads' : `${heads.find((head) => head.head_id === filterHeadId)?.head_name ?? 'Unavailable head'} + subheads`}</button>
          {filterHeadId != null && <button className="btn" onClick={() => { setPickingFilter(false); onFilterHead(null); }}>Clear</button>}
        </div>
        <p className="hint text-muted">{pickingFilter ? 'Tap a head below to filter its entire branch.' : 'Tap the selected-head field to choose a branch from the tree.'}</p>
      </div>
      <div className="flex-row flex-wrap gap-sm">
        <button className="btn" aria-pressed={mergeMode} onClick={() => { setMergeMode(!mergeMode); setSelected(null); }}>
          Merge {mergeMode ? 'on' : 'off'}
        </button>
        <button className="btn" disabled={!staged.canUndo} onClick={() => { staged.undo(); setSelected(null); setError(''); }}>Undo</button>
        <button className="btn" disabled={!staged.canRedo} onClick={() => { staged.redo(); setSelected(null); setError(''); }}>Redo</button>
      </div>
      <section className="flex-col gap-sm">
        <h3 className="section-label">New node</h3>
        <PendingHeadBlob name={name} onRename={setName} onSelect={() => setSelected('new')} />
        <p className="hint text-muted">Double-click or press F2 to rename. Drag into a folder, or select a node and tap its destination.</p>
      </section>
      {mergeMode && <p className="hint text-muted">Merge mode: drop a head onto another to combine their branches.</p>}
      {selected !== null && (
        <button className="btn" onClick={() => setSelected(null)}>Cancel selection</button>
      )}
      <div className="heads-tree">
        {displayed.length === 0 && <p className="empty-state text-muted">No heads yet. Place your first node below.</p>}
        <ul>
          {buildHeadTree(displayed).map((node) => (
            <HeadTreeNode key={node.head_id} node={node} mergeMode={!pickingFilter && mergeMode}
              selected={pickingFilter ? filterHeadId : selected} onDrop={pickingFilter ? undefined : drop} onEdit={pickingFilter ? undefined : setEditing}
              onToggleTransactionable={pickingFilter ? undefined : (head) => stage({ op: 'edit', head_id: head.head_id,
                head_name: head.head_name, image_url: head.image_url ?? null, is_transactionable: !head.is_transactionable })}
              onSelect={(id) => {
                if (pickingFilter) {
                  if (!heads.some((head) => head.head_id === id)) { setError('Apply this new head before using it as a ledger filter.'); return; }
                  setPickingFilter(false); setError(''); onFilterHead(id);
                } else if (selected === null) setSelected(id);
                else drop(String(selected), id);
              }} />
          ))}
        </ul>
        <button className="heads-tree-root-dropzone" disabled={pickingFilter} onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); drop(event.dataTransfer.getData('text/plain'), null); }}
          onClick={() => { if (selected !== null) drop(String(selected), null); }}>
          Drop here for top level
        </button>
      </div>
      {!reviewing && error && <p role="alert" className="text-error">{error}</p>}
      <button className="btn btn--primary" disabled={!staged.changes.length}
        onClick={() => { setError(''); setReviewing(true); }}>Apply{staged.changes.length ? ` (${staged.changes.length})` : ''}</button>
      {reviewing && <ConfirmChangesDialog originalHeads={staged.heads} changes={staged.changes} error={error}
        isSubmitting={submitting} onCancel={() => setReviewing(false)} onConfirm={apply} />}
      {editing && <HeadEditor head={editing} onSave={stage} onClose={() => setEditing(null)} />}
    </div>
  );
}
