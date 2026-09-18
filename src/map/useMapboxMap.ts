import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { HAS_VALID_TOKEN, INITIAL_VIEW, MAP_STYLE, MAPBOX_TOKEN } from '../config';
import type { ResolvedTheme } from '../types';

export interface MapHandle {
  map: mapboxgl.Map | null;
  /** True once a style has loaded and it is safe to add sources and layers. */
  ready: boolean;
  /**
   * Increments on every `style.load`, including restyles.
   *
   * Consumers that own custom sources or layers must depend on this. See the
   * comment on the restyle effect below for why nothing else will tell them.
   */
  styleEpoch: number;
  /**
   * Whether the style can accept sources and layers *right now*.
   *
   * A ref rather than state, and that is the whole point. A theme change and
   * the `setStyle` it triggers happen in the same commit as every other
   * effect, so any state flag would still read `true` in the effects that run
   * afterwards — they would call `addSource` on a style that has just been
   * torn down, and mapbox-gl throws "Style is not done loading". A ref is read
   * at effect time, so it tells the truth. `styleEpoch` then re-runs those
   * effects once the new style is up.
   */
  styleReady: React.RefObject<boolean>;
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
export function useMapboxMap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  theme: ResolvedTheme,
): MapHandle {
  const instanceRef = useRef<mapboxgl.Map | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [styleEpoch, setStyleEpoch] = useState(0);

  /*
   * The theme at construction time. Held in a ref so that changing it cannot
   * retrigger the setup effect and tear down the whole map — the restyle effect
   * below handles changes.
   */
  const initialThemeRef = useRef(theme);
  const appliedStyleRef = useRef<string | null>(null);
  const styleReadyRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !HAS_VALID_TOKEN) return;
    if (instanceRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const style = MAP_STYLE[initialThemeRef.current];
    appliedStyleRef.current = style;

    const instance = new mapboxgl.Map({
      container: el,
      style,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      // The isochrone is a flat area measure; tilting it adds no information
      // and makes the nested bands harder to compare.
      pitchWithRotate: false,
      dragRotate: false,
    });

    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    /*
     * `style.load` rather than `load`, because it also fires for every
     * subsequent `setStyle`. `load` fires exactly once in a map's lifetime and
     * would leave a restyled map permanently stale.
     */
    const handleStyleLoad = () => {
      styleReadyRef.current = true;
      setReady(true);
      setStyleEpoch((n) => n + 1);
    };
    instance.on('style.load', handleStyleLoad);

    instanceRef.current = instance;
    setMap(instance);

    /*
     * Dev-only handle for automated verification, which needs to assert layer
     * order and filter state directly rather than inferring them from pixels.
     * Stripped from production builds by the constant condition.
     */
    if (import.meta.env.DEV) {
      (window as unknown as { __map?: mapboxgl.Map }).__map = instance;
    }

    return () => {
      instanceRef.current = null;
      appliedStyleRef.current = null;
      styleReadyRef.current = false;
      setMap(null);
      setReady(false);
      instance.off('style.load', handleStyleLoad);
      instance.remove();
    };
  }, [containerRef]);

  /*
   * Swap the basemap when the theme changes.
   *
   * `setStyle` is not a recolour — it replaces the entire style document, and
   * every source and layer added on top of it is destroyed with it. The
   * isochrone source, both layers, their `beforeId` ordering, the colour ramp
   * and the band filter all vanish, and the React effects that created them
   * will *not* re-run, because none of their inputs changed.
   *
   * That is what `styleEpoch` is for: it gives those effects something that
   * does change, so they rebuild on top of the new style.
   *
   * The camera is left alone. `setStyle` preserves it, and the fit guard in
   * `useIsochroneRender` is keyed on the data object, which has not changed —
   * so a theme switch never moves the view.
   */
  useEffect(() => {
    if (!map) return;

    const next = MAP_STYLE[theme];
    if (appliedStyleRef.current === next) return;

    appliedStyleRef.current = next;

    /*
     * Closed for business until the new style loads. Effects that add sources
     * and layers run *after* this one in the same commit, and a theme change
     * is one of their dependencies — so without this they would rebuild onto
     * the style being destroyed on the line below and throw.
     */
    styleReadyRef.current = false;

    /*
     * `diff: false` asks for a full rebuild outright. Left to itself, mapbox-gl
     * tries to diff the two styles, discovers it cannot swap a sprite sheet
     * in place, warns, and rebuilds anyway. Light and dark ship different
     * sprites, so the diff can never succeed here — saying so up front skips
     * the wasted attempt and the console noise.
     *
     * The two font fields are only here because mapbox-gl's `SetStyleOptions`
     * type marks them required. `undefined` is what the library uses when the
     * options object is omitted, so this changes nothing.
     */
    map.setStyle(next, {
      diff: false,
      localFontFamily: undefined,
      localIdeographFontFamily: undefined,
    });
  }, [map, theme]);

  return { map, ready, styleEpoch, styleReady: styleReadyRef };
}
