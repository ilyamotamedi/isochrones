import { describe, expect, it } from 'vitest';
import { parseBandInputs, remapIndices, suggestNextBand } from './bandEditor';

describe('parseBandInputs', () => {
  it('accepts a normal ascending set', () => {
    const result = parseBandInputs(['10', '20', '40', '60']);
    expect(result).toEqual({ ok: true, values: [10, 20, 40, 60], order: [0, 1, 2, 3] });
  });

  it('sorts rather than rejecting out-of-order input', () => {
    const result = parseBandInputs(['30', '10', '20']);
    expect(result).toEqual({ ok: true, values: [10, 20, 30], order: [1, 2, 0] });
  });

  it('tolerates surrounding whitespace', () => {
    const result = parseBandInputs([' 5 ', '10']);
    expect(result.ok && result.values).toEqual([5, 10]);
  });

  it('rejects an empty set', () => {
    expect(parseBandInputs([])).toEqual({
      ok: false,
      error: 'Add at least one travel time.',
    });
  });

  it('rejects more than four entries, the API maximum', () => {
    const result = parseBandInputs(['5', '10', '15', '20', '25']);
    expect(result.ok).toBe(false);
  });

  it('rejects a blank field, naming the row', () => {
    expect(parseBandInputs(['10', '   '])).toEqual({
      ok: false,
      error: 'Fill in every travel time.',
      index: 1,
    });
  });

  it('rejects fractional minutes, naming the row', () => {
    expect(parseBandInputs(['10', '12.5'])).toEqual({
      ok: false,
      error: 'Travel times must be whole minutes.',
      index: 1,
    });
  });

  it('rejects non-numeric input', () => {
    expect(parseBandInputs(['ten']).ok).toBe(false);
  });

  it('rejects zero and negatives', () => {
    expect(parseBandInputs(['0']).ok).toBe(false);
    expect(parseBandInputs(['-5']).ok).toBe(false);
  });

  it('rejects anything over the 60 minute ceiling', () => {
    expect(parseBandInputs(['61']).ok).toBe(false);
    expect(parseBandInputs(['60']).ok).toBe(true);
  });

  it('blames the later of a duplicate pair, not the first', () => {
    expect(parseBandInputs(['10', '20', '10'])).toEqual({
      ok: false,
      error: 'Each travel time must be different.',
      index: 2,
    });
  });

  it('treats equivalent spellings of the same number as duplicates', () => {
    expect(parseBandInputs(['10', '010']).ok).toBe(false);
  });
});

describe('remapIndices', () => {
  it('follows hidden rows through a reorder', () => {
    // Rows were [30, 10, 20]; row 0 (the 30) was hidden. After sorting it
    // lands at index 2, so the hidden set must move with it.
    expect(remapIndices(new Set([0]), [1, 2, 0])).toEqual(new Set([2]));
  });

  it('is a no-op when nothing moved', () => {
    expect(remapIndices(new Set([1, 3]), [0, 1, 2, 3])).toEqual(new Set([1, 3]));
  });

  it('drops indices that no longer exist', () => {
    expect(remapIndices(new Set([3]), [0, 1, 2])).toEqual(new Set());
  });
});

describe('suggestNextBand', () => {
  it('continues the existing spacing', () => {
    expect(suggestNextBand([10, 20, 30])).toBe(40);
    expect(suggestNextBand([5, 10, 15])).toBe(20);
  });

  it('doubles a lone value for want of a better guess', () => {
    expect(suggestNextBand([15])).toBe(30);
  });

  it('clamps to the API ceiling rather than proposing an invalid value', () => {
    expect(suggestNextBand([20, 55])).toBe(60);
  });

  it('never repeats the last value when spacing is zero-ish', () => {
    expect(suggestNextBand([59, 60])).toBe(60);
  });

  it('has a sensible answer for an empty set', () => {
    expect(suggestNextBand([])).toBe(10);
  });
});
