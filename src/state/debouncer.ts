/**
 * Framework-free debounce timing.
 *
 * Split out from the React hook so the interesting behaviour — restarting on
 * each call, and cancelling cleanly when something jumps the queue — can be
 * tested with fake timers and no DOM.
 */
export interface Debouncer<T> {
  /** Restart the timer with a new pending value. */
  schedule: (next: T) => void;
  /** Settle immediately, discarding anything pending. */
  flush: (next: T) => void;
  /** Drop anything pending without settling. */
  cancel: () => void;
  /** Whether a settle is currently armed. */
  isPending: () => boolean;
}

export function createDebouncer<T>(delayMs: number, onSettle: (value: T) => void): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(next: T) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        onSettle(next);
      }, delayMs);
    },

    /*
     * Cancels before settling. Without that, a timer armed a moment earlier
     * would fire afterwards and overwrite the value that jumped the queue.
     */
    flush(next: T) {
      cancel();
      onSettle(next);
    },

    cancel,
    isPending: () => timer !== null,
  };
}
