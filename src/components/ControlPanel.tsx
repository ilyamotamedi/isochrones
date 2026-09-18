import type { Map as MapboxMap } from 'mapbox-gl';
import { LocationSearch } from './LocationSearch';
import { ProfileSelector } from './ProfileSelector';
import { BandToggles } from './BandToggles';
import { StatusBanner } from './StatusBanner';
import type { Origin, Profile, QueryStatus } from '../types';

interface ControlPanelProps {
  map: MapboxMap | null;
  origin: Origin | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (origin: Origin) => void;
  onUseMyLocation: () => void;
  locating: boolean;
  locationError: string | null;
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  bands: number[];
  visible: number[];
  onToggleBand: (minutes: number) => void;
  status: QueryStatus;
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
  profile,
  onProfileChange,
  bands,
  visible,
  onToggleBand,
  status,
}: ControlPanelProps) {
  return (
    <div className="panel">
      <h1 className="panel__title">isochrones</h1>
      <p className="panel__subtitle">See how far you can get.</p>

      {/*
        The search field stays outside `.panel__body`. Its suggestions dropdown
        must never sit inside a scrollable ancestor, or it gets clipped.
      */}
      <div className="panel__field">
        <LocationSearch
          map={map}
          value={searchValue}
          onChange={onSearchChange}
          onSelect={onSelect}
        />
      </div>

      <div className="panel__body">
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

        <div className="panel__section">
          <ProfileSelector value={profile} onChange={onProfileChange} />
        </div>

        <div className="panel__section">
          <BandToggles
            bands={bands}
            visible={visible}
            onToggle={onToggleBand}
            disabled={status.kind !== 'success'}
          />
        </div>

        <StatusBanner status={status} hasOrigin={origin !== null} />
      </div>
    </div>
  );
}
