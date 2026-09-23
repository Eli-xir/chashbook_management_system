import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionDiff, permittedHeads, startPermissions, togglePermission } from '../src/pages/Admin/utils/permissions.ts';
import { applyHeadChanges } from '../src/pages/Admin/utils/headTree.ts';
import type { Head } from '../src/pages/Admin/types.ts';

const heads: Head[] = [
  { head_id: 1, parent_head_id: null, head_name: 'Parent', is_active: true, is_transactionable: false },
  { head_id: 2, parent_head_id: 1, head_name: 'Child', is_active: true, is_transactionable: true },
  { head_id: 3, parent_head_id: null, head_name: 'Other', is_active: true, is_transactionable: true },
];

test('exact permissions allow an isolated child and never grant a parent or descendants', () => {
  assert.deepEqual(permittedHeads(heads, [2]).map((head) => head.head_id), [2]);
  assert.deepEqual(permittedHeads(heads, [1]).map((head) => head.head_id), [1]);
  assert.deepEqual(permittedHeads([{ ...heads[1], is_active: false }], [2]), []);
});

test('moving an assigned head changes neither its assignment nor visibility', () => {
  const assigned = [2];
  const moved = applyHeadChanges(heads, [{ op: 'move', head_id: 2, new_parent_id: 3 }]);
  assert.deepEqual(permittedHeads(moved, assigned).map((head) => head.head_id), [2]);
  assert.deepEqual(assigned, [2]);
});

test('merging never transfers source permissions to the target', () => {
  const assigned = [2];
  const merged = applyHeadChanges(heads, [{ op: 'merge', source_head_id: 2, target_head_id: 3 }]);
  assert.deepEqual(permittedHeads(merged, assigned), []);
  assert.deepEqual(assigned, [2]);
});

test('permission toggles support undo, redo, and branching after undo', () => {
  const initial = startPermissions([1]);
  const second = togglePermission(initial, 2);
  const third = togglePermission(second, 1);
  assert.deepEqual(third.history[third.cursor], [2]);
  const undo = { ...third, cursor: third.cursor - 1 };
  assert.deepEqual(undo.history[undo.cursor], [1, 2]);
  const branch = togglePermission(undo, 3);
  assert.deepEqual(branch.history[branch.cursor], [1, 2, 3]);
  assert.equal(branch.history.length, 3);
  assert.deepEqual(initial.history, [[1]]);
});

test('grant then revoke is clean, and separate user histories do not leak', () => {
  const alice = togglePermission(startPermissions([]), 2);
  const bob = togglePermission(startPermissions([3]), 1);
  const reverted = togglePermission(alice, 2);
  assert.deepEqual(permissionDiff([], reverted.history[reverted.cursor]), { granted: [], revoked: [] });
  assert.deepEqual(alice.history[alice.cursor], [2]);
  assert.deepEqual(bob.history[bob.cursor], [3, 1]);
  assert.deepEqual(permissionDiff([1, 2], [2, 3]), { granted: [3], revoked: [1] });
});
