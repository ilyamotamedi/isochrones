import { useEffect, useRef } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { FeatureCollection } from 'geojson';
import {
  addIsochroneLayers,
  clearIsochrone,
  setBandScale,
  setIsochroneData,
  setVisibleBands,
} from './isochroneLayer';
import { featureCollectionBounds } from './bbox';
import { prefersReducedMotion } from './motion';
import type { FitPadding } from '../config';

/**
 * Pushes isochrone data, colour scale and band visibility onto the map.
 *
 * These are three separate effects on purpose. Toggling a band must not re-run
 * the data path, and must never move the camera.
 */
export function useIsochroneRender(
  map: MapboxMap | null,
  ready: boolean,
  data: FeatureCollection | null,
  visible: number[],
  bands: number[],
  /**
   * Called at fit time rather than passed as a value, because the padding
   * depends on the panel's measured size and that is only correct once the
   * panel has laid out with the current result.
   */
  getPadding: () => FitPadding,
): void {
  // Identifies a distinct result, so the camera only moves for genuinely new
  // geometry rather than on every render.
  const fittedRef = useRef<FeatureCollection | null>(null);

  // Held in a ref so a caller redefining the callback cannot retrigger the
  // data effect and re-fit the camera.
  const paddingRef = useRef(getPadding);
  paddingRef.current = getPadding;

  // The ramp domain is the requested band set, so it must be reapplied when the
  // profile changes the minute values — not just when new geometry arrives.
  const bandKey = bands.join(',');

  useEffect(() => {
    if (!map || !ready) return;

    addIsochroneLayers(map);
    setBandScale(map, bands);
    // bandKey stands in for bands, which is a fresh array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, bandKey]);

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

    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        // Asymmetric padding keeps the result clear of the floating panel
        // rather than centring it behind the controls.
        padding: paddingRef.current(),
        /*
         * A camera sweep across most of the viewport is precisely the kind of
         * motion this preference exists to suppress, so honour it by cutting
         * straight to the result. The CSS media query cannot reach this.
         */
        duration: prefersReducedMotion() ? 0 : 700,
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
