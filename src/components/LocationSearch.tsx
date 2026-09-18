import { useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { SearchBox } from '@mapbox/search-js-react';
import type { SearchBoxRetrieveResponse } from '@mapbox/search-js-core';
import { MAPBOX_TOKEN } from '../config';
import { formatCoords } from '../api/geocode';
import type { Origin, ResolvedTheme } from '../types';

interface LocationSearchProps {
  map: mapboxgl.Map | null;
  value: string;
  onChange: (value: string) => void;
  onSelect: (origin: Origin) => void;
  theme: ResolvedTheme;
}

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/*
 * The web component renders into a shadow root and styles itself from this
 * object, so it cannot see the stylesheet's custom properties. These values
 * therefore have to duplicate the ones in index.css — keep them in step, or
 * the search field becomes a white slab in a dark panel.
 */
const SEARCH_THEME: Record<ResolvedTheme, Record<string, string>> = {
  light: {
    fontFamily: FONT_STACK,
    borderRadius: '8px',
    boxShadow: 'none',
    border: '1px solid #e0e0e0',
    colorPrimary: '#1a73e8',
    unit: '14px',
  },
  dark: {
    fontFamily: FONT_STACK,
    borderRadius: '8px',
    boxShadow: 'none',
    border: '1px solid #3f4145',
    colorPrimary: '#8ab4f8',
    colorBackground: '#2e3033',
    colorBackgroundHover: '#393b3f',
    colorBackgroundActive: '#393b3f',
    colorText: '#e8eaed',
    colorSecondary: '#9aa0a6',
    unit: '14px',
  },
};

/**
 * Address autocomplete.
 *
 * Session tokens are handled inside the underlying web component, so there is
 * nothing to manage here. That matters for cost: the Search Box API bills per
 * session rather than per keystroke, and rolling our own token would risk
 * billing a session for every character typed.
 */
export function LocationSearch({ map, value, onChange, onSelect, theme }: LocationSearchProps) {
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

  // Memoised so the component is not handed a new theme object on every render,
  // which would have it recompute its shadow styles for no reason.
  const searchTheme = useMemo(() => ({ variables: SEARCH_THEME[theme] }), [theme]);

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
      theme={searchTheme}
    />
  );
}
