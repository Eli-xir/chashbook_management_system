// src/pages/Admin/hooks/useStagedHeadChanges.ts
import { useCallback, useState } from 'react';
import type { StagedChange } from '../types';

interface UseStagedHeadChangesResult {
  changes: StagedChange[];
  addChange: (change: StagedChange) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasPendingChanges: boolean;
}

// Tracks the pending head-tree edit set (moves + merges) with undo/redo,
// entirely client-side until the admin hits Apply and it's sent as one batch.
export function useStagedHeadChanges(): UseStagedHeadChangesResult {
  const [history, setHistory] = useState<StagedChange[][]>([[]]);
  const [pointer, setPointer] = useState(0);

  const changes = history[pointer];

  const addChange = useCallback(
    (change: StagedChange) => {
      setHistory((prev) => {
        const truncated = prev.slice(0, pointer + 1);
        return [...truncated, [...truncated[truncated.length - 1], change]];
      });
      setPointer((p) => p + 1);
    },
    [pointer]
  );

  const undo = useCallback(() => setPointer((p) => Math.max(0, p - 1)), []);
  const redo = useCallback(() => setPointer((p) => Math.min(history.length - 1, p + 1)), [history.length]);
  const clear = useCallback(() => {
    setHistory([[]]);
    setPointer(0);
  }, []);

  return {
    changes,
    addChange,
    undo,
    redo,
    clear,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
    hasPendingChanges: changes.length > 0,
  };
}