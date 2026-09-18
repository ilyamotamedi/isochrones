import type {
  DataDrivenPropertyValueSpecification,
  FilterSpecification,
  Map as MapboxMap,
} from 'mapbox-gl';
import type { FeatureCollection } from 'geojson';
import { BAND_PALETTE } from '../config';
import type { ResolvedTheme } from '../types';

export const ISO_SOURCE = 'isochrone';
export const ISO_FILL_LAYER = 'isochrone-fill';
export const ISO_LINE_LAYER = 'isochrone-line';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Colour ramp across the active band set: most contrast at the nearest
 * contour, least at the furthest.
 *
 * The domain is rescaled per profile rather than fixed to 0–60, because a
 * walking set peaking at 20 minutes would otherwise occupy only one third of
 * the ramp and lose almost all differentiation.
 */
function colorRamp(
  bands: readonly number[],
  near: string,
  far: string,
): DataDrivenPropertyValueSpecification<string> {
  const min = bands[0];
  const max = bands[bands.length - 1];

  if (min === undefined || max === undefined || min === max) {
    return near;
  }

  return ['interpolate', ['linear'], ['get', 'contour'], min, near, max, far];
}

/**
 * Id of the first label layer, used as `beforeId` so the fills sit underneath
 * place and street labels.
 *
 * With up to four stacked translucent fills the basemap is already heavily
 * tinted; burying the labels as well makes the result unreadable.
 *
 * Re-resolved every time the layers are built, which matters after a theme
 * switch: `setStyle` replaces the entire layer list, so an id captured from
 * the old style would be meaningless.
 */
function firstLabelLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers) return undefined;

  for (const layer of layers) {
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
      return layer.id;
    }
  }
  return undefined;
}

/**
 * Creates the source and layers once per style. Safe to call repeatedly.
 *
 * Updates go through `setIsochroneData` rather than removing and re-adding
 * layers, which would flash and force layer order to be resolved again.
 *
 * The early return is keyed on the source still existing, which is exactly
 * what makes this correct after a theme switch: `setStyle` destroys every
 * custom source and layer, so the guard falls away and everything is rebuilt.
 */
export function addIsochroneLayers(map: MapboxMap, theme: ResolvedTheme): void {
  if (map.getSource(ISO_SOURCE)) return;

  const palette = BAND_PALETTE[theme];

  map.addSource(ISO_SOURCE, { type: 'geojson', data: EMPTY });

  const beforeId = firstLabelLayerId(map);

  map.addLayer(
    {
      id: ISO_FILL_LAYER,
      type: 'fill',
      source: ISO_SOURCE,
      paint: {
        'fill-color': palette.near,
        'fill-opacity': palette.fillOpacity,
      },
      layout: {
        /*
         * Contours are nested, so the largest must paint first and the smallest
         * last. The API happens to return them in descending order today, but
         * that is not contractual — negating `contour` makes the order explicit
         * and stable regardless of source order.
         */
        'fill-sort-key': ['-', ['get', 'contour']],
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: ISO_LINE_LAYER,
      type: 'line',
      source: ISO_SOURCE,
      paint: {
        'line-color': palette.near,
        'line-width': 1.2,
        'line-opacity': palette.lineOpacity,
      },
      layout: {
        'line-sort-key': ['-', ['get', 'contour']],
      },
    },
    beforeId,
  );
}

/** Rescales the colour ramps to the current band values and theme. */
export function setBandScale(
  map: MapboxMap,
  bands: readonly number[],
  theme: ResolvedTheme,
): void {
  if (bands.length === 0) return;

  const palette = BAND_PALETTE[theme];

  if (map.getLayer(ISO_FILL_LAYER)) {
    map.setPaintProperty(ISO_FILL_LAYER, 'fill-color', colorRamp(bands, palette.near, palette.far));
    map.setPaintProperty(ISO_FILL_LAYER, 'fill-opacity', palette.fillOpacity);
  }
  if (map.getLayer(ISO_LINE_LAYER)) {
    map.setPaintProperty(
      ISO_LINE_LAYER,
      'line-color',
      colorRamp(bands, palette.near, palette.lineFar),
    );
    map.setPaintProperty(ISO_LINE_LAYER, 'line-opacity', palette.lineOpacity);
  }
}

/** Network path: replace the rendered geometry. */
export function setIsochroneData(map: MapboxMap, data: FeatureCollection): void {
  const source = map.getSource(ISO_SOURCE);
  if (source && source.type === 'geojson') {
    source.setData(data);
  }
}

/**
 * Display path: show only the given bands.
 *
 * This is a filter over already-loaded data, so toggling is instant and costs
 * no API quota. Only the origin, profile or band values require a refetch.
 */
export function setVisibleBands(map: MapboxMap, visible: readonly number[]): void {
  const filter: FilterSpecification = [
    'in',
    ['get', 'contour'],
    ['literal', [...visible]],
  ];

  if (map.getLayer(ISO_FILL_LAYER)) {
    map.setFilter(ISO_FILL_LAYER, filter);
  }
  if (map.getLayer(ISO_LINE_LAYER)) {
    map.setFilter(ISO_LINE_LAYER, filter);
  }
}

export function clearIsochrone(map: MapboxMap): void {
  setIsochroneData(map, EMPTY);
}
