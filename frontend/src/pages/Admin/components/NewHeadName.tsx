import { useEffect, useRef } from 'react';

export function NewHeadName({ name, onChange, onCommit, onCancel }: {
  name: string; onChange: (name: string) => void; onCommit: () => void; onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      input.current?.focus(); input.current?.select(); input.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <li className="head-node head-node-row">
    <input ref={input} className="head-new-name" aria-label="New head name" maxLength={48}
      value={name} onChange={(event) => onChange(event.target.value)}
      onBlur={() => { if (!cancelled.current) onCommit(); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; onCancel(); }
      }} />
  </li>;
}
