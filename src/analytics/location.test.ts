/**
 * The sanitiser is one short function, and it is the only thing standing
 * between a shared link and somebody's address in Google Analytics. So it gets
 * tested against real `encodeShareState` output rather than hand-written URLs
 * that might not resemble what the app actually produces.
 */

import { describe, expect, it } from 'vitest';
import { sanitiseLocation } from './location';
import { isForbiddenParamKey } from './events';
import { encodeShareState } from '../state/urlState';

const ORIGIN = 'https://isochrones-4f3fa.web.app';

describe('sanitiseLocation', () => {
  it('keeps the origin and path', () => {
    expect(sanitiseLocation(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
    expect(sanitiseLocation(`${ORIGIN}/some/path`)).toBe(`${ORIGIN}/some/path`);
  });

  it('removes the query string', () => {
    expect(sanitiseLocation(`${ORIGIN}/?lat=40.7&lng=-73.9`)).toBe(`${ORIGIN}/`);
  });

  it('removes the fragment', () => {
    expect(sanitiseLocation(`${ORIGIN}/#lat=40.7`)).toBe(`${ORIGIN}/`);
  });

  it('removes both at once', () => {
    expect(sanitiseLocation(`${ORIGIN}/?lat=40.7#q=home`)).toBe(`${ORIGIN}/`);
  });

  it('is idempotent', () => {
    const once = sanitiseLocation(`${ORIGIN}/?lat=40.7`);
    expect(sanitiseLocation(once)).toBe(once);
  });

  it('leaks nothing when handed something unparseable', () => {
    // Not reachable from location.href, but the fallback must still truncate.
    expect(sanitiseLocation('not a url?lat=40.7&q=1 Main St')).toBe('not a url');
  });

  /*
   * The test that matters.
   *
   * Built from the real encoder rather than a fixture, so it keeps testing the
   * right thing if the URL format changes — a new parameter carrying something
   * personal would be caught here without anyone remembering to update this
   * file.
   *
   * The assertion reuses `isForbiddenParamKey`, the same guard the event
   * dispatcher uses, so the two cannot drift apart.
   */
  it('strips everything a real share link carries', () => {
    const qs = encodeShareState({
      origin: { lon: -73.89641, lat: 40.74412, label: '68-01 Queens Boulevard, Woodside, New York 11377' },
      profile: 'walking',
      minutes: [5, 10, 15, 20],
      visible: [5, 10, 15, 20],
    });

    const href = `${ORIGIN}/?${qs}`;

    // Sanity: the input really does contain what we think it does.
    expect(qs).toContain('lat=40.74412');
    expect(qs).toContain('lng=-73.89641');
    expect(qs.toLowerCase()).toContain('queens');

    const clean = sanitiseLocation(href);
    expect(clean).toBe(`${ORIGIN}/`);

    // Nothing resembling a location survives, by the dispatcher's own standard.
    const lower = clean.toLowerCase();
    expect(lower).not.toContain('40.74');
    expect(lower).not.toContain('73.89');
    expect(lower).not.toContain('queens');
    expect(lower).not.toContain('woodside');

    for (const key of ['lat', 'lng', 'q', 'address']) {
      expect(isForbiddenParamKey(key) && lower.includes(`${key}=`)).toBe(false);
    }
  });
});
