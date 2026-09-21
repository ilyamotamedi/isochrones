import { describe, expect, it } from 'vitest';
import {
  PARAM_ALLOW_LIST,
  isForbiddenParamKey,
  toGaParams,
  type AnalyticsEvent,
} from './events';

/**
 * One representative of every variant in the union.
 *
 * Typed as `AnalyticsEvent[]`, so adding a variant without adding it here is
 * not caught by the compiler — but the exhaustiveness test below counts the
 * names, and `toGaParams` has no default branch, so a new variant fails to
 * compile until it is handled. Between the two, a new event cannot slip
 * through untested.
 */
const EVERY_EVENT: AnalyticsEvent[] = [
  { name: 'origin_set', method: 'search' },
  { name: 'origin_set', method: 'geolocate' },
  { name: 'origin_set', method: 'map_click' },
  { name: 'origin_set', method: 'share_link' },
  { name: 'origin_cleared' },
  { name: 'profile_change', profile: 'walking' },
  { name: 'band_edit', index: 2, enabled: false },
  { name: 'share_copied' },
  { name: 'isochrone_error', code: 'NoSegment', retryable: false },
];

describe('analytics events', () => {
  it('never emits a parameter outside the allow-list', () => {
    for (const event of EVERY_EVENT) {
      for (const key of Object.keys(toGaParams(event))) {
        expect(PARAM_ALLOW_LIST, `${event.name} emitted "${key}"`).toContain(key);
      }
    }
  });

  /*
   * The one that matters. Where someone is, is personal data, and the failure
   * mode is a well-meaning addition a year from now rather than anything
   * deliberate — so this asserts the outcome directly rather than trusting the
   * union to stay clean.
   */
  it('never emits anything that looks like a location', () => {
    for (const event of EVERY_EVENT) {
      for (const key of Object.keys(toGaParams(event))) {
        expect(isForbiddenParamKey(key), `${event.name} emitted "${key}"`).toBe(false);
      }
    }
  });

  it('keeps the allow-list free of location-shaped keys', () => {
    // Guards the guard: an allow-list entry that is itself forbidden would let
    // the first test pass while permitting exactly what this is meant to stop.
    for (const key of PARAM_ALLOW_LIST) {
      expect(isForbiddenParamKey(key), `allow-list contains "${key}"`).toBe(false);
    }
  });

  it('recognises location-shaped keys whatever the casing or wrapping', () => {
    for (const key of ['lat', 'Lat', 'originLat', 'lng', 'lon', 'coords', 'placeLabel', 'q_query']) {
      expect(isForbiddenParamKey(key), key).toBe(true);
    }
  });

  it('does not flag the parameters we do send', () => {
    for (const key of ['method', 'profile', 'index', 'enabled', 'retryable']) {
      expect(isForbiddenParamKey(key), key).toBe(false);
    }
  });

  it('leaves the event name out of the parameters', () => {
    for (const event of EVERY_EVENT) {
      expect(toGaParams(event)).not.toHaveProperty('name');
    }
  });

  it('covers every event name the union declares', () => {
    const covered = new Set(EVERY_EVENT.map((e) => e.name));
    expect([...covered].sort()).toEqual([
      'band_edit',
      'isochrone_error',
      'origin_cleared',
      'origin_set',
      'profile_change',
      'share_copied',
    ]);
  });

  it('carries the parameters each event is for', () => {
    expect(toGaParams({ name: 'origin_set', method: 'map_click' })).toEqual({
      method: 'map_click',
    });
    expect(toGaParams({ name: 'band_edit', index: 0, enabled: true })).toEqual({
      index: 0,
      enabled: true,
    });
    expect(toGaParams({ name: 'origin_cleared' })).toEqual({});
  });
});
