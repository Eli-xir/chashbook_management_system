import { useRef, useState } from 'react';
import { cashbookApi } from '../../../data/cashbookApi';
import { Icon } from '../../../Icon';
import { HomeCard } from './HomeCard';

interface Card { id: string; title: string; icon: string; tone: 'blue' | 'gold' | 'green' | 'purple'; }

export function HomeNavigation({ cards, order = [], onOpen }: { cards: readonly Card[]; order?: string[]; onOpen: (id: string) => void }) {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gesture = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  const ids = [...new Set([...(draft ?? saved ?? order), ...cards.map((card) => card.id)])].filter((id) => cards.some((card) => card.id === id));
  function move(source: string, target: string) {
    setDraft((current) => {
      if (!current || source === target) return current;
      const next = current.filter((id) => id !== source);
      next.splice(current.indexOf(target), 0, source);
      return next;
    });
  }
  async function save() {
    setBusy(true); setError('');
    try { const result = await cashbookApi.saveHomeOrder(ids); setSaved(result.homeOrder); setDraft(null); setSelected(null); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="home-reorder-toolbar flex-row flex-wrap gap-sm">
      {draft ? <>
        <button className="btn btn--primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Done'}</button>
        <button className="btn" disabled={busy} onClick={() => { setDraft(null); setSelected(null); setError(''); }}>Cancel</button>
        <span className="text-muted">Drag a card, or tap a card then its new position.</span>
      </> : <button className="btn" onClick={() => { setDraft(ids); setError(''); }}>Rearrange</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    <nav className={`home-cards${draft ? ' home-cards--reordering' : ''}`} aria-label="Cashbook actions">
      {ids.map((id, index) => {
        const card = cards.find((item) => item.id === id)!;
        return <div key={id} data-home-card={id} className={`home-reorder-card${selected === id ? ' home-reorder-card--selected' : ''}`}
          style={{ animationDelay: `${index * -0.07}s` }}
          onPointerDown={(event) => {
            if (!draft || busy || event.button !== 0) return;
            skipClick.current = false;
            gesture.current = { id, x: event.clientX, y: event.clientY, moved: false };
            event.currentTarget.querySelector('button')?.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = gesture.current;
            if (!active) return;
            if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) active.moved = true;
            if (active.moved) setSelected(active.id);
          }}
          onPointerUp={(event) => {
            const active = gesture.current;
            gesture.current = null;
            if (!active?.moved) return;
            skipClick.current = true;
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-home-card]')?.dataset.homeCard;
            if (target) move(active.id, target);
            setSelected(null);
          }}
          onPointerCancel={() => { gesture.current = null; setSelected(null); }}>
          <HomeCard title={card.title} tone={card.tone} disabled={busy} onClick={() => {
            if (skipClick.current) { skipClick.current = false; return; }
            if (!draft) { onOpen(id); return; }
            if (selected) { move(selected, id); setSelected(null); } else setSelected(id);
          }} icon={<Icon size={46} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={card.icon} /></Icon>} />
        </div>;
      })}
    </nav>
  </>;
}
