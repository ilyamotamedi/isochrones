/**
 * Validation for the four travel-time rows.
 *
 * Kept separate from the component because the rules are the interesting part
 * and they are worth testing without a DOM.
 *
 * Values are held as strings, not numbers. A numeric controlled input fights
 * the user: clearing the field to retype it produces NaN, and any coercion
 * back to a number makes the caret jump.
 */

/** Fixed number of rows. Also the API's maximum contours per request. */
export const BAND_COUNT = 4;
export const MIN_MINUTES = 1;
/** The API's documented ceiling. */
export const MAX_MINUTES = 60;

export interface BandRow {
  raw: string;
  /** Parsed value, or null when the row is unusable. */
  minutes: number | null;
  /** Short message for this row specifically, or null. */
  error: string | null;
}

export interface BandState {
  rows: BandRow[];
  /**
   * What to actually ask the API for: every valid row, de-duplicated and
   * ascending.
   *
   * Deliberately independent of whether a row is switched on. Fetching by
   * validity rather than by visibility is what keeps a switch free — the data
   * is already there — while stopping a typo in a switched-off row from
   * blocking the other three.
   */
  requestMinutes: number[];
  /**
   * Each row's position along the colour ramp, 0 (nearest) to 1 (furthest).
   *
   * Derived from the value's rank, not the row's position, so a row typed out
   * of order still previews the colour it will be drawn in.
   */
  rampPosition: number[];
}

/**
 * Interprets the raw input strings.
 *
 * Every row is judged on its own. One shared error line does not work when
 * four fixed rows can each be wrong in a different way, and a single message
 * cannot say which box to look at.
 */
export function parseBands(inputs: readonly string[]): BandState {
  const rows: BandRow[] = [];
  /** First row index that claimed each value, for duplicate detection. */
  const claimed = new Map<number, number>();

  for (const raw of inputs) {
    const trimmed = raw.trim();

    if (trimmed === '') {
      rows.push({ raw, minutes: null, error: 'Enter a time' });
      continue;
    }

    const value = Number(trimmed);

    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      rows.push({ raw, minutes: null, error: 'Whole minutes only' });
      continue;
    }

    if (value < MIN_MINUTES || value > MAX_MINUTES) {
      rows.push({ raw, minutes: null, error: `${MIN_MINUTES}–${MAX_MINUTES} minutes` });
      continue;
    }

    if (claimed.has(value)) {
      // Blame the later of the pair: it is the one just typed.
      rows.push({ raw, minutes: null, error: 'Already used' });
      continue;
    }

    claimed.set(value, rows.length);
    rows.push({ raw, minutes: value, error: null });
  }

  const requestMinutes = rows
    .map((row) => row.minutes)
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b);

  /*
   * Rank each valid row among the valid ones. Invalid rows have no value to
   * rank, so they fall back to their position — the swatch still needs a
   * colour, and a neutral one is less confusing than a blank.
   */
  const lastRank = Math.max(1, requestMinutes.length - 1);
  const lastRow = Math.max(1, rows.length - 1);

  const rampPosition = rows.map((row, index) => {
    if (row.minutes === null) return index / lastRow;
    return requestMinutes.indexOf(row.minutes) / lastRank;
  });

  return { rows, requestMinutes, rampPosition };
}

/**
 * The values to draw: valid *and* switched on.
 *
 * Separate from `requestMinutes` on purpose. Switching a row off filters data
 * that is already loaded, so it costs nothing and needs no request.
 */
export function visibleMinutes(state: BandState, enabled: readonly boolean[]): number[] {
  return state.rows
    .filter((row, index) => row.minutes !== null && enabled[index] === true)
    .map((row) => row.minutes as number)
    .sort((a, b) => a - b);
}

/** How many rows are both usable and switched on. */
export function enabledValidCount(state: BandState, enabled: readonly boolean[]): number {
  return state.rows.filter((row, index) => row.minutes !== null && enabled[index] === true).length;
}

/**
 * Fills a short set of values out to the four fixed rows.
 *
 * A share link can carry fewer than four contours, but the editor always has
 * four slots. Leaving the spares blank would greet the recipient with two
 * validation errors on a link that is perfectly valid, so they are seeded with
 * plausible values instead — and the caller switches them off, so the map still
 * shows exactly what the sender saw.
 *
 * Seeds are drawn from the profile defaults first, skipping anything already
 * taken (a duplicate would be an error in its own right), then by stepping past
 * the largest value.
 */
export function padToBandCount(minutes: readonly number[], fallbacks: readonly number[]): number[] {
  const out = minutes.slice(0, BAND_COUNT);
  const taken = new Set(out);

  for (const candidate of fallbacks) {
    if (out.length >= BAND_COUNT) break;
    if (taken.has(candidate)) continue;
    taken.add(candidate);
    out.push(candidate);
  }

  // Still short only if the fallbacks collided. Step up from the largest value
  // so the spares stay ordered after the real ones.
  let next = Math.max(MIN_MINUTES, ...out);
  while (out.length < BAND_COUNT) {
    next = Math.min(MAX_MINUTES, next + 5);
    while (taken.has(next) && next < MAX_MINUTES) next += 1;
    if (taken.has(next)) break; // nothing left in range; leave the row short
    taken.add(next);
    out.push(next);
  }

  return out;
}
