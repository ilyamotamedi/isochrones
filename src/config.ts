/**
 * Runtime configuration and design constants.
 *
 * The Mapbox token is read here once so that every consumer shares the same
 * validation, and so the failure mode for a missing token is a clear in-app
 * message rather than a cryptic 401 from deep inside mapbox-gl.
 */

import type { ResolvedTheme } from './types';

const rawToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export const MAPBOX_TOKEN: string = typeof rawToken === 'string' ? rawToken.trim() : '';

/** A usable token is present and is a public (`pk.`) token. */
export const HAS_VALID_TOKEN: boolean = MAPBOX_TOKEN.startsWith('pk.');

/**
 * Loud warning for the one mistake with real consequences: pasting a secret
 * token into a client bundle publishes it to every visitor.
 */
export const TOKEN_IS_SECRET: boolean = MAPBOX_TOKEN.startsWith('sk.');

/**
 * Basemap per theme.
 *
 * Both are classic styles with an enumerable layer list, which is what makes
 * the `beforeId` label ordering in `isochroneLayer` work. Do not "upgrade"
 * these to the v3 Standard style: it uses slots instead, and the fills would
 * silently start drawing over street names.
 */
export const MAP_STYLE: Record<ResolvedTheme, string> = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

export interface BandPalette {
  /** Colour of the nearest contour. */
  near: string;
  /** Colour of the furthest contour. */
  far: string;
  /**
   * Outlines use their own, deliberately narrower ramp.
   *
   * Reusing the fill ramp drew the outermost contour in the palest colour,
   * which is exactly the boundary a reader looks for first.
   */
  lineFar: string;
  fillOpacity: number;
  lineOpacity: number;
}

/**
 * Band styling.
 *
 * Contours are nested, so fills stack and the innermost area is painted over
 * several times. An earlier version relied on that accumulation alone with a
 * single hue — verified against a real render, it produced almost no visible
 * difference between the four bands.
 *
 * So colour carries the signal, and the relationship **inverts between
 * themes**: on a light basemap the nearest band is the deepest blue, and on a
 * dark one it is the brightest. Both amount to "nearest has the most contrast
 * against the map", which is the property that actually matters; copying the
 * light ramp onto dark would make the near band vanish and the far band glow.
 *
 * The ramp domain is the band set itself, not a fixed 0–60, because walking
 * tops out at 20 minutes and would otherwise sit entirely in one end.
 */
export const BAND_PALETTE: Record<ResolvedTheme, BandPalette> = {
  light: {
    near: '#174ea6',
    far: '#a8c7fa',
    lineFar: '#4285f4',
    fillOpacity: 0.3,
    lineOpacity: 0.8,
  },
  dark: {
    near: '#d2e3fc',
    far: '#3c6bb8',
    lineFar: '#8ab4f8',
    // Slightly heavier: a dark basemap gives translucent fills less to react
    // against, so the same opacity reads as weaker than it does on light.
    fillOpacity: 0.34,
    lineOpacity: 0.85,
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * JS mirror of the map's colour ramp, so legend swatches match what is drawn.
 * `t` is 0 at the nearest band and 1 at the furthest.
 */
export function bandColorAt(t: number, theme: ResolvedTheme): string {
  const palette = BAND_PALETTE[theme];
  const near = hexToRgb(palette.near);
  const far = hexToRgb(palette.far);
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

/** Viewport width below which the panel becomes a top sheet. */
export const MOBILE_BREAKPOINT = 640;

/**
 * How long to wait after the last keystroke before asking for new contours.
 *
 * The map refreshes as you type, so this is the only thing standing between a
 * two-digit entry and two requests. 300ms fires mid-number often enough to be
 * annoying; past about 800ms the map stops feeling connected to the input.
 */
export const INPUT_DEBOUNCE_MS = 500;

/** Breathing room between the panel edge and the fitted result. */
const FIT_GAP = 16;
/** Clear of the zoom controls, scale bar and attribution. */
const FIT_EDGE = 32;

export interface FitPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Padding that keeps a fitted result clear of the floating panel.
 *
 * Measured from the live panel rather than hardcoded. The panel's height
 * depends on whether an error is showing and how long the address is, and on a
 * phone the difference between the guess and the truth was most of the screen.
 *
 * Padding is clamped: mapbox-gl throws if the padding exceeds the canvas, and
 * a collapsed-to-nothing viewport is a worse failure than an imperfect fit.
 */
export function fitPaddingFor(
  panel: DOMRect | null,
  /**
   * The slice of the panel that stays on screen when the mobile sheet is
   * collapsed — its header and the search field.
   *
   * The mobile fit is measured against this rather than the full expanded
   * sheet. An open sheet covers roughly two thirds of a phone, so fitting below
   * it would either squeeze the map into a sliver or, once clamped, fail to
   * clear the sheet anyway. Fitting to the collapsed height instead means the
   * result is framed correctly the moment the sheet is out of the way — and
   * while it is open, the user is looking at the form, not the map.
   */
  sticky: DOMRect | null,
  width: number,
  height: number,
): FitPadding {
  const maxH = Math.max(0, width * 0.4);
  const maxV = Math.max(0, height * 0.4);

  if (!panel) {
    return { top: FIT_EDGE, bottom: FIT_EDGE, left: FIT_EDGE, right: FIT_EDGE };
  }

  // As a top sheet the panel spans the full width, so it can only be avoided
  // vertically; as a floating card it can only be avoided horizontally.
  if (width <= MOBILE_BREAKPOINT) {
    const avoid = sticky ?? panel;
    return {
      top: Math.min(maxV, avoid.bottom + FIT_GAP),
      bottom: FIT_EDGE,
      left: FIT_EDGE,
      right: FIT_EDGE,
    };
  }

  return {
    top: FIT_EDGE,
    bottom: FIT_EDGE,
    left: Math.min(maxH, panel.right + FIT_GAP),
    right: FIT_EDGE,
  };
}

