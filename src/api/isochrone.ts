import type { FeatureCollection, Feature, Polygon } from 'geojson';
import { MAPBOX_PROFILE, type IsochroneQuery } from '../types';

export const MAX_CONTOURS = 4;
export const MAX_MINUTES = 60;
const ISOCHRONE_BASE = 'https://api.mapbox.com/isochrone/v1';

/** An error already phrased for display to the user. */
export class IsochroneError extends Error {
  /** Whether offering a "try again" action makes sense. */
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IsochroneError';
    this.retryable = retryable;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/**
 * Coerces an arbitrary list of minute values into something the API will accept:
 * whole numbers, within 1..60, de-duplicated, ascending, and capped at four
 * entries. Ascending order and the four-contour ceiling are both hard API
 * requirements, so enforcing them here means a 422 should be unreachable.
 */
export function normaliseMinutes(minutes: readonly number[]): number[] {
  const cleaned = minutes
    .filter((m) => Number.isFinite(m))
    .map((m) => Math.round(m))
    .filter((m) => m >= 1 && m <= MAX_MINUTES);

  return Array.from(new Set(cleaned))
    .sort((a, b) => a - b)
    .slice(0, MAX_CONTOURS);
}

export function buildIsochroneUrl(query: IsochroneQuery, token: string): string {
  const { origin, profile, minutes } = query;

  if (!Number.isFinite(origin.lon) || origin.lon < -180 || origin.lon > 180) {
    throw new IsochroneError('That longitude is outside the valid range.', false);
  }
  // The API's own bound is ±90. The tighter ±85 Mercator limit is applied when
  // parsing share links, where the concern is displayability rather than validity.
  if (!Number.isFinite(origin.lat) || origin.lat < -90 || origin.lat > 90) {
    throw new IsochroneError('That latitude is outside the valid range.', false);
  }

  const contours = normaliseMinutes(minutes);
  if (contours.length === 0) {
    throw new IsochroneError('Pick at least one travel time.', false);
  }

  const mapboxProfile = MAPBOX_PROFILE[profile];
  const coords = `${round(origin.lon, 6)},${round(origin.lat, 6)}`;

  const params = new URLSearchParams({
    contours_minutes: contours.join(','),
    polygons: 'true',
    // 1.0 keeps only the largest contour per band, which avoids scattering
    // disconnected slivers across the map.
    denoise: '1',
    access_token: token,
  });

  return `${ISOCHRONE_BASE}/${mapboxProfile}/${coords}?${params.toString()}`;
}

function messageFor(status: number, body: unknown): IsochroneError {
  const apiMessage = isRecord(body) && typeof body.message === 'string' ? body.message : '';

  switch (status) {
    case 401:
      return new IsochroneError(
        'Map service unavailable — the access token was rejected.',
        false,
      );
    case 403:
      // Also fires when a token's URL restrictions exclude the current origin,
      // which is the confusing case worth naming in the console.
      return new IsochroneError(
        'Map service unavailable — this token is not allowed on this site.',
        false,
      );
    case 404:
      return new IsochroneError('That travel mode is not supported.', false);
    case 422:
      return new IsochroneError(
        apiMessage || 'Those search settings are not valid.',
        false,
      );
    case 429:
      return new IsochroneError('Too many requests. Try again in a moment.', true);
    default:
      if (status >= 500) {
        return new IsochroneError('Mapbox is having trouble. Try again.', true);
      }
      return new IsochroneError(apiMessage || 'Something went wrong.', true);
  }
}

/**
 * Turns a raw response into a FeatureCollection, or throws a display-ready error.
 *
 * The important case is the second block. Two routing failures — an origin with
 * no nearby road, and a location with no reachable network — come back as
 * HTTP 200 with a `message` and no features. Checking `response.ok` alone lets
 * those through, and the app renders an empty map that looks broken rather than
 * telling the user what happened.
 */
export function parseIsochroneResponse(status: number, body: unknown): FeatureCollection {
  if (status !== 200) {
    throw messageFor(status, body);
  }

  if (!isRecord(body)) {
    throw new IsochroneError('Unexpected response from Mapbox.', true);
  }

  const features = Array.isArray(body.features) ? body.features : null;

  if (features === null || features.length === 0) {
    // Verified against the live API: an unroutable origin returns HTTP 200 with
    // the `features` key absent entirely, a human-readable `message`, and a
    // machine-readable `code`. Branch on `code` first — it is stable, whereas
    // the message is prose and could be reworded at any time.
    const code = typeof body.code === 'string' ? body.code : '';
    const apiMessage = typeof body.message === 'string' ? body.message : '';

    if (code === 'NoSegment' || apiMessage.includes('matching segment')) {
      throw new IsochroneError(
        "We couldn't find any roads near that location. Try a point closer to a street.",
        false,
      );
    }
    if (code === 'NoRoute' || apiMessage.toLowerCase().includes('no route')) {
      throw new IsochroneError(
        "There's nowhere reachable from that location by this travel mode.",
        false,
      );
    }
    throw new IsochroneError(
      "We couldn't work out a travel area for that location.",
      false,
    );
  }

  return {
    type: 'FeatureCollection',
    features: features as Feature<Polygon>[],
  };
}

export async function fetchIsochrone(
  query: IsochroneQuery,
  token: string,
  signal?: AbortSignal,
): Promise<FeatureCollection> {
  const url = buildIsochroneUrl(query, token);

  let response: Response;
  try {
    response = await fetch(url, signal ? { signal } : {});
  } catch (error) {
    // Let cancellation propagate untouched; the caller distinguishes it from failure.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new IsochroneError('Network error. Check your connection and try again.', true, {
      cause: error,
    });
  }

  // Server errors can return HTML rather than JSON, so a parse failure here is
  // expected rather than exceptional.
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return parseIsochroneResponse(response.status, body);
}
