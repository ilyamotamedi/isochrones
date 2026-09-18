import { DEFAULT_BANDS, PROFILES, type Origin, type Profile } from '../types';
import { normaliseMinutes } from '../api/isochrone';

export interface ShareState {
  origin: Origin;
  profile: Profile;
  minutes: number[];
  visible: number[];
}

/** Longest label we will echo back into the UI from a URL. */
const MAX_LABEL = 120;

function roundCoord(value: number): number {
  // 5dp is ~1m. More digits are float noise and just lengthen the URL.
  return Math.round(value * 1e5) / 1e5;
}

export function encodeShareState(state: ShareState): string {
  const params = new URLSearchParams({
    lng: String(roundCoord(state.origin.lon)),
    lat: String(roundCoord(state.origin.lat)),
    p: state.profile,
    m: state.minutes.join(','),
    v: state.visible.join(','),
  });

  if (state.origin.label) {
    params.set('q', state.origin.label.slice(0, MAX_LABEL));
  }

  return params.toString();
}

function parseNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseMinuteList(raw: string | null): number[] {
  if (!raw) return [];
  return normaliseMinutes(
    raw
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n)),
  );
}

/**
 * Reads app state out of a URL query string.
 *
 * Every value here is attacker-controllable: anyone can hand someone a crafted
 * link. The policy is deliberately split:
 *
 *  - Coordinates are *rejected* if out of range, returning null so the app
 *    opens in its default state. Clamping would silently relocate the pin to
 *    somewhere the link never referred to, which is worse than ignoring it.
 *  - Everything else falls back to a sane default, because those values are
 *    recoverable and discarding a whole link over a bad `p=` would be rude.
 *
 * The label is returned as plain text and must only ever be rendered as text.
 */
export function parseShareState(search: string): ShareState | null {
  const params = new URLSearchParams(search);

  const lon = parseNumber(params.get('lng'));
  const lat = parseNumber(params.get('lat'));

  if (lon === null || lat === null) return null;
  if (lon < -180 || lon > 180) return null;
  // ±85 is the Web Mercator display limit, tighter than the API's ±90. A point
  // outside it cannot be shown on the map at all.
  if (lat < -85 || lat > 85) return null;

  const rawProfile = params.get('p');
  const profile: Profile =
    rawProfile !== null && (PROFILES as readonly string[]).includes(rawProfile)
      ? (rawProfile as Profile)
      : 'walking';

  const parsedMinutes = parseMinuteList(params.get('m'));
  const minutes = parsedMinutes.length > 0 ? parsedMinutes : DEFAULT_BANDS[profile];

  // Visible must be a subset of the requested bands. Without this intersection
  // a hand-edited `v=99` filters out every feature and renders a blank map that
  // is indistinguishable from a bug.
  const parsedVisible = parseMinuteList(params.get('v')).filter((m) => minutes.includes(m));
  const visible = parsedVisible.length > 0 ? parsedVisible : [...minutes];

  const rawLabel = params.get('q');
  const label =
    rawLabel && rawLabel.trim().length > 0
      ? rawLabel.slice(0, MAX_LABEL)
      : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  return {
    origin: { lon, lat, label },
    profile,
    minutes,
    visible,
  };
}
