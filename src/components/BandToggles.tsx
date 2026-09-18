import { bandColorAt } from '../config';

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
 * Swatches sample the same near→far colour ramp the map paints, so the legend
 * reads as a key rather than as decoration. An unchecked band keeps its
 * position but drops to a muted grey, which makes the off state legible
 * without relying on the checkbox alone.
 */
export function BandToggles({ bands, visible, onToggle, disabled }: BandTogglesProps) {
  const visibleSet = new Set(visible);
  const lastVisible = visible.length === 1;
  // Guard against a single-band set dividing by zero.
  const span = Math.max(1, bands.length - 1);

  return (
    <fieldset className="bands" disabled={disabled}>
      <legend className="bands__legend">Travel time</legend>

      {bands.map((minutes, index) => {
        const isVisible = visibleSet.has(minutes);

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
                backgroundColor: isVisible ? bandColorAt(index / span) : '#d6d9de',
              }}
            />
            <span className="bands__label">{minutes} min</span>
          </label>
        );
      })}
    </fieldset>
  );
}
