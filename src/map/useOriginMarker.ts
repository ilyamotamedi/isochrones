import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
// `Offset` itself is not exported; deriving it keeps this correct regardless.
import type { PopupOptions } from 'mapbox-gl';
import type { Origin } from '../types';

/*
 * Where the label sits relative to the pin, per side mapbox might choose.
 *
 * These are mapbox's own numbers for its default marker, lifted from what
 * `Marker.setPopup` would apply. We do not call `setPopup`, because it also
 * gives the marker `role="button"` and a click-to-toggle handler — turning a
 * passive pin into a control that hides the label when pressed, and putting an
 * interactive element in the middle of a map whose clicks set the origin.
 *
 * A single scalar offset will not do: the anchor flips to keep the label on
 * screen, and an offset that clears a 41px pin below it would shove the label
 * 41px away from it above.
 */
const MARKER_HEIGHT = 41 - 5.8 / 2;
const MARKER_RADIUS = 13.5;
const DIAGONAL = Math.sqrt(MARKER_RADIUS ** 2 / 2);

const LABEL_OFFSET: NonNullable<PopupOptions['offset']> = {
  top: [0, 0],
  'top-left': [0, 0],
  'top-right': [0, 0],
  bottom: [0, -MARKER_HEIGHT],
  'bottom-left': [DIAGONAL, (MARKER_HEIGHT - MARKER_RADIUS + DIAGONAL) * -1],
  'bottom-right': [-DIAGONAL, (MARKER_HEIGHT - MARKER_RADIUS + DIAGONAL) * -1],
  left: [MARKER_RADIUS, (MARKER_HEIGHT - MARKER_RADIUS) * -1],
  right: [-MARKER_RADIUS, (MARKER_HEIGHT - MARKER_RADIUS) * -1],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** What the × says it does, to a screen reader and in no tooltip. */
const CLEAR_LABEL = 'Clear starting point';

interface LabelParts {
  root: HTMLElement;
  /** The only node the origin's name is ever written to. */
  text: HTMLElement;
}

/**
 * Builds the label's contents: a name, and a button to take it away.
 *
 * Assembled with DOM calls rather than a markup string on purpose. The name
 * can arrive from `?q=` in a share link, so it is attacker-controlled, and it
 * is written with `textContent` — which creates a text node and never parses.
 * There is no `innerHTML` anywhere in this file, and there must not be: the
 * moment the label is built by concatenating a string, a crafted link becomes
 * script execution.
 */
function buildLabel(onClear: () => void): LabelParts {
  const root = document.createElement('div');
  root.className = 'origin-label';

  const text = document.createElement('span');
  text.className = 'origin-label__text';
  root.appendChild(text);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'origin-label__clear';
  button.setAttribute('aria-label', CLEAR_LABEL);

  /*
   * A drawn cross rather than the × character. At 12px a glyph is at the mercy
   * of whichever font answers for it — weight, width and vertical centring all
   * vary — whereas two strokes are the same everywhere.
   */
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M4.5 4.5l7 7M11.5 4.5l-7 7');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');

  svg.appendChild(path);
  button.appendChild(svg);
  root.appendChild(button);

  /*
   * `stopPropagation` here is insurance, not a fix, and it is worth being
   * precise about which.
   *
   * The obvious worry is that pressing × clears the origin and then sets a new
   * one where the button was, because the click carries on into the map. It
   * does not: `Popup.addTo` appends to `map.getContainer()`, whereas mapbox
   * binds its interaction handlers to the *canvas* container inside it — so
   * the button is not a descendant of the thing listening. Measured, with the
   * guard removed: zero `click` events reach the map.
   *
   * It stays because that is mapbox's internal choice of mount point rather
   * than a promise, the regression it would cause is silent — a pin landing a
   * few pixels from where it already was looks almost right — and the guard is
   * one line. Harness check 34 asserts the outcome directly, so if this ever
   * does start mattering, the check is what will say so.
   *
   * `stopPropagation` only, never `preventDefault`: cancelling the event would
   * stop the button taking focus.
   */
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClear();
  });

  /*
   * Escape as well as Enter and Space, which buttons handle themselves.
   * Scoped to the button rather than the document: a global Escape that wiped
   * the map would be a trap for anyone who presses it to dismiss the search
   * suggestions.
   */
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClear();
  });

  return { root, text };
}

/**
 * Keeps a marker and its label in sync with the current origin.
 *
 * One instance of each is created and then moved, rather than being destroyed
 * and recreated on every change. Recreating them causes a visible flicker and
 * discards the DOM node on each keystroke-driven update.
 *
 * The label lives here rather than in its own hook because it has to track the
 * identical coordinate and mount and unmount on the identical null-origin
 * branch. Two hooks would mean two copies of that logic, free to drift apart.
 */
export function useOriginMarker(
  map: mapboxgl.Map | null,
  origin: Origin | null,
  onClear: () => void,
): void {
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const labelRef = useRef<LabelParts | null>(null);

  /*
   * Held in a ref so the handler can change without this effect re-running.
   * Rebuilding the popup on a new callback identity would destroy the button
   * mid-interaction, including while it has focus.
   */
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  useEffect(() => {
    if (!map) return;

    if (!origin) {
      markerRef.current?.remove();
      markerRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      labelRef.current = null;
      return;
    }

    const lngLat: [number, number] = [origin.lon, origin.lat];

    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#1a73e8' })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    if (!popupRef.current) {
      /*
       * Four of Popup's defaults are wrong for this label:
       *
       * - `closeButton` is mapbox's own ×, and it is the wrong ×: it removes
       *   the popup and nothing else, leaving the pin and the isochrones
       *   behind with no way to say what they refer to. Ours clears the origin
       *   itself, and everything else follows from that.
       * - `closeOnClick` is the dangerous one. A map click sets a *new*
       *   origin, so the default would close the label on the very gesture
       *   that should move it, and nothing would ever reopen it.
       * - `focusAfterOpen` defaults to true and would pull focus out of the
       *   search field every time a reverse geocode resolves — which happens
       *   a beat after every map click, while the user may be typing.
       * - `anchor` is deliberately left unset so mapbox picks a side based on
       *   the room available, flipping the label below the pin rather than
       *   letting it run off the top of the map.
       */
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
        className: 'origin-popup',
        maxWidth: '240px',
        offset: LABEL_OFFSET,
      });

      /*
       * Built once and then reused. Rebuilding it per origin would replace the
       * button on every reverse geocode — silently dropping focus a beat after
       * each map click, and restarting its transition mid-hover.
       */
      labelRef.current = buildLabel(() => onClearRef.current());
      popupRef.current.setDOMContent(labelRef.current.root);
    }

    /*
     * textContent, never innerHTML — see `buildLabel`. Writing into the span
     * rather than replacing the label's contents is also what keeps the button
     * alive across updates.
     */
    if (labelRef.current) labelRef.current.text.textContent = origin.label;

    popupRef.current.setLngLat(lngLat).addTo(map);
  }, [map, origin]);

  // Detach when the map itself goes away, so StrictMode's remount does not
  // leave an orphaned marker bound to a destroyed map.
  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      labelRef.current = null;
    };
  }, [map]);
}
