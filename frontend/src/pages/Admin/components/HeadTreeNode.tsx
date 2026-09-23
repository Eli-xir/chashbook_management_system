// src/pages/Admin/components/HeadTreeNode.tsx
import type { DragEvent} from 'react';
import {useState} from 'react';
import type { Head, HeadNode } from '../types';
import { isDescendant } from '../utils/headTree';

interface HeadTreeNodeProps {
  node: HeadNode;
  depth: number;
  allHeads: Head[];
  expandedIds: Set<number>;
  onToggleExpand: (headId: number) => void;
  mergeMode: boolean;
  onReparent: (headId: number, newParentId: number | null) => void;
  onMerge: (sourceHeadId: number, targetHeadId: number) => void;
}

export function HeadTreeNode({
  node,
  depth,
  allHeads,
  expandedIds,
  onToggleExpand,
  mergeMode,
  onReparent,
  onMerge,
}: HeadTreeNodeProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.head_id);

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData('text/plain', String(node.head_id));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation(); // don't let this also trigger the tree's root-level drop zone
    setIsDragOver(false);
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId || draggedId === node.head_id) return;

    if (mergeMode) {
      onMerge(draggedId, node.head_id);
      return;
    }

    // Block drops that would create a cycle: can't move a head under its own descendant.
    if (isDescendant(allHeads, draggedId, node.head_id)) return;
    onReparent(draggedId, node.head_id);
  }

  return (
    <div className="head-node">
      <div
        className={[
          'head-node-row',
          mergeMode ? 'shake-active' : '',
          isDragOver ? 'head-node-row--drag-over' : '',
          !node.is_active ? 'head-node-row--inactive' : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className="head-node-toggle"
          onClick={() => hasChildren && onToggleExpand(node.head_id)}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (isExpanded ? '▾' : '▸') : '·'}
        </button>
        <span className="head-node-name">{node.head_name}</span>
        {!node.is_transactionable && <span className="head-node-badge">group</span>}
      </div>

      {hasChildren && isExpanded && (
        <div className="head-node-children">
          {node.children.map((child) => (
            <HeadTreeNode
              key={child.head_id}
              node={child}
              depth={depth + 1}
              allHeads={allHeads}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              mergeMode={mergeMode}
              onReparent={onReparent}
              onMerge={onMerge}
            />
          ))}
        </div>
      )}
    </div>
  );
}