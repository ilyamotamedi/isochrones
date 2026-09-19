import { useCallback, useEffect, useMemo, useRef } from 'react';
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

/** The field's name, as distinct from the hint shown inside it. */
const ARIA_LABEL = 'Choose a starting point';

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/*
 * The web component renders into a shadow root and styles itself from this
 * object, so it cannot see the stylesheet's custom properties. These values
 * therefore have to duplicate the ones in index.css — keep them in step, or
 * the search field becomes a white slab in a dark panel.
 *
 * `colorText` is not the whole story: it colours the suggestion list but not
 * the input, which keeps the component's light-mode default no matter what is
 * set here. The input and its placeholder are coloured from CSS instead — see
 * `.origin-field__search mapbox-search-box input` in index.css.
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

  const hostRef = useRef<HTMLDivElement>(null);

  /*
   * Give the input a name that says what it is for.
   *
   * The component copies the placeholder into `aria-label` and exposes no prop
   * to separate the two. That was fine while the placeholder was "Choose a
   * starting point", but the placeholder is now a hint — and "Search, or click
   * the map" is a poor name for a field, not least because clicking the map is
   * not an instruction a screen reader user can act on.
   *
   * The observer has to persist rather than disconnect on first success. The
   * first version of this applied the label and stopped, and the component
   * simply wrote the placeholder back over it during its own render, which the
   * harness caught. Watching the attribute and re-applying is the only version
   * that holds.
   *
   * It cannot loop: setting the attribute re-enters the callback, which finds
   * the value already correct and does nothing.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const apply = () => {
      const input = host.querySelector('input');
      if (!input || input.getAttribute('aria-label') === ARIA_LABEL) return;
      input.setAttribute('aria-label', ARIA_LABEL);
    };

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="origin-field__search" ref={hostRef}>
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
        /*
         * Measured, not guessed. At 375px the field has ~217px of room once the
         * pin button is carved out, and "Choose a starting point, or click the
         * map" renders 293px wide — it would be clipped mid-word at every
         * width, desktop included. This says the same two things in 175px.
         */
        placeholder="Search, or click the map"
        options={{ language: 'en', limit: 6 }}
        theme={searchTheme}
      />
    </div>
  );
}
