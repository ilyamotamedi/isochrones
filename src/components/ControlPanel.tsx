import type { Map as MapboxMap } from 'mapbox-gl';
import { LocationSearch } from './LocationSearch';
import type { Origin } from '../types';

interface ControlPanelProps {
  map: MapboxMap | null;
  origin: Origin | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (origin: Origin) => void;
  onUseMyLocation: () => void;
  locating: boolean;
  locationError: string | null;
}

export function ControlPanel({
  map,
  origin,
  searchValue,
  onSearchChange,
  onSelect,
  onUseMyLocation,
  locating,
  locationError,
}: ControlPanelProps) {
  return (
    <div className="panel">
      <h1 className="panel__title">isochrones</h1>
      <p className="panel__subtitle">See how far you can get.</p>

      <div className="panel__field">
        <LocationSearch
          map={map}
          value={searchValue}
          onChange={onSearchChange}
          onSelect={onSelect}
        />
      </div>

      <div className="panel__row">
        <button
          type="button"
          className="btn btn--subtle"
          onClick={onUseMyLocation}
          disabled={locating}
        >
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <span className="panel__hint">or click the map</span>
      </div>

      {locationError && <p className="panel__error">{locationError}</p>}

      {origin && (
        <div className="panel__origin">
          <span className="panel__origin-dot" aria-hidden="true" />
          {/*
            Rendered as text. This value can originate from a share link, so it
            must never be injected as HTML.
          */}
          <span className="panel__origin-label">{origin.label}</span>
        </div>
      )}
    </div>
  );
}
