// src/pages/Admin/utils/headTree.ts
import type { Head, HeadNode, StagedChange } from '../types';

export function buildHeadTree(heads: Head[]): HeadNode[] {
  const byId = new Map<number, HeadNode>();
  heads.forEach((h) => byId.set(h.head_id, { ...h, children: [] }));

  const roots: HeadNode[] = [];
  byId.forEach((node) => {
    if (node.parent_head_id === null || !byId.has(node.parent_head_id)) {
      roots.push(node);
    } else {
      byId.get(node.parent_head_id)!.children.push(node);
    }
  });

  const sortChildren = (nodes: HeadNode[]) => {
    nodes.sort((a, b) => a.head_name.localeCompare(b.head_name));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

// True if candidateDescendantId is headId itself, or a descendant of it.
// Used to block a drop that would create a cycle (A -> B -> A).
export function isDescendant(heads: Head[], headId: number, candidateDescendantId: number): boolean {
  const byId = new Map(heads.map((h) => [h.head_id, h]));
  let current = byId.get(candidateDescendantId);
  while (current) {
    if (current.head_id === headId) return true;
    current = current.parent_head_id !== null ? byId.get(current.parent_head_id) : undefined;
  }
  return false;
}

// Re-applies staged "move" ops on top of the original flat list so the tree
// re-renders with pending moves visible before anything hits the server.
export function applyStagedMoves(heads: Head[], changes: StagedChange[]): Head[] {
  const result = heads.map((h) => ({ ...h }));
  const byId = new Map(result.map((h) => [h.head_id, h]));

  changes.forEach((change) => {
    if (change.op === 'move') {
      const head = byId.get(change.head_id);
      if (head) head.parent_head_id = change.new_parent_id;
    }
  });

  return result;
}

export interface DiffAnnotation {
  moved?: { fromParentName: string; toParentName: string };
  mergeRole?: 'source' | 'target';
  mergeCounterpartName?: string;
}

// Builds what the confirmation dialog shows: the resulting tree, annotated
// so every moved/merged node carries enough info to render as a visible diff.
export function buildDiffTree(
  originalHeads: Head[],
  changes: StagedChange[]
): { tree: HeadNode[]; annotations: Map<number, DiffAnnotation> } {
  const nameById = new Map(originalHeads.map((h) => [h.head_id, h.head_name]));
  const annotations = new Map<number, DiffAnnotation>();

  changes.forEach((change) => {
    if (change.op === 'move') {
      const head = originalHeads.find((h) => h.head_id === change.head_id);
      annotations.set(change.head_id, {
        moved: {
          fromParentName: head?.parent_head_id != null ? nameById.get(head.parent_head_id) ?? 'Root' : 'Root',
          toParentName: change.new_parent_id != null ? nameById.get(change.new_parent_id) ?? 'Root' : 'Root',
        },
      });
    } else {
      annotations.set(change.source_head_id, {
        ...annotations.get(change.source_head_id),
        mergeRole: 'source',
        mergeCounterpartName: nameById.get(change.target_head_id) ?? `#${change.target_head_id}`,
      });
      annotations.set(change.target_head_id, {
        ...annotations.get(change.target_head_id),
        mergeRole: 'target',
        mergeCounterpartName: nameById.get(change.source_head_id) ?? `#${change.source_head_id}`,
      });
    }
  });

  const movedHeads = applyStagedMoves(originalHeads, changes);
  const tree = buildHeadTree(movedHeads);

  return { tree, annotations };
}