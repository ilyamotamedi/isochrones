import { useEffect, useRef } from 'react';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';

/**
 * Calls `handler` with the clicked coordinate.
 *
 * The handler is held in a ref so that changing it does not detach and reattach
 * the map listener on every render.
 */
export function useMapClick(
  map: MapboxMap | null,
  handler: (lon: number, lat: number) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!map) return;

    const onClick = (e: MapMouseEvent) => {
      handlerRef.current(e.lngLat.lng, e.lngLat.lat);
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map]);
}
