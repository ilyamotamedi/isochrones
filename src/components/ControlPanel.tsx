import type { Map as MapboxMap } from 'mapbox-gl';
import type { FormEvent } from 'react';
import { LocationSearch } from './LocationSearch';
import { ProfileSelector } from './ProfileSelector';
import { BandEditor } from './BandEditor';
import { StatusBanner } from './StatusBanner';
import { ShareButton } from './ShareButton';
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
  bandInputs: string[];
  hidden: ReadonlySet<number>;
  onBandInput: (index: number, value: string) => void;
  onToggleBand: (index: number) => void;
  onAddBand: () => void;
  onRemoveBand: (index: number) => void;
  bandError: string | null;
  canToggle: boolean;
  dirty: boolean;
  hasSubmitted: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
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
  bandInputs,
  hidden,
  onBandInput,
  onToggleBand,
  onAddBand,
  onRemoveBand,
  bandError,
  canToggle,
  dirty,
  hasSubmitted,
  canSubmit,
  onSubmit,
  status,
}: ControlPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  const submitLabel = hasSubmitted ? 'Update map' : 'Show isochrone';

  return (
    <div className="panel">
      <h1 className="panel__title">isochrones</h1>
      <p className="panel__subtitle">See how far you can get.</p>

      {/*
        The search field stays outside the form as well as outside
        `.panel__body`. Its suggestions dropdown must never sit inside a
        scrollable ancestor or it gets clipped, and keeping it out of the form
        stops Enter-to-accept-a-suggestion from also submitting the query.
      */}
      <div className="panel__field">
        <LocationSearch
          map={map}
          value={searchValue}
          onChange={onSearchChange}
          onSelect={onSelect}
        />
      </div>

      <form className="panel__body" onSubmit={handleSubmit}>
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
          <BandEditor
            inputs={bandInputs}
            hidden={hidden}
            onChangeInput={onBandInput}
            onToggle={onToggleBand}
            onAdd={onAddBand}
            onRemove={onRemoveBand}
            canToggle={canToggle}
            error={bandError}
          />
        </div>

        <div className="panel__section">
          <button type="submit" className="btn btn--primary btn--block" disabled={!canSubmit}>
            {status.kind === 'loading' ? 'Loading…' : submitLabel}
          </button>

          {/*
            Only shown once something is on the map. Before that the button
            label already says what to do, and a nag under a fresh form is
            noise rather than guidance.
          */}
          {dirty && hasSubmitted && (
            <p className="panel__pending" role="status">
              The map is showing your previous settings.
            </p>
          )}
        </div>

        <StatusBanner status={status} hasOrigin={origin !== null} />

        {hasSubmitted && (
          <div className="panel__section">
            <ShareButton disabled={status.kind !== 'success'} />
          </div>
        )}
      </form>
    </div>
  );
}
