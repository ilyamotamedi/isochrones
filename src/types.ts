import type { FeatureCollection } from 'geojson';

/** Core domain types. */

/**
 * What the user asked for. `system` follows the OS and is the default — a
 * colour scheme is something an operating system already knows about the
 * person, and asking again is a worse first impression than just matching.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/** What `system` actually resolves to, and what the CSS and map key off. */
export type ResolvedTheme = 'light' | 'dark';

export type Profile = 'walking' | 'cycling' | 'driving';

export const PROFILES: readonly Profile[] = ['walking', 'cycling', 'driving'] as const;

/** Maps our UI modes onto Mapbox Directions routing profile IDs. */
export const MAPBOX_PROFILE: Record<Profile, string> = {
  walking: 'mapbox/walking',
  cycling: 'mapbox/cycling',
  driving: 'mapbox/driving',
};

export const PROFILE_LABEL: Record<Profile, string> = {
  walking: 'Walking',
  cycling: 'Cycling',
  driving: 'Driving',
};

/**
 * Default contour bands per profile.
 *
 * These differ by mode on purpose: a 5-minute driving band is a barely visible
 * speck, and a 60-minute walking band is not a unit most people reason about.
 * A single shared set would make two of the three modes feel broken.
 *
 * Each set holds exactly four values, which is the API's per-request maximum.
 */
export const DEFAULT_BANDS: Record<Profile, number[]> = {
  walking: [5, 10, 15, 20],
  cycling: [10, 20, 30, 40],
  driving: [10, 20, 40, 60],
};

export interface Origin {
  lon: number;
  lat: number;
  /** Human-readable label. Falls back to formatted coordinates. */
  label: string;
}

/**
 * The inputs that require a network request. Deliberately excludes band
 * visibility so the query hook can memoise on this alone and ignore toggling.
 */
export interface IsochroneQuery {
  origin: Origin;
  profile: Profile;
  /** 1..4 entries, ascending, each 1..60. */
  minutes: number[];
}

/** Full app view state: a query plus display-only band visibility. */
export interface ViewState extends IsochroneQuery {
  /** Subset of `minutes`. Changing this never triggers a refetch. */
  visible: number[];
}

export type QueryStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: FeatureCollection }
  | { kind: 'error'; message: string; retryable: boolean };
