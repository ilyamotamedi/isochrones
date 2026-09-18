import { describe, expect, it } from 'vitest';
import { encodeShareState, parseShareState, type ShareState } from './urlState';

const state: ShareState = {
  origin: { lon: -73.9857, lat: 40.7484, label: 'Midtown Manhattan' },
  profile: 'driving',
  minutes: [10, 20, 40, 60],
  visible: [20, 60],
};

describe('encode / parse round trip', () => {
  it('survives a round trip intact', () => {
    const parsed = parseShareState(encodeShareState(state));
    expect(parsed).not.toBeNull();
    expect(parsed?.origin.lon).toBeCloseTo(-73.9857, 5);
    expect(parsed?.origin.lat).toBeCloseTo(40.7484, 5);
    expect(parsed?.origin.label).toBe('Midtown Manhattan');
    expect(parsed?.profile).toBe('driving');
    expect(parsed?.minutes).toEqual([10, 20, 40, 60]);
    expect(parsed?.visible).toEqual([20, 60]);
  });

  it('encodes labels containing separators and unicode safely', () => {
    const tricky: ShareState = {
      ...state,
      origin: { ...state.origin, label: 'Café & Bar, 100% "real", 東京' },
    };
    const parsed = parseShareState(encodeShareState(tricky));
    expect(parsed?.origin.label).toBe('Café & Bar, 100% "real", 東京');
  });

  it('records band values explicitly so links stay stable if defaults change', () => {
    expect(encodeShareState(state)).toContain('m=10%2C20%2C40%2C60');
  });
});

describe('parse rejects unusable coordinates', () => {
  it('returns null when coordinates are missing', () => {
    expect(parseShareState('p=driving&m=10')).toBeNull();
  });

  it('returns null for out-of-range longitude', () => {
    expect(parseShareState('lng=999&lat=40')).toBeNull();
  });

  it('returns null beyond the Mercator latitude limit', () => {
    expect(parseShareState('lng=-73&lat=89')).toBeNull();
  });

  it('returns null for non-numeric coordinates', () => {
    expect(parseShareState('lng=abc&lat=40')).toBeNull();
  });
});

describe('parse degrades gracefully on recoverable fields', () => {
  it('falls back to walking for an unknown profile', () => {
    const parsed = parseShareState('lng=-73.9&lat=40.7&p=teleport');
    expect(parsed?.profile).toBe('walking');
  });

  it('falls back to profile defaults when bands are absent', () => {
    const parsed = parseShareState('lng=-73.9&lat=40.7&p=cycling');
    expect(parsed?.minutes).toEqual([10, 20, 30, 40]);
  });

  it('drops out-of-range band values', () => {
    const parsed = parseShareState('lng=-73.9&lat=40.7&m=5,999,20');
    expect(parsed?.minutes).toEqual([5, 20]);
  });

  /*
   * The important one. A hand-edited `v` that shares nothing with `m` would
   * filter out every feature and render an empty map — visually identical to a
   * broken app. Intersecting and then falling back keeps something on screen.
   */
  it('intersects visible with the requested bands', () => {
    const parsed = parseShareState('lng=-73.9&lat=40.7&m=10,20&v=20,99');
    expect(parsed?.visible).toEqual([20]);
  });

  it('falls back to all bands when visible has no overlap', () => {
    const parsed = parseShareState('lng=-73.9&lat=40.7&m=10,20&v=99');
    expect(parsed?.visible).toEqual([10, 20]);
  });

  it('labels with coordinates when q is absent', () => {
    const parsed = parseShareState('lng=-73.9857&lat=40.7484');
    expect(parsed?.origin.label).toBe('40.7484, -73.9857');
  });

  it('truncates an overlong label', () => {
    const parsed = parseShareState(`lng=-73.9&lat=40.7&q=${'a'.repeat(500)}`);
    expect(parsed?.origin.label.length).toBe(120);
  });

  it('keeps a script-like label as inert text', () => {
    // React escapes on render; this asserts we neither execute nor mangle it.
    const payload = '<script>alert(1)</script>';
    const parsed = parseShareState(`lng=-73.9&lat=40.7&q=${encodeURIComponent(payload)}`);
    expect(parsed?.origin.label).toBe(payload);
  });
});
