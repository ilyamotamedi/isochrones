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
 * A single hue is used for every contour rather than one colour per band.
 * The contours are nested, so translucent fills stack and the area closest to
 * the origin is painted four times over — that accumulation is what produces
 * the gradient, and it reads as one coherent "reachability" field instead of
 * four unrelated colours blending into mud.
 *
 * With four bands at 0.16 the cumulative opacities land at roughly
 * 0.16 / 0.29 / 0.41 / 0.50, which keeps the innermost band well clear of
 * obscuring the basemap beneath it.
 */
export const BAND_COLOR = '#1a73e8';
export const BAND_FILL_OPACITY = 0.16;
export const BAND_LINE_OPACITY = 0.45;

/** Cumulative opacity of the nth band inwards, used to match legend swatches. */
export function cumulativeBandOpacity(depth: number): number {
  return 1 - (1 - BAND_FILL_OPACITY) ** depth;
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
