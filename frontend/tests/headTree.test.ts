import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHeadChanges, buildHeadTree, describeChanges, isDescendant } from '../src/pages/Admin/utils/headTree.ts';
import type { Head, StagedChange } from '../src/pages/Admin/types.ts';

const head = (id: number, name: string, parent: number | null = null): Head => ({
  head_id: id, head_name: name, parent_head_id: parent, is_active: true, is_transactionable: true,
});
const original = [head(1, 'Expenses'), head(2, 'Materials', 1), head(3, 'Other'), head(4, 'Paint', 2)];

test('new parents, nested creates, and subsequent moves use one consistent projection', () => {
  const changes: StagedChange[] = [
    { op: 'create', temp_id: -1, head_name: 'Project', parent_head_id: null },
    { op: 'create', temp_id: -2, head_name: 'Site', parent_head_id: -1 },
    { op: 'move', head_id: 2, new_parent_id: -2 },
  ];
  const result = applyHeadChanges(original, changes);
  assert.equal(result.find((h) => h.head_id === 2)?.parent_head_id, -2);
  assert.equal(result.find((h) => h.head_id === 4)?.parent_head_id, 2);
  assert.equal(original[1].parent_head_id, 1);
  assert.deepEqual(describeChanges(original, changes), [
    'Add “Project” under Top level (transactionable)', 'Add “Site” under Project (transactionable)', 'Move Materials: Expenses → Site',
  ]);
});

test('merge removes its source and preserves the complete child branch', () => {
  const result = applyHeadChanges(original, [{ op: 'merge', source_head_id: 1, target_head_id: 3 }]);
  assert.equal(result.some((h) => h.head_id === 1), false);
  assert.equal(result.find((h) => h.head_id === 2)?.parent_head_id, 3);
  assert.equal(result.find((h) => h.head_id === 4)?.parent_head_id, 2);
  assert.equal(buildHeadTree(result)[0].children[0].children[0].head_name, 'Paint');
});

test('moves and merges reject cycles, including cycles introduced by earlier staged changes', () => {
  assert.throws(() => applyHeadChanges(original, [{ op: 'move', head_id: 1, new_parent_id: 4 }]), /own branch/);
  assert.throws(() => applyHeadChanges(original, [{ op: 'merge', source_head_id: 1, target_head_id: 2 }]), /own branch/);
  assert.throws(() => applyHeadChanges(original, [
    { op: 'move', head_id: 3, new_parent_id: 2 },
    { op: 'move', head_id: 1, new_parent_id: 3 },
  ]), /own branch/);
  assert.deepEqual(applyHeadChanges(original, []), original);
});

test('blank names, duplicate temporary IDs and missing targets cannot be saved', () => {
  assert.throws(() => applyHeadChanges([], [{ op: 'create', temp_id: -1, head_name: ' ', parent_head_id: null }]));
  assert.throws(() => applyHeadChanges(original, [{ op: 'create', temp_id: 1, head_name: 'Duplicate', parent_head_id: null }]));
  assert.throws(() => applyHeadChanges(original, [{ op: 'move', head_id: 2, new_parent_id: 999 }]));
  assert.throws(() => applyHeadChanges(original, [{ op: 'create', temp_id: -1, head_name: 'Missing', parent_head_id: 999 }]));
});

test('replaying history prefixes restores undo/redo previews and branch sorting', () => {
  const changes: StagedChange[] = [
    { op: 'move', head_id: 2, new_parent_id: 3 },
    { op: 'merge', source_head_id: 3, target_head_id: 1 },
  ];
  assert.equal(applyHeadChanges(original, changes.slice(0, 1))[1].parent_head_id, 3);
  assert.equal(applyHeadChanges(original, changes)[1].parent_head_id, 1);
  assert.deepEqual(buildHeadTree([head(1, 'Z'), head(2, 'A')]).map((h) => h.head_name), ['A', 'Z']);
  assert.equal(isDescendant([head(1, 'A', 2), head(2, 'B', 1)], 3, 1), false);
});

test('head name and image edits are staged together without mutating the saved tree', () => {
  const edits: StagedChange[] = [{ op: 'edit', head_id: 2, head_name: 'Supplies', image_url: 'data:image/png;base64,fixture', is_transactionable: true }];
  const edited = applyHeadChanges(original, edits);
  assert.equal(edited[1].head_name, 'Supplies');
  assert.equal(edited[1].image_url, 'data:image/png;base64,fixture');
  assert.equal(original[1].head_name, 'Materials');
  assert.equal(edited[1].parent_head_id, original[1].parent_head_id);
  assert.match(describeChanges(original, edits)[0], /Materials → Supplies/);
  assert.throws(() => applyHeadChanges(original, [{ ...edits[0], head_name: 'Other' } as StagedChange]), /already exists/);
});

test('transactionable setting survives create/edit history and review', () => {
  const changes: StagedChange[] = [
    { op: 'create', temp_id: -1, head_name: 'Grouping', parent_head_id: null, is_transactionable: false },
    { op: 'edit', head_id: -1, head_name: 'Grouping', image_url: null, is_transactionable: true },
  ];
  assert.equal(applyHeadChanges([], changes.slice(0, 1))[0].is_transactionable, false);
  assert.equal(applyHeadChanges([], changes)[0].is_transactionable, true);
  assert.match(describeChanges([], changes)[0], /non-transactionable/);
  assert.match(describeChanges([], changes)[1], /; transactionable/);
});

test('deleting one head preserves children, and replay restores undo/redo exactly', () => {
  const changes: StagedChange[] = [{ op: 'delete', head_id: 2, transaction_handling: 'backup' }];
  const removed = applyHeadChanges(original, changes);
  assert.equal(removed.some((head) => head.head_id === 2), false);
  assert.equal(removed.find((head) => head.head_id === 4)?.parent_head_id, 1);
  assert.equal(original[3].parent_head_id, 2);
  assert.deepEqual(applyHeadChanges(original, []), original);
  assert.deepEqual(applyHeadChanges(original, changes), removed);
  assert.match(describeChanges(original, changes)[0], /backup.*Subheads move to Expenses/);
  const rootRemoved = applyHeadChanges(original, [{ op: 'delete', head_id: 1, transaction_handling: 'hard_delete' }]);
  assert.equal(rootRemoved.find((head) => head.head_id === 2)?.parent_head_id, null);
  assert.equal(rootRemoved.find((head) => head.head_id === 4)?.parent_head_id, 2);
});

test('deletion validates a policy and cannot leave later changes pointing to a missing head', () => {
  assert.throws(() => applyHeadChanges(original, [{ op: 'delete', head_id: 999, transaction_handling: 'backup' }]), /no longer exists/);
  assert.throws(() => applyHeadChanges(original, [
    { op: 'delete', head_id: 2, transaction_handling: '' } as unknown as StagedChange,
  ]), /Choose how/);
  assert.throws(() => applyHeadChanges(original, [
    { op: 'delete', head_id: 2, transaction_handling: 'hard_delete' },
    { op: 'move', head_id: 3, new_parent_id: 2 },
  ]), /no longer exists/);
});
