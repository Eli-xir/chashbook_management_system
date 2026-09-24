import type { Head } from '../types.ts';

export interface PermissionHistory { history: number[][]; cursor: number; }
export const startPermissions = (ids: number[]): PermissionHistory => ({ history: [[...new Set(ids)]], cursor: 0 });

// Positive IDs grant a branch; negative IDs deny it. Nearest rule wins.
export function changeBranch(ids: number[], heads: Head[], headId: number, allow: boolean): number[] {
  const branch = new Set([headId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const h of heads) if (h.parent_head_id !== null && branch.has(h.parent_head_id) && !branch.has(h.head_id)) {
      branch.add(h.head_id); changed = true;
    }
  }
  return [...ids.filter((id) => !branch.has(Math.abs(id))), allow ? headId : -headId];
}
export function permissionDiff(before: number[], after: number[]) {
  const oldIds = new Set(before);
  const newIds = new Set(after);
  return {
    granted: after.filter((id) => !oldIds.has(id)),
    revoked: before.filter((id) => !newIds.has(id)),
  };
}

export function permittedHeads(heads: Head[], ids: number[]): Head[] {
  const rules = new Map(ids.map((id) => [Math.abs(id), id > 0]));
  const byId = new Map(heads.map((h) => [h.head_id, h]));
  return heads.filter((head) => {
    if (!head.is_active) return false;
    let cursor: Head | undefined = head;
    const seen = new Set<number>();
    while (cursor && !seen.has(cursor.head_id)) {
      seen.add(cursor.head_id);
      if (rules.has(cursor.head_id)) return rules.get(cursor.head_id);
      cursor = cursor.parent_head_id === null ? undefined : byId.get(cursor.parent_head_id);
    }
    return false;
  });
}
