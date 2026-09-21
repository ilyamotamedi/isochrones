import { describe, expect, it } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  analyticsAllowed,
  parseConsent,
  readConsent,
  writeConsent,
} from './consent';

function fakeStorage(initial: Record<string, string> = {}, options: { throws?: boolean } = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem(key: string): string | null {
      if (options.throws) throw new Error('storage blocked');
      return data[key] ?? null;
    },
    setItem(key: string, value: string): void {
      if (options.throws) throw new Error('storage blocked');
      data[key] = value;
    },
  };
}

describe('analytics consent', () => {
  it('treats an absent decision as unknown, not as denial', () => {
    expect(readConsent(fakeStorage())).toBe('unknown');
  });

  it('reads back what was written', () => {
    const storage = fakeStorage();
    writeConsent(storage, 'granted');
    expect(storage.data[CONSENT_STORAGE_KEY]).toBe('granted');
    expect(readConsent(storage)).toBe('granted');
  });

  it('remembers a refusal, so the question is not asked twice', () => {
    const storage = fakeStorage();
    writeConsent(storage, 'denied');
    expect(readConsent(storage)).toBe('denied');
    expect(analyticsAllowed(readConsent(storage))).toBe(false);
  });

  it('falls back to unknown for a value it does not recognise', () => {
    expect(readConsent(fakeStorage({ [CONSENT_STORAGE_KEY]: 'yes' }))).toBe('unknown');
    expect(parseConsent('true')).toBe('unknown');
    expect(parseConsent(null)).toBe('unknown');
    expect(parseConsent(undefined)).toBe('unknown');
  });

  /*
   * The opposite of `theme.ts`, deliberately. A theme that cannot be read falls
   * back to something that works; consent that cannot be read is not consent.
   */
  it('fails closed when storage throws', () => {
    const storage = fakeStorage({}, { throws: true });
    expect(readConsent(storage)).toBe('unknown');
    expect(analyticsAllowed(readConsent(storage))).toBe(false);
  });

  it('does not throw when storage refuses a write', () => {
    const storage = fakeStorage({}, { throws: true });
    expect(() => writeConsent(storage, 'granted')).not.toThrow();
  });

  it('allows analytics only on an explicit yes', () => {
    expect(analyticsAllowed('granted')).toBe(true);
    expect(analyticsAllowed('denied')).toBe(false);
    expect(analyticsAllowed('unknown')).toBe(false);
  });
});
