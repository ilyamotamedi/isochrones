import type { Map as MapboxMap } from 'mapbox-gl';
import type { RefObject } from 'react';
import { LocationSearch } from './LocationSearch';
import type { Origin, ResolvedTheme } from '../types';

interface OriginFieldProps {
  map: MapboxMap | null;
  value: string;
  onChange: (value: string) => void;
  onSelect: (origin: Origin) => void;
  onUseMyLocation: () => void;
  /**
   * Where focus lands when the map label is cleared away underneath it. See
   * `handleClear` in App for why this button and not the search field.
   */
  pinButtonRef: RefObject<HTMLButtonElement | null>;
  locating: boolean;
  locationError: string | null;
  theme: ResolvedTheme;
}

/** What the pin button says it does, in the tooltip and to a screen reader. */
const IDLE_LABEL = 'Use my location';
const BUSY_LABEL = 'Finding your location…';

/**
 * The one control for choosing a starting point: search, "use my location",
 * and anything that went wrong doing either.
 *
 * These were three separate things in a column — a field, a button with a
 * hint beside it, and an error further down. They are one control now, joined
 * along a shared border, which is both denser and more honest about the fact
 * that they all answer the same question.
 *
 * The error belongs here specifically. It used to sit in `.panel__body`, which
 * is safe only while the button that triggers it is also in there. The pin
 * lives in the part of the panel that survives collapsing, so it can be
 * pressed on a phone with the sheet shut — and a permission-denied message
 * left behind in a collapsed container would never be read.
 */
export function OriginField({
  map,
  value,
  onChange,
  onSelect,
  onUseMyLocation,
  pinButtonRef,
  locating,
  locationError,
  theme,
}: OriginFieldProps) {
  const label = locating ? BUSY_LABEL : IDLE_LABEL;

  return (
    <div className="origin-field">
      <div className="origin-field__combo">
        <LocationSearch
          map={map}
          value={value}
          onChange={onChange}
          onSelect={onSelect}
          theme={theme}
        />

        <span className="tooltip-host">
          <button
            ref={pinButtonRef}
            type="button"
            className="pin-btn"
            onClick={onUseMyLocation}
            disabled={locating}
            aria-label={label}
            /*
             * `aria-busy` rather than only `disabled`: disabled says the
             * control cannot be used, busy says why. Together they describe a
             * request in flight instead of a button that has simply gone dead.
             */
            aria-busy={locating}
          >
            {/*
              Both icons are always rendered and CSS chooses between them. That
              is what lets the reduced-motion fallback be a media query rather
              than a second code path in here — see index.css.
            */}
            <svg className="pin-btn__pin" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>

            <svg
              className="pin-btn__spinner"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="12"
                cy="12"
                r="8.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                /*
                 * A gap of a quarter of the circumference. Without a gap the
                 * ring is rotationally symmetric and the spin is invisible.
                 */
                strokeDasharray="40 13"
              />
            </svg>
          </button>

          {/* Repeats the button's accessible name, so it is hidden from AT. */}
          <span className="tooltip" aria-hidden="true">
            {label}
          </span>
        </span>
      </div>

      {locationError && <p className="panel__error">{locationError}</p>}
    </div>
  );
}
