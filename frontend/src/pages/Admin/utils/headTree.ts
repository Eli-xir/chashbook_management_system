import type { Head, HeadNode, StagedChange } from '../types.ts';

export function buildHeadTree(heads: Head[]): HeadNode[] {
  const byId = new Map(heads.map((head) => [head.head_id, { ...head, children: [] } as HeadNode]));
  const roots: HeadNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_head_id === null ? undefined : byId.get(node.parent_head_id);
    (parent ? parent.children : roots).push(node);
  }
  function sort(nodes: HeadNode[]) {
    nodes.sort((a, b) => a.head_name.localeCompare(b.head_name));
    nodes.forEach((node) => sort(node.children));
  }
  sort(roots);
  return roots;
}

export function isDescendant(heads: Head[], ancestor: number, candidate: number): boolean {
  const byId = new Map(heads.map((head) => [head.head_id, head]));
  const visited = new Set<number>();
  let current = byId.get(candidate);
  while (current && !visited.has(current.head_id)) {
    if (current.head_id === ancestor) return true;
    visited.add(current.head_id);
    current = current.parent_head_id === null ? undefined : byId.get(current.parent_head_id);
  }
  return false;
}

// One projection drives the editor, review, and local save. Temporary IDs are negative.
export function applyHeadChanges(heads: Head[], changes: StagedChange[]): Head[] {
  let result = heads.map((head) => ({ ...head }));
  for (const change of changes) {
    if (change.op === 'create' || change.op === 'edit') {
      const name = change.head_name.trim();
      const ownId = change.op === 'edit' ? change.head_id : undefined;
      if (!name || name.length > 48) throw new Error('Head names must contain 1–48 characters.');
      if (result.some((head) => head.head_id !== ownId && head.head_name === name)) {
        throw new Error('A head with that name already exists.');
      }
    }
    if (change.op === 'edit') {
      const head = result.find((head) => head.head_id === change.head_id);
      if (!head) throw new Error('This head no longer exists.');
      if (head.image_url !== change.image_url) head.attachment_id = null;
      Object.assign(head, {
        head_name: change.head_name.trim(), image_url: change.image_url,
        is_transactionable: change.is_transactionable,
      });
      continue;
    }
    if (change.op === 'create') {
      if (!change.head_name.trim() || result.some((h) => h.head_id === change.temp_id)) {
        throw new Error('Give each new head a name and a unique ID.');
      }
      if (change.parent_head_id !== null && !result.some((h) => h.head_id === change.parent_head_id)) {
        throw new Error('The destination head no longer exists.');
      }
      result.push({
        head_id: change.temp_id, head_name: change.head_name.trim(), parent_head_id: change.parent_head_id,
        is_active: true, is_transactionable: change.is_transactionable ?? true,
      });
      continue;
    }
    if (change.op === 'delete') {
      const head = result.find((head) => head.head_id === change.head_id);
      if (!head) throw new Error('This head no longer exists.');
      if (!['hard_delete', 'backup'].includes(change.transaction_handling)) {
        throw new Error('Choose how to handle this head’s transactions.');
      }
      // Delete this node only; preserve its children at the same parent level.
      result = result.filter((item) => item.head_id !== head.head_id);
      result.forEach((item) => { if (item.parent_head_id === head.head_id) item.parent_head_id = head.parent_head_id; });
      continue;
    }
    const source = change.op === 'move' ? change.head_id : change.source_head_id;
    const target = change.op === 'move' ? change.new_parent_id : change.target_head_id;
    const head = result.find((h) => h.head_id === source);
    if (!head || (target !== null && !result.some((h) => h.head_id === target))) {
      throw new Error('One of these heads no longer exists.');
    }
    if (target !== null && isDescendant(result, source, target)) {
      throw new Error('A head cannot be placed or merged inside its own branch.');
    }
    if (change.op === 'move') head.parent_head_id = target;
    else {
      result = result.filter((h) => h.head_id !== source);
      result.forEach((h) => { if (h.parent_head_id === source) h.parent_head_id = target; });
    }
  }
  return result;
}

export function describeChanges(heads: Head[], changes: StagedChange[]): string[] {
  let current = heads;
  return changes.map((change) => {
    const name = (id: number | null) => current.find((h) => h.head_id === id)?.head_name ?? 'Top level';
    let description: string;
    if (change.op === 'create') description = `Add “${change.head_name}” under ${name(change.parent_head_id)} (${change.is_transactionable === false ? 'non-transactionable' : 'transactionable'})`;
    else if (change.op === 'edit') description = `Edit ${name(change.head_id)} → ${change.head_name} (name / image; ${change.is_transactionable ? 'transactionable' : 'non-transactionable'})`;
    else if (change.op === 'delete') {
      const head = current.find((head) => head.head_id === change.head_id);
      description = `Delete ${name(change.head_id)}; ${change.transaction_handling === 'backup' ? 'request a backend backup of its transactions' : 'request hard deletion of all its transactions'}. Subheads move to ${name(head?.parent_head_id ?? null)}.`;
    }
    else if (change.op === 'merge') description = `Merge ${name(change.source_head_id)} into ${name(change.target_head_id)}`;
    else {
      const from = current.find((h) => h.head_id === change.head_id)!.parent_head_id;
      description = `Move ${name(change.head_id)}: ${name(from)} → ${name(change.new_parent_id)}`;
    }
    current = applyHeadChanges(current, [change]);
    return description;
  });
}
