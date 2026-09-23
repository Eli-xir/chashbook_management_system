import { useState } from 'react';
import './PendingHeadBlob.css';

export function PendingHeadBlob({ name, onRename, onSelect }: {
  name: string; onRename: (name: string) => void; onSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  function commit() {
    onRename(draft.trim() || name);
    setEditing(false);
  }
  return (
    <div className="pending-head-blob" draggable={!editing}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', 'new');
        event.dataTransfer.effectAllowed = 'move';
      }}>
      {editing ? (
        <input aria-label="New head name" value={draft} autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)} onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') { setDraft(name); setEditing(false); }
          }} />
      ) : (
        <button type="button" onClick={onSelect}
          onDoubleClick={() => { setDraft(name); setEditing(true); }}
          onKeyDown={(event) => {
            if (event.key === 'F2') { event.preventDefault(); setDraft(name); setEditing(true); }
          }}>{name}</button>
      )}
    </div>
  );
}
