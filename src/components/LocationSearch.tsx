import { useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { SearchBox } from '@mapbox/search-js-react';
import type { SearchBoxRetrieveResponse } from '@mapbox/search-js-core';
import { MAPBOX_TOKEN } from '../config';
import { formatCoords } from '../api/geocode';
import type { Origin } from '../types';

interface LocationSearchProps {
  map: mapboxgl.Map | null;
  value: string;
  onChange: (value: string) => void;
  onSelect: (origin: Origin) => void;
}

/**
 * Address autocomplete.
 *
 * Session tokens are handled inside the underlying web component, so there is
 * nothing to manage here. That matters for cost: the Search Box API bills per
 * session rather than per keystroke, and rolling our own token would risk
 * billing a session for every character typed.
 */
export function LocationSearch({ map, value, onChange, onSelect }: LocationSearchProps) {
  const handleRetrieve = useCallback(
    (res: SearchBoxRetrieveResponse) => {
      const feature = res.features[0];
      if (!feature) return;

      const coords = feature.geometry.coordinates;
      const lon = coords[0];
      const lat = coords[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') return;

      const props = feature.properties;
      const label =
        props.full_address ??
        props.place_formatted ??
        props.name ??
        formatCoords(lon, lat);

      onSelect({ lon, lat, label });
    },
    [onSelect],
  );

  return (
    <SearchBox
      accessToken={MAPBOX_TOKEN}
      // Passing the map gives proximity-biased results and recentres on
      // selection, so the choice is acknowledged immediately rather than the
      // UI sitting still until the isochrone request returns.
      map={map ?? undefined}
      mapboxgl={mapboxgl}
      // We render our own marker so it survives across queries.
      marker={false}
      value={value}
      onChange={onChange}
      onRetrieve={handleRetrieve}
      placeholder="Choose a starting point"
      options={{ language: 'en', limit: 6 }}
      theme={{
        variables: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          borderRadius: '8px',
          boxShadow: 'none',
          border: '1px solid #e0e0e0',
          colorPrimary: '#1a73e8',
          unit: '14px',
        },
      }}
    />
  );
}
