import { useCallback, useEffect, useMemo, useState } from 'react';
import { createDebouncer } from './debouncer';

export interface DebouncedValue<T> {
  /** Updates immediately. What the inputs render. */
  draft: T;
  /** Updates after the delay. What the query reads. */
  value: T;
  /** Types-as-you-go path: schedules `value` to catch up. */
  setDebounced: (next: T) => void;
  /**
   * Skips the delay, discarding anything pending.
   *
   * Needed for programmatic changes. Switching profile rewrites every minute
   * value, and if that went through the delay there would be a window where
   * the query is the *new* profile with the *old* minutes — a request for a
   * combination nobody asked for.
   */
  setNow: (next: T) => void;
}

/**
 * Splits a value into an immediate draft and a delayed copy.
 *
 * Only the numeric inputs need this. Choosing a profile or a location is a
 * discrete act with no half-typed state, so those go straight through;
 * delaying them would add lag for nothing.
 */
export function useDebouncedValue<T>(initial: T, delayMs: number): DebouncedValue<T> {
  const [draft, setDraft] = useState<T>(initial);
  const [value, setValue] = useState<T>(initial);

  const debouncer = useMemo(() => createDebouncer<T>(delayMs, setValue), [delayMs]);

  // A timer that fires after unmount would set state on a dead component.
  useEffect(() => debouncer.cancel, [debouncer]);

  const setDebounced = useCallback(
    (next: T) => {
      setDraft(next);
      debouncer.schedule(next);
    },
    [debouncer],
  );

  const setNow = useCallback(
    (next: T) => {
      setDraft(next);
      debouncer.flush(next);
    },
    [debouncer],
  );

  return { draft, value, setDebounced, setNow };
}
