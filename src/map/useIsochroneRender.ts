import { useEffect, useRef } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { FeatureCollection } from 'geojson';
import {
  addIsochroneLayers,
  clearIsochrone,
  setIsochroneData,
  setVisibleBands,
} from './isochroneLayer';
import { featureCollectionBounds } from './bbox';
import { FIT_PADDING_DESKTOP, FIT_PADDING_MOBILE, MOBILE_BREAKPOINT } from '../config';

/**
 * Pushes isochrone data and band visibility onto the map.
 *
 * Data and visibility are separate effects on purpose. Toggling a band must not
 * re-run the data path, and must never move the camera.
 */
export function useIsochroneRender(
  map: MapboxMap | null,
  ready: boolean,
  data: FeatureCollection | null,
  visible: number[],
): void {
  // Identifies a distinct result, so the camera only moves for genuinely new
  // geometry rather than on every render.
  const fittedRef = useRef<FeatureCollection | null>(null);

  useEffect(() => {
    if (!map || !ready) return;

    addIsochroneLayers(map);

    if (!data) {
      clearIsochrone(map);
      fittedRef.current = null;
      return;
    }

    setIsochroneData(map, data);

    if (fittedRef.current === data) return;
    fittedRef.current = data;

    const bounds = featureCollectionBounds(data);
    if (!bounds) return;

    const padding =
      window.innerWidth <= MOBILE_BREAKPOINT ? FIT_PADDING_MOBILE : FIT_PADDING_DESKTOP;

    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        // Asymmetric padding keeps the result clear of the floating panel
        // rather than centring it behind the controls.
        padding,
        duration: 700,
        // Guards against a single tiny contour zooming to street level.
        maxZoom: 15,
      },
    );
  }, [map, ready, data]);

  useEffect(() => {
    if (!map || !ready) return;
    if (!map.getLayer('isochrone-fill')) return;
    setVisibleBands(map, visible);
  }, [map, ready, visible, data]);
}
