import { useEffect, useState } from 'react';
import type { Head, MergeChange, StagedChange } from '../types';
import { applyHeadChanges, buildHeadTree, isDescendant } from '../utils/headTree';
import { useStagedHeadChanges } from '../hooks/useStagedHeadChanges';
import { HeadTreeNode } from './HeadTreeNode';
import { ConfirmChangesDialog } from './ConfirmChangesDialog';
import { NewHeadName } from './NewHeadName';
import { permittedHeads } from '../utils/permissions';
import { HeadEditor } from './HeadEditor';
import { Dialog } from './Dialog';
import './HeadsTab.css';

export function HeadsTab({ heads, reservedIds, onSubmitChanges, onDirtyChange, onHeadAction, permissionIds, readOnly = false, onPermissionChange }: {
  heads: Head[]; onSubmitChanges: (changes: StagedChange[]) => Promise<Head[]>;
  reservedIds: number[];
  permissionIds?: number[];
  readOnly?: boolean;
  onPermissionChange?: (head: Head, allow: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onHeadAction: (head: Head, action: 'give' | 'revoke') => void;
}) {
  const staged = useStagedHeadChanges(heads);
  const [mergeMode, setMergeMode] = useState(false);
  const [pendingMerge, setPendingMerge] = useState<MergeChange | null>(null);
  const [backupBeforeMerge, setBackupBeforeMerge] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Head | null>(null);
  const [search, setSearch] = useState('');
  const [menuHead, setMenuHead] = useState<Head | null>(null);
  const [newChild, setNewChild] = useState<{ parentId: number | null; name: string } | null>(null);
  const displayed = applyHeadChanges(staged.heads, staged.changes);
  const assigned = permissionIds ? new Set(permittedHeads(displayed, permissionIds).map((h) => h.head_id)) : undefined;
  const matches = new Set(displayed.filter((h) => `${h.head_name} ${h.head_description ?? ''}`.toLowerCase().includes(search.toLowerCase())).map((h) => h.head_id));
  for (const id of [...matches]) {
    // Keep each matching branch usable, including descendants that do not match the text.
    for (const child of displayed) {
      if (isDescendant(displayed, id, child.head_id)) matches.add(child.head_id);
    }
  }
  const searchTree = displayed.filter((h) => matches.has(h.head_id));
  const dirty = newChild !== null || staged.changes.length > 0 || editing !== null || pendingMerge !== null;
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

  function nextTemporaryId() {
    return Math.min(0, ...reservedIds, ...displayed.map((h) => h.head_id),
      ...staged.changes.filter((c) => c.op === 'create').map((c) => c.temp_id)) - 1;
  }
  function finishNewChild() {
    if (!newChild) return;
    if (stage({ op: 'create', temp_id: nextTemporaryId(), parent_head_id: newChild.parentId,
      head_name: newChild.name, is_transactionable: false })) setNewChild(null);
  }

  function drop(source: string, target: number | null) {
    if (submitting) return;
    const id = Number(source);
    if (!source || !Number.isFinite(id)) return;
    if (id === target) { setSelected(null); return; }
    const change: StagedChange = mergeMode
        ? { op: 'merge', source_head_id: id, target_head_id: target! }
        : { op: 'move', head_id: id, new_parent_id: target };
    if (change.op === 'move' && displayed.find((h) => h.head_id === id)?.parent_head_id === target) { setSelected(null); return; }
    if (change.op === 'merge') {
      try { applyHeadChanges(displayed, [change]); setPendingMerge(change); setBackupBeforeMerge(true); setError(''); }
      catch (error) { setError((error as Error).message); }
      return;
    }
    stage(change);
  }

  async function apply() {
    setSubmitting(true);
    setError('');
    try {
      const savedHeads = await onSubmitChanges(staged.changes);
      staged.clear(savedHeads);
      setReviewing(false);
      setSelected(null);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save changes. Your edits are still here.'); }
    finally { setSubmitting(false); }
  }

  const searchField = <input type="search" name="head-search" autoComplete="off" aria-label="Search heads" placeholder="Search heads by name or description" title="Search head names and descriptions" value={search} onChange={(event) => setSearch(event.target.value)} />;
  if (readOnly) return <div className="flex-col gap-md">
    {searchField}
    <ul className="hint text-muted"><li>Double-tap a head to grant or revoke access to it and its subheads.</li></ul>
    <div className="heads-tree"><ul>{buildHeadTree(searchTree).map((node) =>
      <HeadTreeNode key={node.head_id} node={node} assigned={assigned}
        onTogglePermission={(head) => onPermissionChange?.(head, !assigned?.has(head.head_id))} />)}</ul></div>
  </div>;

  return (
    <div className="flex-col gap-md">
      {searchField}
      <div className="flex-row flex-wrap gap-sm">
        <button className="btn" aria-pressed={mergeMode} onClick={() => { setMergeMode(!mergeMode); setSelected(null); }}>
          Merge {mergeMode ? 'on' : 'off'}
        </button>
        <button className="btn" disabled={!staged.canUndo} onClick={() => { staged.undo(); setSelected(null); setError(''); }}>Undo</button>
        <button className="btn" disabled={!staged.canRedo} onClick={() => { staged.redo(); setSelected(null); setError(''); }}>Redo</button>
      </div>
      <button className="btn" disabled={newChild !== null || submitting} onClick={() => {
        setNewChild({ parentId: null, name: 'New Head' }); setSelected(null); setSearch(''); setMergeMode(false); setError('');
      }}>New head</button>
      <ul className="hint text-muted">
        <li>Double-tap a head for actions. Hold a head, release, then tap its destination to {mergeMode ? 'merge' : 'move'} it. You can also drag and drop with a mouse.</li>
      </ul>
      {selected !== null && <div className="flex-row items-center gap-sm" role="status">
        <span>{mergeMode ? 'Merge' : 'Move'} “{displayed.find((head) => head.head_id === selected)?.head_name}”: tap a destination.</span>
        <button className="btn" onClick={() => setSelected(null)}>Cancel</button>
      </div>}
      <div className="heads-tree">
        {displayed.length === 0 && !newChild && <p className="empty-state text-muted">No heads yet. Create your first head.</p>}
        <ul>
          {buildHeadTree(searchTree).map((node) => (
            <HeadTreeNode key={node.head_id} node={node} mergeMode={mergeMode} assigned={assigned}
              newChild={newChild ? { ...newChild, onChange: (name) => setNewChild({ ...newChild, name }),
                onCommit: finishNewChild, onCancel: () => { setNewChild(null); setError(''); } } : undefined}
              selected={selected} onStartMove={(id) => { setSelected(id); setError(''); }} onDrop={drop} onEdit={setEditing} onContext={setMenuHead}
              onToggleTransactionable={(head) => stage({ op: 'edit', head_id: head.head_id,
                head_name: head.head_name, image_url: head.image_url ?? null, is_transactionable: !head.is_transactionable })}
              onSelect={(id) => {
                if (selected === null) setSelected(id);
                else drop(String(selected), id);
              }} />
          ))}
          {newChild?.parentId === null && <NewHeadName name={newChild.name}
            onChange={(name) => setNewChild({ ...newChild, name })} onCommit={finishNewChild}
            onCancel={() => { setNewChild(null); setError(''); }} />}
        </ul>
      </div>
      {!reviewing && error && <p role="alert" className="text-error">{error}</p>}
      <button className="btn btn--primary" disabled={!staged.changes.length}
        onClick={() => { setError(''); setReviewing(true); }}>Apply{staged.changes.length ? ` (${staged.changes.length})` : ''}</button>
      {reviewing && <ConfirmChangesDialog originalHeads={staged.heads} changes={staged.changes} error={error}
        isSubmitting={submitting} onCancel={() => setReviewing(false)} onConfirm={apply} />}
      {menuHead && <Dialog title={menuHead.head_name} onClose={() => setMenuHead(null)}>
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="head-context-menu">
          {(['give', 'revoke'] as const).map((action) => <button className="btn" key={action} onClick={() => { onHeadAction(menuHead, action); setMenuHead(null); }}>{action === 'give' ? 'Give permission' : 'Revoke permission'}</button>)}
          <button className="btn" onClick={() => {
            setNewChild({ parentId: menuHead.head_id, name: 'New Head' });
            setMenuHead(null); setSelected(null); setSearch(''); setMergeMode(false); setError('');
          }}>Add subhead</button>
          {menuHead.parent_head_id !== null && <button className="btn" disabled={submitting} onClick={() => {
            if (stage({ op: 'move', head_id: menuHead.head_id, new_parent_id: null })) {
              setMenuHead(null); setSearch('');
            }
          }}>Move to top level</button>}
          <button className="btn" onClick={() => setMenuHead(null)}>Back</button>
        </div>
      </Dialog>}
      {editing && <HeadEditor head={editing} onSave={stage} onClose={() => setEditing(null)} />}
      {pendingMerge && <Dialog title="Merge heads" onClose={() => setPendingMerge(null)}>
        <p>Merge “{displayed.find((head) => head.head_id === pendingMerge.source_head_id)?.head_name}” into “{displayed.find((head) => head.head_id === pendingMerge.target_head_id)?.head_name}”. The source head will be removed.</p>
        <label className="flex-row items-center gap-sm"><input type="checkbox" checked={backupBeforeMerge}
          onChange={(event) => setBackupBeforeMerge(event.target.checked)} />Create a backup before merging</label>
        <p className="hint text-muted">Copies the source head, its subheads and transaction history to a dated, deactivated branch at the top level.</p>
        <div className="flex-row justify-end gap-sm">
          <button className="btn" onClick={() => setPendingMerge(null)}>Cancel</button>
          <button className="btn btn--primary" onClick={() => {
            if (stage({ ...pendingMerge, backup: backupBeforeMerge })) setPendingMerge(null);
          }}>Stage merge</button>
        </div>
      </Dialog>}
    </div>
  );
}
