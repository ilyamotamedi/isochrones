import type { Map as MapboxMap } from 'mapbox-gl';
import type { RefObject } from 'react';
import { OriginField } from './OriginField';
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
  /** Whether to point out the caret. Mobile only; see `useCaretHint`. */
  caretHint: boolean;
  onToggleCollapsed: () => void;
  map: MapboxMap | null;
  origin: Origin | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (origin: Origin) => void;
  onUseMyLocation: () => void;
  /** Handed to the pin button, so clearing the map label has somewhere to put
   * focus once the button it was on has gone. */
  pinButtonRef: RefObject<HTMLButtonElement | null>;
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
  /**
   * Whether analytics exists to have an opinion about. False in a build with
   * no measurement ID, where the control would open a banner asking permission
   * for something that cannot happen.
   */
  showPrivacy: boolean;
  onOpenPrivacy: () => void;
}

export function ControlPanel({
  panelRef,
  stickyRef,
  collapsed,
  caretHint,
  onToggleCollapsed,
  map,
  origin,
  searchValue,
  onSearchChange,
  onSelect,
  onUseMyLocation,
  pinButtonRef,
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
  showPrivacy,
  onOpenPrivacy,
}: ControlPanelProps) {
  return (
    <div ref={panelRef} className={collapsed ? 'panel panel--collapsed' : 'panel'}>
      <div className="panel__header">
        <h1 className="panel__title">isochrones</h1>

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
          <span className="tooltip-host panel__collapse-host">
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

            {/*
              The hint, and the same span the theme toggle uses for its tooltip
              — so it inherits the hover and focus behaviour for free and only
              needs the extra class to be shown unprompted.

              Kept to one line on purpose. It hangs below the header and
              therefore over the search field, and the two-line version covered
              the field completely for the six seconds it was up. Naming what
              is inside does the job; the caret it is attached to says where.

              `aria-hidden`, like the other tooltip: the button already says
              "Show controls", which is plainer than this is, and a screen
              reader arriving at the header meets that directly rather than
              needing to be told the caret is there.
            */}
            <span
              className={caretHint ? 'tooltip tooltip--shown' : 'tooltip'}
              aria-hidden="true"
            >
              Travel times and modes
            </span>
          </span>
        </div>
      </div>

      {/*
        The origin field stays outside `.panel__body`: its suggestions dropdown
        must never sit inside a scrollable ancestor or it gets clipped.

        It also stays visible when collapsed — a collapsed panel that cannot
        start a new search would just be a title bar.
      */}
      <div className="panel__field" ref={stickyRef}>
        <OriginField
          map={map}
          value={searchValue}
          onChange={onSearchChange}
          onSelect={onSelect}
          onUseMyLocation={onUseMyLocation}
          pinButtonRef={pinButtonRef}
          locating={locating}
          locationError={locationError}
          theme={theme}
        />
      </div>

      {/*
        Not a <form>. There is nothing to submit — every control applies itself
        — and a form with no submit button turns Enter in a number field into a
        silent no-op at best and a page reload at worst.
      */}
      <div className="panel__body" id="panel-body">
        <div className="panel__section panel__section--first">
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

        {/*
          Share and Privacy share a section, and a separator.

          They are the two controls here that act on something other than the
          map, and on an iPhone SE a second bordered row for a 12px text link
          cost 24px of map — measured, not guessed. One section, one rule.
        */}
        {(hasResult || showPrivacy) && (
          <div className="panel__section">
            {hasResult && <ShareButton disabled={status.kind !== 'success'} />}

            {/*
              Withdrawal has to be as easy as granting, which means the
              decision needs a permanent home rather than living only in a
              banner that is gone for good after one click.

              Last, small and quiet: it is the least interesting control here,
              and the only people who want it already know they want it.
            */}
            {showPrivacy && (
              <div className="panel__footer">
                <button type="button" className="panel__link" onClick={onOpenPrivacy}>
                  Privacy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
