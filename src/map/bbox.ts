import type { FeatureCollection, Position } from 'geojson';

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

function walk(coords: unknown, acc: Bounds): void {
  if (!Array.isArray(coords)) return;

  // A Position is [lon, lat, ...]. Anything else is a nested array of them.
  const first = coords[0];
  if (typeof first === 'number') {
    const position = coords as Position;
    const lon = position[0];
    const lat = position[1];
    if (typeof lon !== 'number' || typeof lat !== 'number') return;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

    if (lon < acc[0]) acc[0] = lon;
    if (lat < acc[1]) acc[1] = lat;
    if (lon > acc[2]) acc[2] = lon;
    if (lat > acc[3]) acc[3] = lat;
    return;
  }

  for (const child of coords) walk(child, acc);
}

/**
 * Bounding box of every coordinate in a FeatureCollection.
 *
 * Hand-rolled rather than pulling in turf: this is the only geometry maths the
 * app needs, and the recursive walk handles Polygon and MultiPolygon alike
 * without caring which it was given.
 *
 * Returns null for empty or degenerate input so callers can skip the camera
 * move rather than flying to a meaningless box.
 */
export function featureCollectionBounds(fc: FeatureCollection): Bounds | null {
  const acc: Bounds = [Infinity, Infinity, -Infinity, -Infinity];

  for (const feature of fc.features) {
    if (!feature.geometry) continue;
    if (feature.geometry.type === 'GeometryCollection') continue;
    walk(feature.geometry.coordinates, acc);
  }

  const [west, south, east, north] = acc;
  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  if (!Number.isFinite(east) || !Number.isFinite(north)) return null;

  return [west, south, east, north];
}
