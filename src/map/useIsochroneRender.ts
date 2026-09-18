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
import type { ResolvedTheme } from '../types';

/**
 * Pushes isochrone data, colour scale and band visibility onto the map.
 *
 * These are three separate effects on purpose. Toggling a band must not re-run
 * the data path, and must never move the camera.
 *
 * All three depend on `styleEpoch`. A theme switch calls `map.setStyle`, which
 * destroys the source and both layers while leaving `data`, `visible` and
 * `bands` untouched — so without that dependency the isochrone would simply
 * disappear, with nothing in the console to say why.
 *
 * All three also check `styleReady` before touching anything. The epoch says a
 * rebuild *has happened*; the ref says one is not *in progress*. Both are
 * needed: `theme` is a dependency here too, so these effects fire in the same
 * commit that starts the restyle, at which point the old style is already gone
 * and the new one has not arrived.
 */
export function useIsochroneRender(
  map: MapboxMap | null,
  ready: boolean,
  data: FeatureCollection | null,
  visible: number[],
  bands: number[],
  theme: ResolvedTheme,
  styleEpoch: number,
  styleReady: React.RefObject<boolean>,
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
    if (!map || !ready || !styleReady.current) return;

    addIsochroneLayers(map, theme);
    setBandScale(map, bands, theme);
    // bandKey stands in for bands, which is a fresh array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, bandKey, theme, styleEpoch, styleReady]);

  useEffect(() => {
    if (!map || !ready || !styleReady.current) return;

    addIsochroneLayers(map, theme);

    if (!data) {
      clearIsochrone(map);
      fittedRef.current = null;
      return;
    }

    setIsochroneData(map, data);

    /*
     * The guard that keeps a theme switch from moving the camera. After a
     * restyle this effect re-runs with the same `data`, so it repopulates the
     * source and stops here — before `fitBounds`.
     */
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
  }, [map, ready, data, theme, styleEpoch, styleReady]);

  useEffect(() => {
    if (!map || !ready || !styleReady.current) return;
    if (!map.getLayer('isochrone-fill')) return;
    setVisibleBands(map, visible);
  }, [map, ready, visible, data, styleEpoch, styleReady]);
}
