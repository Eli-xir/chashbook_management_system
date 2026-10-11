import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import './ConfirmChangesDialog.css';

export function Dialog({ title, onClose, busy = false, children, className = '', closeOnOutside = false }: {
  title: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string; closeOnOutside?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className={`dialog-panel ${className}`} aria-labelledby={titleId}
      onClick={(event) => {
        if (!closeOnOutside || busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="flex-col gap-md">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
