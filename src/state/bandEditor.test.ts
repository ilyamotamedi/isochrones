import { describe, expect, it } from 'vitest';
import { enabledValidCount, padToBandCount, parseBands, visibleMinutes } from './bandEditor';

const ALL_ON = [true, true, true, true];

describe('parseBands', () => {
  it('accepts a normal ascending set', () => {
    const state = parseBands(['10', '20', '40', '60']);
    expect(state.requestMinutes).toEqual([10, 20, 40, 60]);
    expect(state.rows.every((row) => row.error === null)).toBe(true);
  });

  it('keeps rows in typed order but sorts the request', () => {
    const state = parseBands(['30', '10', '20', '40']);
    // Rows never reorder — position is how visibility is tracked.
    expect(state.rows.map((row) => row.raw)).toEqual(['30', '10', '20', '40']);
    // The API requires ascending contours, so the request is sorted.
    expect(state.requestMinutes).toEqual([10, 20, 30, 40]);
  });

  it('colours a row by its value rank, not its position', () => {
    const state = parseBands(['30', '10', '20', '40']);
    // '10' is nearest, so it sits at the deep end of the ramp.
    expect(state.rampPosition[1]).toBe(0);
    // '40' is furthest.
    expect(state.rampPosition[3]).toBe(1);
    // '30' is third of four.
    expect(state.rampPosition[0]).toBeCloseTo(2 / 3);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseBands([' 5 ', '10']).requestMinutes).toEqual([5, 10]);
  });
});

describe('parseBands — per-row errors', () => {
  it('flags only the offending row', () => {
    const state = parseBands(['10', '999', '40', '60']);
    expect(state.rows[1]?.error).toBe('1–60 minutes');
    expect(state.rows[0]?.error).toBeNull();
    expect(state.rows[2]?.error).toBeNull();
  });

  it('still requests the rows that are fine', () => {
    // This is the whole point of per-row validation: one bad box must not
    // take the other three down with it.
    const state = parseBands(['10', 'nonsense', '40', '60']);
    expect(state.requestMinutes).toEqual([10, 40, 60]);
  });

  it('rejects a blank field', () => {
    expect(parseBands(['10', '   ']).rows[1]?.error).toBe('Enter a time');
  });

  it('rejects fractional minutes', () => {
    expect(parseBands(['12.5']).rows[0]?.error).toBe('Whole minutes only');
  });

  it('rejects zero, negatives and anything over 60', () => {
    expect(parseBands(['0']).rows[0]?.minutes).toBeNull();
    expect(parseBands(['-5']).rows[0]?.minutes).toBeNull();
    expect(parseBands(['61']).rows[0]?.minutes).toBeNull();
    expect(parseBands(['60']).rows[0]?.minutes).toBe(60);
  });

  it('blames the later of a duplicate pair, not the first', () => {
    const state = parseBands(['10', '20', '10', '40']);
    expect(state.rows[0]?.error).toBeNull();
    expect(state.rows[2]?.error).toBe('Already used');
    // The duplicate is dropped rather than sent twice.
    expect(state.requestMinutes).toEqual([10, 20, 40]);
  });

  it('treats equivalent spellings as the same value', () => {
    expect(parseBands(['10', '010']).rows[1]?.error).toBe('Already used');
  });

  it('survives every row being unusable', () => {
    const state = parseBands(['', '', '', '']);
    expect(state.requestMinutes).toEqual([]);
    expect(state.rampPosition).toHaveLength(4);
  });
});

describe('visibleMinutes', () => {
  it('returns the rows that are both valid and switched on', () => {
    const state = parseBands(['10', '20', '40', '60']);
    expect(visibleMinutes(state, [true, false, true, false])).toEqual([10, 40]);
  });

  it('never returns a row that is switched on but invalid', () => {
    // Filtering the map on a value that was never fetched would hide a band
    // that is actually drawn.
    const state = parseBands(['10', 'oops', '40', '60']);
    expect(visibleMinutes(state, ALL_ON)).toEqual([10, 40, 60]);
  });

  it('returns ascending values regardless of row order', () => {
    const state = parseBands(['60', '10', '40', '20']);
    expect(visibleMinutes(state, ALL_ON)).toEqual([10, 20, 40, 60]);
  });
});

describe('enabledValidCount', () => {
  it('counts only rows that are both usable and on', () => {
    const state = parseBands(['10', 'oops', '40', '60']);
    expect(enabledValidCount(state, [true, true, true, false])).toBe(2);
  });

  it('is zero when everything is off', () => {
    const state = parseBands(['10', '20', '40', '60']);
    expect(enabledValidCount(state, [false, false, false, false])).toBe(0);
  });
});

describe('padToBandCount', () => {
  it('leaves a full set alone', () => {
    expect(padToBandCount([5, 10, 15, 20], [5, 10, 15, 20])).toEqual([5, 10, 15, 20]);
  });

  it('seeds the spare rows from the fallbacks', () => {
    expect(padToBandCount([7], [5, 10, 15, 20])).toEqual([7, 5, 10, 15]);
  });

  it('never seeds a duplicate of a real value', () => {
    const out = padToBandCount([10, 20], [5, 10, 15, 20]);
    expect(new Set(out).size).toBe(out.length);
    expect(out).toEqual([10, 20, 5, 15]);
  });

  it('steps past the largest value when the fallbacks all collide', () => {
    const out = padToBandCount([5, 10], [5, 10]);
    expect(out).toEqual([5, 10, 15, 20]);
  });

  it('truncates anything longer than the row count', () => {
    expect(padToBandCount([1, 2, 3, 4, 5], [])).toEqual([1, 2, 3, 4]);
  });

  it('stays inside the allowed range', () => {
    const out = padToBandCount([58, 59], []);
    expect(out.every((n) => n <= 60)).toBe(true);
  });
});
