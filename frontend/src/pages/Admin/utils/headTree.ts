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

function assertSiblingNames(heads: Head[]) {
  const names = new Map<number | null, Set<string>>();
  for (const head of heads) {
    const siblings = names.get(head.parent_head_id) ?? new Set<string>();
    if (siblings.has(head.head_name)) throw new Error('A head with that name already exists under this parent.');
    siblings.add(head.head_name); names.set(head.parent_head_id, siblings);
  }
}

// One projection drives the editor, review, and local save. Temporary IDs are negative.
export function applyHeadChanges(heads: Head[], changes: StagedChange[], previewBackups = false): Head[] {
  let result = heads.map((head) => ({ ...head }));
  let previewId = Math.min(0, ...heads.map((head) => head.head_id), ...changes.filter((c) => c.op === 'create').map((c) => c.temp_id)) - 1;
  for (const change of changes) {
    assertSiblingNames(result);
    if (change.op === 'backup' || (change.op === 'merge' && change.backup)) {
      const source = change.op === 'backup' ? change.head_id : change.source_head_id;
      if (!result.some((head) => head.head_id === source)) throw new Error('This head no longer exists.');
      if (previewBackups) {
        const branch = result.filter((head) => isDescendant(result, source, head.head_id));
        const ids = new Map(branch.map((head) => [head.head_id, previewId--]));
        result.push(...branch.map((head) => ({ ...head, head_id: ids.get(head.head_id)!,
          parent_head_id: head.head_id === source ? null : ids.get(head.parent_head_id!)!,
          head_name: `${head.head_name} · Backup (date added on apply)`, is_active: false })));
      }
    }
    if (change.op === 'backup') continue;
    if (change.op === 'create' || change.op === 'edit') {
      const name = change.head_name.trim();
      const ownId = change.op === 'edit' ? change.head_id : undefined;
      const parentId = change.op === 'create' ? change.parent_head_id : result.find((head) => head.head_id === ownId)?.parent_head_id;
      const limit = change.op === 'edit' ? 160 : 48;
      if (!name || name.length > limit) throw new Error(`Head names must contain 1–${limit} characters.`);
      if (result.some((head) => head.head_id !== ownId && head.parent_head_id === parentId && head.head_name === name)) {
        throw new Error('A head with that name already exists under this parent.');
      }
    }
    if (change.op === 'edit') {
      const head = result.find((head) => head.head_id === change.head_id);
      if (!head) throw new Error('This head no longer exists.');
      if (head.image_url !== change.image_url) head.attachment_id = null;
      Object.assign(head, {
        head_name: change.head_name.trim(), head_description: change.head_description ?? head.head_description, image_url: change.image_url,
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
        head_description: change.head_description ?? '', is_active: true, is_transactionable: change.is_transactionable ?? false,
      });
      continue;
    }
    if (change.op === 'delete') {
      const head = result.find((head) => head.head_id === change.head_id);
      if (!head) throw new Error('This head no longer exists.');
      // Delete this node only; preserve its children at the same parent level.
      result = result.filter((item) => item.head_id !== head.head_id);
      result.forEach((item) => { if (item.parent_head_id === head.head_id) item.parent_head_id = head.parent_head_id; });
      continue;
    }
    if (change.op === 'active') {
      if (!result.some((head) => head.head_id === change.head_id)) throw new Error('This head no longer exists.');
      result.forEach((head) => {
        if (head.head_id === change.head_id || (!change.is_active && isDescendant(result, change.head_id, head.head_id))) head.is_active = change.is_active;
      });
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
  assertSiblingNames(result);
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
      description = `Delete ${name(change.head_id)} and permanently delete its transactions. Subheads move to ${name(head?.parent_head_id ?? null)}.`;
    }
    else if (change.op === 'active') description = `${change.is_active ? 'Reactivate' : 'Deactivate'} ${name(change.head_id)}${change.is_active ? '' : ' and its subheads'}`;
    else if (change.op === 'backup') description = `Create a dated backup of ${name(change.head_id)} and its entire branch at the top level. Copied heads and transactions are deactivated.`;
    else if (change.op === 'merge') description = `${change.backup ? 'Back up the source branch, then merge' : 'Merge'} ${name(change.source_head_id)} into ${name(change.target_head_id)}`;
    else {
      const from = current.find((h) => h.head_id === change.head_id)!.parent_head_id;
      description = `Move ${name(change.head_id)}: ${name(from)} → ${name(change.new_parent_id)}`;
    }
    current = applyHeadChanges(current, [change]);
    return description;
  });
}
