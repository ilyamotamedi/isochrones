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
export function useOriginMarker(map: mapboxgl.Map | null, origin: Origin | null): void {
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!origin) {
      markerRef.current?.remove();
      markerRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
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
       * Four of Popup's defaults are wrong for a permanent label:
       *
       * - `closeButton` would offer to dismiss something that is not
       *   dismissible; the way to remove it is to have no origin.
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
        maxWidth: '220px',
        offset: LABEL_OFFSET,
      });
    }

    /*
     * setText, never setHTML.
     *
     * This string can arrive from a share link — `?q=` is attacker-controlled
     * — and setHTML would parse it. setText writes a text node, so a payload
     * shows up as the literal characters someone put in the URL.
     */
    popupRef.current.setText(origin.label).setLngLat(lngLat).addTo(map);
  }, [map, origin]);

  // Detach when the map itself goes away, so StrictMode's remount does not
  // leave an orphaned marker bound to a destroyed map.
  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
    };
  }, [map]);
}
