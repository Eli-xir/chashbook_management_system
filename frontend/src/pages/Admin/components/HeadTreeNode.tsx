import { useState } from 'react';
import type { Head, HeadNode } from '../types';

interface TreeProps {
  node: HeadNode;
  mergeMode?: boolean;
  selected?: number | 'new' | null;
  onSelect?: (id: number) => void;
  onDrop?: (source: string, target: number | null) => void;
  onEdit?: (head: Head) => void;
  onToggleTransactionable?: (head: Head) => void;
  assigned?: Set<number>;
}

export function HeadTreeNode({ node, mergeMode, selected, onSelect, onDrop, onEdit, onToggleTransactionable, assigned }: TreeProps) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <li className="head-node">
      <details open>
        <summary className={[
          'head-node-row', mergeMode ? 'shake-active' : '',
          assigned ? (assigned.has(node.head_id) ? 'permission-granted' : 'permission-unassigned') : '',
          dragOver ? 'head-node-row--drag-over' : '', !node.is_active ? 'head-node-row--inactive' : '',
        ].join(' ')}
          draggable={!!onDrop}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData('text/plain', String(node.head_id));
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event) => {
            if (onDrop) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(false);
            onDrop?.(event.dataTransfer.getData('text/plain'), node.head_id);
          }}>
          {node.image_url && <img className="head-icon" src={node.image_url} alt="" />}
          {onSelect ? (
            <button type="button" className="head-node-name" aria-pressed={assigned ? assigned.has(node.head_id) : selected === node.head_id}
              onClick={(event) => { event.preventDefault(); onSelect(node.head_id); }}>{node.head_name}</button>
          ) : <span className="head-node-name">{node.head_name}</span>}
          {!node.is_transactionable && !onToggleTransactionable && <span className="head-node-badge">group</span>}
          {(onEdit || onToggleTransactionable) && <span className="head-actions">
            {onToggleTransactionable && <button type="button" className="head-edit head-transaction-toggle"
              aria-label={`Allow transactions for ${node.head_name}`} aria-pressed={node.is_transactionable}
              title={`Transactions ${node.is_transactionable ? 'enabled — tap to disable' : 'disabled — tap to enable'}`}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleTransactionable(node); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="12" cy="12" r="3" />
                <path d="M6 12h1m10 0h1" />
                {!node.is_transactionable && <path d="M3 3l18 18" />}
              </svg>
            </button>}
            {onEdit && <button type="button" className="head-edit" aria-label={`Edit ${node.head_name}`}
              title="Edit or delete head" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onEdit(node); }}>✎</button>}
          </span>}
        </summary>
        {node.children.length > 0 && (
          <ul className="head-node-children">
            {node.children.map((child) => (
              <HeadTreeNode key={child.head_id} node={child} mergeMode={mergeMode}
                selected={selected} onSelect={onSelect} onDrop={onDrop} onEdit={onEdit}
                onToggleTransactionable={onToggleTransactionable} assigned={assigned} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}
