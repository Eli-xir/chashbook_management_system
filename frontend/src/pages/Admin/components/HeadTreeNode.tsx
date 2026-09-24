import { useEffect, useRef, useState } from 'react';
import type { Head, HeadNode } from '../types';
import { NewHeadName } from './NewHeadName';

interface TreeProps {
  node: HeadNode;
  newChild?: { parentId: number | null; name: string; onChange: (name: string) => void; onCommit: () => void; onCancel: () => void };
  mergeMode?: boolean;
  selected?: number | null;
  onSelect?: (id: number) => void;
  onDrop?: (source: string, target: number | null) => void;
  onEdit?: (head: Head) => void;
  onToggleTransactionable?: (head: Head) => void;
  assigned?: Set<number>;
  onContext?: (head: Head) => void;
}

export function HeadTreeNode({ node, mergeMode, selected, onSelect, onDrop, onEdit, onToggleTransactionable, assigned, onContext, newChild }: TreeProps) {
  const details = useRef<HTMLDetailsElement>(null);
  const addingHere = newChild?.parentId === node.head_id;
  useEffect(() => {
    if (!newChild || !details.current?.querySelector('.head-new-name')) return;
    details.current.open = true;
  }, [addingHere, newChild?.parentId]);
  const [dragOver, setDragOver] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const click = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const clearHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => () => { clearHold(); if (click.current) clearTimeout(click.current); }, []);
  return (
    <li className="head-node">
      <details ref={details} open>
        <summary className={[
          'head-node-row', mergeMode ? 'shake-active' : '',
          assigned ? (assigned.has(node.head_id) ? 'permission-granted' : 'permission-unassigned') : '',
          dragOver ? 'head-node-row--drag-over' : '', !node.is_active ? 'head-node-row--inactive' : '',
        ].join(' ')}
          onContextMenu={(event) => { if (onContext) { event.preventDefault(); clearHold(); onContext(node); } }}
          onPointerDown={(event) => {
            held.current = false;
            if (!onContext || (event.target as HTMLElement).closest('.head-actions')) return;
            start.current = { x: event.clientX, y: event.clientY };
            hold.current = setTimeout(() => { held.current = true; if (click.current) clearTimeout(click.current); onContext(node); }, 550);
          }}
          onPointerMove={(event) => { if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) clearHold(); }}
          onPointerUp={clearHold} onPointerCancel={clearHold}
          onClickCapture={(event) => { if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false; } }}
          draggable={!!onDrop}
          onDragStart={(event) => {
            clearHold();
            if (held.current) { event.preventDefault(); return; }
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
              onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (click.current) clearTimeout(click.current); onEdit?.(node); }}
              onKeyDown={(event) => { if (event.key === 'F2') { event.preventDefault(); onEdit?.(node); } }}
              onClick={(event) => { event.preventDefault(); if (!onEdit) onSelect(node.head_id);
                else if (event.detail < 2) click.current = setTimeout(() => onSelect(node.head_id), 250); }}>{node.head_name}</button>
          ) : <span className="head-node-name">{node.head_name}</span>}
          {node.head_description && <span className="head-description" title={node.head_description}>{node.head_description}</span>}
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
        {(node.children.length > 0 || addingHere) && (
          <ul className="head-node-children">
            {node.children.map((child) => (
              <HeadTreeNode key={child.head_id} node={child} mergeMode={mergeMode}
                selected={selected} onSelect={onSelect} onDrop={onDrop} onEdit={onEdit}
                onToggleTransactionable={onToggleTransactionable} assigned={assigned} onContext={onContext} newChild={newChild} />
            ))}
            {addingHere && newChild && <NewHeadName {...newChild} />}
          </ul>
        )}
      </details>
    </li>
  );
}
