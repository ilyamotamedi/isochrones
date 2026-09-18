import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Origin } from '../types';

/**
 * Keeps a single marker in sync with the current origin.
 *
 * One marker instance is created and then moved, rather than being destroyed
 * and recreated on every change. Recreating it causes a visible flicker and
 * discards the DOM node on each keystroke-driven update.
 */
export function useOriginMarker(map: mapboxgl.Map | null, origin: Origin | null): void {
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!origin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#1a73e8' })
        .setLngLat([origin.lon, origin.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([origin.lon, origin.lat]);
    }
  }, [map, origin]);

  // Detach when the map itself goes away, so StrictMode's remount does not
  // leave an orphaned marker bound to a destroyed map.
  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map]);
}
