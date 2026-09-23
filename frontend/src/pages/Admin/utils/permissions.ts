import type { Head } from '../types.ts';

export interface PermissionHistory { history: number[][]; cursor: number; }
export const startPermissions = (ids: number[]): PermissionHistory => ({ history: [[...new Set(ids)]], cursor: 0 });

export function togglePermission(state: PermissionHistory, headId: number): PermissionHistory {
  const selected = new Set(state.history[state.cursor]);
  if (selected.has(headId)) selected.delete(headId);
  else selected.add(headId);
  return {
    history: [...state.history.slice(0, state.cursor + 1), [...selected]],
    cursor: state.cursor + 1,
  };
}

export function permissionDiff(before: number[], after: number[]) {
  const oldIds = new Set(before);
  const newIds = new Set(after);
  return {
    granted: after.filter((id) => !oldIds.has(id)),
    revoked: before.filter((id) => !newIds.has(id)),
  };
}

// Exact IDs only. Parents, descendants, moves and merges never grant access.
export function permittedHeads(heads: Head[], ids: number[]): Head[] {
  const assigned = new Set(ids);
  return heads.filter((head) => head.is_active && assigned.has(head.head_id));
}
