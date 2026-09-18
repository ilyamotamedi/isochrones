import { bandColorAt } from '../config';
import { MAX_MINUTES, MIN_MINUTES, type BandState } from '../state/bandEditor';
import type { ResolvedTheme } from '../types';

interface BandEditorProps {
  bands: BandState;
  /** Per-row on/off, same length as the rows. */
  enabled: boolean[];
  onChangeInput: (index: number, value: string) => void;
  onToggle: (index: number) => void;
  /** Whether there is a result on the map to filter at all. */
  canToggle: boolean;
  /**
   * How many rows are both usable and on. The last one cannot be switched off.
   */
  enabledCount: number;
  /** The swatch ramp inverts between themes, so it has to be passed in. */
  theme: ResolvedTheme;
}

/**
 * The four travel-time rows, which double as the map legend.
 *
 * Fixed slots rather than an editable list. Add and remove buttons made the
 * common case — adjusting a number — carry the weight of a list-management UI,
 * and a stable row is also what lets on/off be tracked by position.
 *
 * Swatches sample the same near-to-far ramp the map paints, so the legend reads
 * as a key rather than as decoration.
 */
export function BandEditor({
  bands,
  enabled,
  onChangeInput,
  onToggle,
  canToggle,
  enabledCount,
  theme,
}: BandEditorProps) {
  return (
    <fieldset className="bands">
      <legend className="bands__legend">Travel time</legend>

      {bands.rows.map((row, index) => {
        const isOn = enabled[index] === true;
        const isLastOn = isOn && row.minutes !== null && enabledCount === 1;
        const errorId = row.error ? `band-error-${index}` : undefined;

        return (
          // Row identity is positional: the value is being edited, so it cannot
          // be the key without remounting the input on every keystroke.
          <div key={index} className="bands__row">
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                className="switch__input"
                checked={isOn}
                /*
                 * Only two reasons to lock a switch: there is nothing drawn to
                 * filter, or this is the last band standing and turning it off
                 * would leave an empty map that reads as a bug.
                 */
                disabled={!canToggle || isLastOn}
                onChange={() => onToggle(index)}
              />
              <span className="switch__track" aria-hidden="true">
                <span className="switch__thumb" />
              </span>
              <span className="sr-only">
                Show the {row.raw || 'empty'} minute band
              </span>
            </label>

            <span
              className="bands__swatch"
              aria-hidden="true"
              style={{
                backgroundColor:
                  isOn && row.minutes !== null
                    ? bandColorAt(bands.rampPosition[index] ?? 0, theme)
                    : 'var(--swatch-off)',
              }}
            />

            <input
              type="number"
              className={row.error ? 'bands__input bands__input--invalid' : 'bands__input'}
              value={row.raw}
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              step={1}
              inputMode="numeric"
              onChange={(event) => onChangeInput(index, event.target.value)}
              aria-label={`Travel time ${index + 1} in minutes`}
              aria-invalid={row.error ? true : undefined}
              aria-describedby={errorId}
            />
            <span className="bands__unit">min</span>

            {/*
              Per row, not one shared line. Four fixed rows can each be wrong
              in a different way, and a single message cannot say which box to
              look at.
            */}
            {row.error && (
              <span className="bands__error" id={errorId} role="alert">
                {row.error}
              </span>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
