import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { featureCollectionBounds } from './bbox';

function polygon(ring: number[][]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  } as FeatureCollection;
}

describe('featureCollectionBounds', () => {
  it('computes bounds for a simple polygon', () => {
    const fc = polygon([
      [-1, -2],
      [3, -2],
      [3, 4],
      [-1, 4],
      [-1, -2],
    ]);
    expect(featureCollectionBounds(fc)).toEqual([-1, -2, 3, 4]);
  });

  it('spans every feature, not just the first', () => {
    const fc = polygon([
      [0, 0],
      [1, 1],
      [0, 0],
    ]);
    fc.features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[-5, -5], [-4, -4], [-5, -5]]] },
    });
    expect(featureCollectionBounds(fc)).toEqual([-5, -5, 1, 1]);
  });

  it('handles MultiPolygon nesting', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[[0, 0], [2, 2], [0, 0]]],
              [[[-3, -1], [1, 5], [-3, -1]]],
            ],
          },
        },
      ],
    };
    expect(featureCollectionBounds(fc)).toEqual([-3, -1, 2, 5]);
  });

  it('returns null for an empty collection so the camera stays put', () => {
    expect(featureCollectionBounds({ type: 'FeatureCollection', features: [] })).toBeNull();
  });

  it('ignores non-finite coordinates rather than poisoning the bounds', () => {
    const fc = polygon([
      [0, 0],
      [Number.NaN, 5],
      [2, 2],
      [0, 0],
    ]);
    expect(featureCollectionBounds(fc)).toEqual([0, 0, 2, 2]);
  });
});
