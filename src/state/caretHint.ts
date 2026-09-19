/**
 * Remembering whether the caret hint has been shown.
 *
 * Deliberately separate from the hook that uses it, so the storage behaviour —
 * including what happens when storage throws — can be tested without a DOM.
 */

export const CARET_HINT_STORAGE_KEY = 'isochrones:caret-hint-seen';

const SEEN = 'true';

/**
 * Has this visitor already been shown the hint?
 *
 * Note the failure direction: if storage throws, this reports `true`, and the
 * hint never appears. That is the opposite of how the theme preference fails,
 * and it is deliberate. A theme that forgets itself is a small annoyance each
 * visit; a hint that cannot record having been shown would reappear on every
 * single load, forever, for exactly the people who can least get rid of it.
 * Silence is the better failure for something whose only job is to be helpful
 * once.
 */
export function readHintSeen(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(CARET_HINT_STORAGE_KEY) === SEEN;
  } catch {
    return true;
  }
}

export function writeHintSeen(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(CARET_HINT_STORAGE_KEY, SEEN);
  } catch {
    // Not being able to remember is not a reason to fail. The hint will show
    // again next visit, which is a far smaller problem than throwing inside a
    // render.
  }
}
