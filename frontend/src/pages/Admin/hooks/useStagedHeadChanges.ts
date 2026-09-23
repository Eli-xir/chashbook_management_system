import { useState } from 'react';
import type { Head, StagedChange } from '../types';

// Keep the history and cursor together so every edit is one atomic state update.
export function useStagedHeadChanges(initialHeads: Head[]) {
  const [{ heads, history, cursor }, setState] = useState({ heads: initialHeads, history: [[]] as StagedChange[][], cursor: 0 });
  return {
    heads,
    changes: history[cursor],
    canUndo: cursor > 0,
    canRedo: cursor < history.length - 1,
    addChange: (change: StagedChange) => setState(({ heads, history, cursor }) => ({
      heads,
      history: [...history.slice(0, cursor + 1), [...history[cursor], change]],
      cursor: cursor + 1,
    })),
    undo: () => setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) })),
    redo: () => setState((s) => ({ ...s, cursor: Math.min(s.history.length - 1, s.cursor + 1) })),
    clear: (heads: Head[]) => setState({ heads, history: [[]], cursor: 0 }),
  };
}
