/**
 * Validation for user-edited travel times.
 *
 * Kept separate from the component because the rules are the interesting part
 * and they are worth testing without a DOM.
 *
 * Values are held as strings, not numbers. A numeric controlled input fights
 * the user: clearing the field to retype it produces NaN, and any coercion back
 * to a number makes the caret jump. Strings let the field be briefly empty or
 * mid-edit, and we only interpret them when the user submits.
 */

/** The Isochrone API accepts at most 4 contours in one request. */
export const MAX_BANDS = 4;
export const MIN_MINUTES = 1;
/** The API's documented ceiling. */
export const MAX_MINUTES = 60;

export type BandParseResult =
  | {
      ok: true;
      /** Ascending, de-duplicated minutes. */
      values: number[];
      /**
       * `order[newIndex] = oldIndex`. Callers that track per-row state by
       * position need this to follow rows through the sort.
       */
      order: number[];
    }
  | {
      ok: false;
      error: string;
      /**
       * Which row is at fault, when the problem is attributable to one.
       * Lets the UI mark the offending field instead of leaving the user to
       * work out which of four numbers the message is about.
       */
      index?: number;
    };

/**
 * Interprets the raw input strings.
 *
 * Sorts ascending rather than rejecting out-of-order entries. The API requires
 * ascending contours, but refusing to accept `30, 10` would mean scolding the
 * user for typing the same set in a different order. Sorting is applied at
 * submit, which is a single predictable moment rather than a field that
 * rearranges itself as you type.
 */
export function parseBandInputs(inputs: readonly string[]): BandParseResult {
  if (inputs.length === 0) {
    return { ok: false, error: 'Add at least one travel time.' };
  }

  if (inputs.length > MAX_BANDS) {
    return { ok: false, error: `Mapbox returns at most ${MAX_BANDS} travel times at once.` };
  }

  const indexed: Array<{ value: number; index: number }> = [];

  for (const [index, raw] of inputs.entries()) {
    const trimmed = raw.trim();

    if (trimmed === '') {
      return { ok: false, error: 'Fill in every travel time.', index };
    }

    const value = Number(trimmed);

    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return { ok: false, error: 'Travel times must be whole minutes.', index };
    }

    if (value < MIN_MINUTES || value > MAX_MINUTES) {
      return {
        ok: false,
        error: `Travel times must be between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`,
        index,
      };
    }

    indexed.push({ value, index });
  }

  const seen = new Map<number, number>();
  for (const entry of indexed) {
    const first = seen.get(entry.value);
    if (first !== undefined) {
      // Blame the later of the pair: it is the one the user just typed.
      return { ok: false, error: 'Each travel time must be different.', index: entry.index };
    }
    seen.set(entry.value, entry.index);
  }

  indexed.sort((a, b) => a.value - b.value);

  return {
    ok: true,
    values: indexed.map((entry) => entry.value),
    order: indexed.map((entry) => entry.index),
  };
}

/**
 * Follows a set of row indices through a reorder.
 *
 * Band visibility is tracked by position, so when submitting reorders the rows
 * the hidden set has to move with them or the wrong bands disappear.
 */
export function remapIndices(hidden: ReadonlySet<number>, order: readonly number[]): Set<number> {
  const next = new Set<number>();

  for (const [newIndex, oldIndex] of order.entries()) {
    if (hidden.has(oldIndex)) next.add(newIndex);
  }

  return next;
}

/**
 * Suggests a value for a newly added row: one step beyond the current largest,
 * using the existing spacing so the new band looks like it belongs to the set.
 */
export function suggestNextBand(values: readonly number[]): number {
  const last = values[values.length - 1];
  if (last === undefined) return 10;

  const previous = values[values.length - 2];
  const step = previous === undefined ? last : last - previous;

  return Math.min(MAX_MINUTES, last + Math.max(1, step));
}
