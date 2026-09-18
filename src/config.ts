/**
 * Runtime configuration and design constants.
 *
 * The Mapbox token is read here once so that every consumer shares the same
 * validation, and so the failure mode for a missing token is a clear in-app
 * message rather than a cryptic 401 from deep inside mapbox-gl.
 */

const rawToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export const MAPBOX_TOKEN: string = typeof rawToken === 'string' ? rawToken.trim() : '';

/** A usable token is present and is a public (`pk.`) token. */
export const HAS_VALID_TOKEN: boolean = MAPBOX_TOKEN.startsWith('pk.');

/**
 * Loud warning for the one mistake with real consequences: pasting a secret
 * token into a client bundle publishes it to every visitor.
 */
export const TOKEN_IS_SECRET: boolean = MAPBOX_TOKEN.startsWith('sk.');

export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

/**
 * Band styling.
 *
 * Contours are nested, so fills stack and the innermost area is painted over
 * several times. An earlier version relied on that accumulation alone with a
 * single hue — verified against a real render, it produced almost no visible
 * difference between the four bands.
 *
 * So colour now carries the signal: a ramp from a deep blue at the nearest
 * band to a pale blue at the furthest. Stacking still deepens the centre, but
 * it is reinforcing the ramp rather than doing all the work.
 *
 * The ramp domain is the band set itself, not a fixed 0–60, because walking
 * tops out at 20 minutes and would otherwise sit entirely in the dark end.
 */
export const BAND_COLOR_NEAR = '#174ea6';
export const BAND_COLOR_FAR = '#a8c7fa';
export const BAND_FILL_OPACITY = 0.3;

/**
 * Outlines use their own, deliberately narrower ramp.
 *
 * Reusing the fill ramp drew the outermost contour in the palest colour, which
 * is exactly the boundary a reader looks for first. Holding the far end at a
 * mid blue keeps every edge crisp while still ordering the bands by tone.
 */
export const BAND_LINE_COLOR_FAR = '#4285f4';
export const BAND_LINE_OPACITY = 0.8;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * JS mirror of the map's colour ramp, so legend swatches match what is drawn.
 * `t` is 0 at the nearest band and 1 at the furthest.
 */
export function bandColorAt(t: number): string {
  const near = hexToRgb(BAND_COLOR_NEAR);
  const far = hexToRgb(BAND_COLOR_FAR);
  const clamped = Math.min(1, Math.max(0, t));
  const mix = near.map((c, i) => Math.round(c + ((far[i] ?? c) - c) * clamped));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/**
 * A muted basemap is not an aesthetic preference here. We stack up to four
 * translucent fills on top of it, so a busy or high-contrast style would make
 * the bands unreadable.
 */
export const INITIAL_VIEW = {
  center: [-73.9857, 40.7484] as [number, number], // Midtown Manhattan
  zoom: 11,
};

/**
 * Padding used when fitting the camera to a result, so the isochrone lands in
 * the visible part of the map rather than behind the floating control panel.
 */
export const FIT_PADDING_DESKTOP = { top: 80, bottom: 48, left: 400, right: 48 };
export const FIT_PADDING_MOBILE = { top: 280, bottom: 48, left: 24, right: 24 };

/** Viewport width below which the panel becomes a top sheet. */
export const MOBILE_BREAKPOINT = 640;
