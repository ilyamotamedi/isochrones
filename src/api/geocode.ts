/**
 * Reverse geocoding, used to put a human-readable name on origins that were set
 * by clicking the map or by the browser's geolocation — neither of which comes
 * with a label attached.
 */

const GEOCODE_REVERSE = 'https://api.mapbox.com/search/geocode/v6/reverse';

/** Fallback label. Latitude first, matching the convention people read aloud. */
export function formatCoords(lon: number, lat: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Best-effort place name for a coordinate.
 *
 * Deliberately never throws. A missing label is a cosmetic problem, and failing
 * the whole interaction because the name lookup failed would be a much worse
 * outcome than showing coordinates. Open ocean legitimately returns zero
 * features, so the fallback is a normal path rather than an error path.
 */
export async function reverseGeocode(
  lon: number,
  lat: number,
  token: string,
  signal?: AbortSignal,
): Promise<string> {
  const fallback = formatCoords(lon, lat);

  try {
    const params = new URLSearchParams({
      longitude: String(lon),
      latitude: String(lat),
      limit: '1',
      access_token: token,
    });

    const response = await fetch(`${GEOCODE_REVERSE}?${params.toString()}`, signal ? { signal } : {});
    if (!response.ok) return fallback;

    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.features)) return fallback;

    const first: unknown = body.features[0];
    if (!isRecord(first) || !isRecord(first.properties)) return fallback;

    const props = first.properties;
    const candidates = [props.full_address, props.place_formatted, props.name];
    const label = candidates.find((c): c is string => typeof c === 'string' && c.length > 0);

    return label ?? fallback;
  } catch {
    // Includes AbortError. The caller only ever wants a string.
    return fallback;
  }
}
