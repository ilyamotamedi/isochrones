import type { Map as MapboxMap } from 'mapbox-gl';
import type { RefObject } from 'react';
import { LocationSearch } from './LocationSearch';
import { ProfileSelector } from './ProfileSelector';
import { BandEditor } from './BandEditor';
import { StatusBanner } from './StatusBanner';
import { ShareButton } from './ShareButton';
import { ThemeToggle } from './ThemeToggle';
import type { BandState } from '../state/bandEditor';
import type {
  Origin,
  Profile,
  QueryStatus,
  ResolvedTheme,
  ThemePreference,
} from '../types';

interface ControlPanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
  /**
   * The lowest element that stays on screen when the mobile sheet collapses.
   * The camera frames against this, not the full expanded sheet.
   */
  stickyRef: RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
  bands: BandState;
  enabled: boolean[];
  onBandInput: (index: number, value: string) => void;
  onToggleBand: (index: number) => void;
  canToggle: boolean;
  enabledCount: number;
  /** No row is usable, so the map is showing an older set of times. */
  stale: boolean;
  /** Something has been requested, so there is a link worth sharing. */
  hasResult: boolean;
  status: QueryStatus;
  themePreference: ThemePreference;
  theme: ResolvedTheme;
  onCycleTheme: () => void;
}

export function ControlPanel({
  panelRef,
  stickyRef,
  collapsed,
  onToggleCollapsed,
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
  enabled,
  onBandInput,
  onToggleBand,
  canToggle,
  enabledCount,
  stale,
  hasResult,
  status,
  themePreference,
  theme,
  onCycleTheme,
}: ControlPanelProps) {
  return (
    <div ref={panelRef} className={collapsed ? 'panel panel--collapsed' : 'panel'}>
      <div className="panel__header">
        <div>
          <h1 className="panel__title">isochrones</h1>
          <p className="panel__subtitle">See how far you can get.</p>
        </div>

        <div className="panel__actions">
          <ThemeToggle
            preference={themePreference}
            resolved={theme}
            onCycle={onCycleTheme}
          />

          {/*
            Mobile only — hidden by CSS above the breakpoint, where the panel is
            a small card with the map beside it and there is nothing to get out
            of the way of.
          */}
          <button
            type="button"
            className="panel__collapse"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="panel-body"
          >
            <span className="sr-only">{collapsed ? 'Show controls' : 'Hide controls'}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d={collapsed ? 'M7 10l5 5 5-5' : 'M7 14l5-5 5 5'}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/*
        The search field stays outside `.panel__body`: its suggestions dropdown
        must never sit inside a scrollable ancestor or it gets clipped.

        It also stays visible when collapsed — a collapsed panel that cannot
        start a new search would just be a title bar.
      */}
      <div className="panel__field" ref={stickyRef}>
        <LocationSearch
          map={map}
          value={searchValue}
          onChange={onSearchChange}
          onSelect={onSelect}
          theme={theme}
        />
      </div>

      {/*
        Not a <form>. There is nothing to submit — every control applies itself
        — and a form with no submit button turns Enter in a number field into a
        silent no-op at best and a page reload at worst.
      */}
      <div className="panel__body" id="panel-body">
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
            bands={bands}
            enabled={enabled}
            onChangeInput={onBandInput}
            onToggle={onToggleBand}
            canToggle={canToggle}
            enabledCount={enabledCount}
            theme={theme}
          />

          {stale && (
            <p className="panel__pending" role="status">
              Showing your last valid times.
            </p>
          )}
        </div>

        <StatusBanner status={status} hasOrigin={origin !== null} />

        {hasResult && (
          <div className="panel__section">
            <ShareButton disabled={status.kind !== 'success'} />
          </div>
        )}
      </div>
    </div>
  );
}
