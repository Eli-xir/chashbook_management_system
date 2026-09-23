import { useState } from 'react';
import type { Permissions } from '../types';
import { permissionDiff, startPermissions, togglePermission } from '../utils/permissions';
import type { PermissionHistory } from '../utils/permissions';

export function usePermissionChanges(saved: Permissions) {
  const [drafts, setDrafts] = useState<Record<string, PermissionHistory>>({});
  const get = (userId: string) => drafts[userId] ?? startPermissions(saved[userId] ?? []);
  function update(userId: string, edit: (state: PermissionHistory) => PermissionHistory) {
    setDrafts((previous) => ({
      ...previous, [userId]: edit(previous[userId] ?? startPermissions(saved[userId] ?? [])),
    }));
  }
  return {
    get,
    ids: (userId: string) => { const state = get(userId); return state.history[state.cursor]; },
    dirty: Object.values(drafts).some((state) => {
      const diff = permissionDiff(state.history[0], state.history[state.cursor]);
      return diff.granted.length + diff.revoked.length > 0;
    }),
    toggle: (userId: string, headId: number) => update(userId, (state) => togglePermission(state, headId)),
    undo: (userId: string) => update(userId, (s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) })),
    redo: (userId: string) => update(userId, (s) => ({ ...s, cursor: Math.min(s.history.length - 1, s.cursor + 1) })),
    commit: (userId: string, ids: number[]) => update(userId, () => startPermissions(ids)),
    reset: () => setDrafts({}),
  };
}
export type PermissionEditorState = ReturnType<typeof usePermissionChanges>;
