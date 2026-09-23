import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import './ConfirmChangesDialog.css';

export function Dialog({ title, onClose, busy = false, children, className = '' }: {
  title: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string;
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
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="flex-col gap-md">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
