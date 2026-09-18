import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { HAS_VALID_TOKEN, INITIAL_VIEW, MAP_STYLE, MAPBOX_TOKEN } from '../config';

export interface MapHandle {
  map: mapboxgl.Map | null;
  /** True once the style has loaded and it is safe to add sources and layers. */
  ready: boolean;
}

/**
 * Owns the mapbox-gl Map lifecycle.
 *
 * React 19 StrictMode invokes effects twice in development. Without a cleanup
 * that calls `map.remove()`, that creates two Map instances: the first leaks a
 * WebGL context and you get a duplicated attribution control plus eventual
 * context-loss warnings. The cleanup below is what makes the double-invoke
 * harmless, and the ref guard keeps a second instance from ever coexisting
 * with the first.
 */
export function useMapboxMap(containerRef: React.RefObject<HTMLDivElement | null>): MapHandle {
  const instanceRef = useRef<mapboxgl.Map | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !HAS_VALID_TOKEN) return;
    if (instanceRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const instance = new mapboxgl.Map({
      container: el,
      style: MAP_STYLE,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      // The isochrone is a flat area measure; tilting it adds no information
      // and makes the nested bands harder to compare.
      pitchWithRotate: false,
      dragRotate: false,
    });

    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    const handleLoad = () => setReady(true);
    instance.on('load', handleLoad);

    instanceRef.current = instance;
    setMap(instance);

    return () => {
      instanceRef.current = null;
      setMap(null);
      setReady(false);
      instance.off('load', handleLoad);
      instance.remove();
    };
  }, [containerRef]);

  return { map, ready };
}
