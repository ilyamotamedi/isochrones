import { BAND_COLOR, cumulativeBandOpacity } from '../config';

interface BandTogglesProps {
  /** All requested bands, ascending. */
  bands: number[];
  /** Currently visible subset. */
  visible: number[];
  onToggle: (minutes: number) => void;
  disabled: boolean;
}

/**
 * Band visibility controls, doubling as the map legend.
 *
 * Keeping the swatch, the time and the checkbox in one row avoids the
 * redundancy of a separate read-only legend listing the same four values.
 *
 * Swatch colours use the cumulative opacity each band reaches on the map, since
 * nested fills stack — a flat swatch at the per-band opacity would not match
 * what the user actually sees.
 */
export function BandToggles({ bands, visible, onToggle, disabled }: BandTogglesProps) {
  const visibleSet = new Set(visible);
  const lastVisible = visible.length === 1;

  return (
    <fieldset className="bands" disabled={disabled}>
      <legend className="bands__legend">Travel time</legend>

      {bands.map((minutes, index) => {
        const isVisible = visibleSet.has(minutes);
        // Bands are ascending, so depth counts inwards from the outermost.
        const depth = bands.length - index;

        return (
          <label key={minutes} className="bands__row">
            <input
              type="checkbox"
              checked={isVisible}
              // Blocking the last one prevents an empty map that looks broken
              // rather than deliberately cleared.
              disabled={disabled || (isVisible && lastVisible)}
              onChange={() => onToggle(minutes)}
            />
            <span
              className="bands__swatch"
              aria-hidden="true"
              style={{
                backgroundColor: BAND_COLOR,
                opacity: isVisible ? cumulativeBandOpacity(depth) : 0.12,
              }}
            />
            <span className="bands__label">{minutes} min</span>
          </label>
        );
      })}
    </fieldset>
  );
}
