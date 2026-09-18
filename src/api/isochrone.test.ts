import { describe, expect, it } from 'vitest';
import {
  IsochroneError,
  buildIsochroneUrl,
  normaliseMinutes,
  parseIsochroneResponse,
} from './isochrone';
import type { IsochroneQuery } from '../types';

const TOKEN = 'pk.test_token';

const query: IsochroneQuery = {
  origin: { lon: -73.9857, lat: 40.7484, label: 'Midtown Manhattan' },
  profile: 'driving',
  minutes: [10, 20, 40, 60],
};

describe('normaliseMinutes', () => {
  it('sorts ascending, because the API rejects unordered contours', () => {
    expect(normaliseMinutes([60, 10, 40, 20])).toEqual([10, 20, 40, 60]);
  });

  it('caps at four entries, the API per-request maximum', () => {
    expect(normaliseMinutes([5, 10, 15, 20, 25, 30])).toEqual([5, 10, 15, 20]);
  });

  it('drops values outside 1..60', () => {
    expect(normaliseMinutes([0, 5, 61, -3, 60])).toEqual([5, 60]);
  });

  it('de-duplicates', () => {
    expect(normaliseMinutes([10, 10, 20])).toEqual([10, 20]);
  });

  it('discards non-finite values rather than emitting NaN into the URL', () => {
    expect(normaliseMinutes([Number.NaN, Infinity, 15])).toEqual([15]);
  });
});

describe('buildIsochroneUrl', () => {
  it('builds the documented endpoint shape', () => {
    const url = new URL(buildIsochroneUrl(query, TOKEN));
    expect(url.origin + url.pathname).toBe(
      'https://api.mapbox.com/isochrone/v1/mapbox/driving/-73.9857,40.7484',
    );
    expect(url.searchParams.get('contours_minutes')).toBe('10,20,40,60');
    expect(url.searchParams.get('polygons')).toBe('true');
    expect(url.searchParams.get('access_token')).toBe(TOKEN);
  });

  it('maps UI modes onto mapbox routing profiles', () => {
    const walking = buildIsochroneUrl({ ...query, profile: 'walking' }, TOKEN);
    expect(walking).toContain('/mapbox/walking/');
  });

  it('rounds coordinates to 6dp so float noise does not bust the CDN cache', () => {
    const noisy = { ...query, origin: { ...query.origin, lon: -73.98570000001 } };
    expect(buildIsochroneUrl(noisy, TOKEN)).toContain('/-73.9857,40.7484?');
  });

  it('rejects out-of-range coordinates before spending a request', () => {
    const bad = { ...query, origin: { ...query.origin, lat: 120 } };
    expect(() => buildIsochroneUrl(bad, TOKEN)).toThrow(IsochroneError);
  });

  it('rejects an empty contour set', () => {
    expect(() => buildIsochroneUrl({ ...query, minutes: [] }, TOKEN)).toThrow(IsochroneError);
  });
});

describe('parseIsochroneResponse', () => {
  it('returns a FeatureCollection on success', () => {
    const body = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { contour: 60 }, geometry: { type: 'Polygon', coordinates: [[]] } },
        { type: 'Feature', properties: { contour: 10 }, geometry: { type: 'Polygon', coordinates: [[]] } },
      ],
    };
    const result = parseIsochroneResponse(200, body);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(2);
  });

  /*
   * The regression that matters most. Captured verbatim from the live API for a
   * mid-Atlantic coordinate: HTTP 200, no `features` key at all. Anything that
   * only checks `response.ok` treats this as success and renders a blank map.
   */
  it('treats HTTP 200 with code NoSegment as an error', () => {
    const body = {
      message: 'Could not find a matching segment for input coordinates',
      code: 'NoSegment',
    };
    expect(() => parseIsochroneResponse(200, body)).toThrow(/roads near that location/i);
  });

  it('treats HTTP 200 with code NoRoute as an error', () => {
    const body = { message: 'No route found', code: 'NoRoute' };
    expect(() => parseIsochroneResponse(200, body)).toThrow(/nowhere reachable/i);
  });

  it('falls back to message matching when no code is present', () => {
    const body = { message: 'Could not find a matching segment for input coordinates' };
    expect(() => parseIsochroneResponse(200, body)).toThrow(/roads near that location/i);
  });

  it('treats an empty features array as an error too', () => {
    expect(() => parseIsochroneResponse(200, { features: [] })).toThrow(IsochroneError);
  });

  it('marks 429 retryable and 401 not retryable', () => {
    try {
      parseIsochroneResponse(429, { message: 'Too many requests' });
      expect.unreachable();
    } catch (e) {
      expect((e as IsochroneError).retryable).toBe(true);
    }

    try {
      parseIsochroneResponse(401, { message: 'Not Authorized - Invalid Token' });
      expect.unreachable();
    } catch (e) {
      expect((e as IsochroneError).retryable).toBe(false);
    }
  });

  it('handles a 5xx with a non-JSON body', () => {
    // Server errors can return an HTML error page, so body is null after a
    // failed JSON parse.
    try {
      parseIsochroneResponse(503, null);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IsochroneError);
      expect((e as IsochroneError).retryable).toBe(true);
    }
  });

  it('surfaces the API message on 422', () => {
    const body = { message: 'contours_minutes must be an integer between 1 and 60' };
    expect(() => parseIsochroneResponse(422, body)).toThrow(/between 1 and 60/);
  });
});
