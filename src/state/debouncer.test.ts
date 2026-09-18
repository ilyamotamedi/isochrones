import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncer } from './debouncer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDebouncer', () => {
  it('settles only after the delay', () => {
    const settled: string[] = [];
    const d = createDebouncer<string>(500, (v) => settled.push(v));

    d.schedule('a');
    vi.advanceTimersByTime(499);
    expect(settled).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(settled).toEqual(['a']);
  });

  it('collapses a burst into one settle', () => {
    // Typing "456" one character at a time must produce one request, not three.
    const settled: string[] = [];
    const d = createDebouncer<string>(500, (v) => settled.push(v));

    d.schedule('4');
    vi.advanceTimersByTime(200);
    d.schedule('45');
    vi.advanceTimersByTime(200);
    d.schedule('456');
    vi.advanceTimersByTime(500);

    expect(settled).toEqual(['456']);
  });

  it('settles twice if the user pauses long enough between bursts', () => {
    const settled: string[] = [];
    const d = createDebouncer<string>(500, (v) => settled.push(v));

    d.schedule('4');
    vi.advanceTimersByTime(600);
    d.schedule('45');
    vi.advanceTimersByTime(600);

    expect(settled).toEqual(['4', '45']);
  });

  it('flush settles immediately', () => {
    const settled: string[] = [];
    const d = createDebouncer<string>(500, (v) => settled.push(v));

    d.flush('now');
    expect(settled).toEqual(['now']);
  });

  it('flush discards a pending settle rather than letting it land later', () => {
    /*
     * This is the profile-change race. Typing leaves a timer armed carrying
     * the old minutes; switching profile flushes the new ones. If the stale
     * timer survived it would fire afterwards and overwrite them, leaving the
     * query describing a combination nobody chose.
     */
    const settled: string[] = [];
    const d = createDebouncer<string>(500, (v) => settled.push(v));

    d.schedule('stale');
    d.flush('fresh');
    vi.advanceTimersByTime(2000);

    expect(settled).toEqual(['fresh']);
  });

  it('cancel drops a pending settle without firing it', () => {
    const settled: string[] = [];
    const d = createDebouncer<string>(500, (v) => settled.push(v));

    d.schedule('gone');
    d.cancel();
    vi.advanceTimersByTime(2000);

    expect(settled).toEqual([]);
  });

  it('reports whether a settle is armed', () => {
    const d = createDebouncer<string>(500, () => {});

    expect(d.isPending()).toBe(false);
    d.schedule('a');
    expect(d.isPending()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(d.isPending()).toBe(false);
  });
});
