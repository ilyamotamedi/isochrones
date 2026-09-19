import { describe, expect, it } from 'vitest';
import { CARET_HINT_STORAGE_KEY, readHintSeen, writeHintSeen } from './caretHint';

/** A localStorage stand-in that can be told to fail. */
function fakeStorage(initial: Record<string, string> = {}, throws = false) {
  const data = { ...initial };
  return {
    getItem(key: string): string | null {
      if (throws) throw new Error('storage blocked');
      // `?? null`, not the bare lookup: real localStorage returns null for a
      // missing key, and a fake that returns undefined would let a bug through.
      return data[key] ?? null;
    },
    setItem(key: string, value: string) {
      if (throws) throw new Error('storage blocked');
      data[key] = value;
    },
    read: () => data,
  };
}

describe('readHintSeen', () => {
  it('is false for a visitor who has never been shown it', () => {
    expect(readHintSeen(fakeStorage())).toBe(false);
  });

  it('is true once the flag is stored', () => {
    expect(readHintSeen(fakeStorage({ [CARET_HINT_STORAGE_KEY]: 'true' }))).toBe(true);
  });

  it('treats any other stored value as not seen', () => {
    // Guards against a half-written or hand-edited value quietly suppressing
    // the hint forever.
    expect(readHintSeen(fakeStorage({ [CARET_HINT_STORAGE_KEY]: 'yes' }))).toBe(false);
    expect(readHintSeen(fakeStorage({ [CARET_HINT_STORAGE_KEY]: '' }))).toBe(false);
  });

  it('reports seen when storage throws, so a blocked browser is never nagged', () => {
    // The opposite of how the theme preference fails, and deliberately so: a
    // hint that cannot record having been shown would return on every load.
    expect(readHintSeen(fakeStorage({}, true))).toBe(true);
  });
});

describe('writeHintSeen', () => {
  it('stores the flag under the documented key', () => {
    const storage = fakeStorage();
    writeHintSeen(storage);
    expect(storage.read()).toEqual({ [CARET_HINT_STORAGE_KEY]: 'true' });
  });

  it('round-trips with readHintSeen', () => {
    const storage = fakeStorage();
    expect(readHintSeen(storage)).toBe(false);
    writeHintSeen(storage);
    expect(readHintSeen(storage)).toBe(true);
  });

  it('does not throw when storage is blocked', () => {
    expect(() => writeHintSeen(fakeStorage({}, true))).not.toThrow();
  });
});
