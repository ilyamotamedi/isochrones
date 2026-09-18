import { bandColorAt } from '../config';
import { MAX_BANDS, MAX_MINUTES, MIN_MINUTES, parseBandInputs } from '../state/bandEditor';

interface BandEditorProps {
  /** Draft minute values, as raw strings. */
  inputs: string[];
  /** Row indices whose band is hidden on the map. */
  hidden: ReadonlySet<number>;
  onChangeInput: (index: number, value: string) => void;
  onToggle: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  /**
   * Whether visibility can be changed right now. False when there is no result
   * on the map, or when the draft has moved on from what is rendered.
   */
  canToggle: boolean;
  /** Validation message, shown beneath the rows. */
  error: string | null;
}

/**
 * The travel-time editor, which doubles as the map legend.
 *
 * One list serves both jobs — editing the values and toggling their visibility
 * — because a separate read-only legend would restate the same four numbers
 * directly below the controls that set them.
 *
 * Swatches are coloured by each value's *rank*, not its row position, so a row
 * dragged out of order previews the colour it will actually be drawn in. While
 * the input is invalid there is no meaningful rank, so we fall back to row
 * order rather than blanking the swatches.
 */
export function BandEditor({
  inputs,
  hidden,
  onChangeInput,
  onToggle,
  onRemove,
  onAdd,
  canToggle,
  error,
}: BandEditorProps) {
  const parsed = parseBandInputs(inputs);
  const errorIndex = parsed.ok ? undefined : parsed.index;

  // order[newIndex] = oldIndex, so invert it to get each row's rank.
  const rankByRow = inputs.map((_, index) => index);
  if (parsed.ok) {
    parsed.order.forEach((oldIndex, newIndex) => {
      rankByRow[oldIndex] = newIndex;
    });
  }

  const span = Math.max(1, inputs.length - 1);
  const visibleCount = inputs.length - inputs.filter((_, i) => hidden.has(i)).length;

  return (
    <fieldset className="bands">
      <legend className="bands__legend">Travel time</legend>

      {inputs.map((value, index) => {
        const isVisible = !hidden.has(index);
        const rank = rankByRow[index] ?? index;
        const invalid = index === errorIndex;

        return (
          // Row identity is positional: the value is being edited, so it cannot
          // be the key without remounting the input on every keystroke.
          <div key={index} className="bands__row">
            <input
              type="checkbox"
              className="bands__check"
              checked={isVisible}
              // Blocking the last visible band prevents an empty map, which
              // reads as a bug rather than as a deliberately cleared view.
              disabled={!canToggle || (isVisible && visibleCount === 1)}
              onChange={() => onToggle(index)}
              aria-label={`Show the ${value || '—'} minute band`}
            />

            <span
              className="bands__swatch"
              aria-hidden="true"
              style={{
                backgroundColor: isVisible ? bandColorAt(rank / span) : '#d6d9de',
              }}
            />

            <input
              type="number"
              className={invalid ? 'bands__input bands__input--invalid' : 'bands__input'}
              value={value}
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              step={1}
              inputMode="numeric"
              onChange={(event) => onChangeInput(index, event.target.value)}
              aria-label={`Travel time ${index + 1} in minutes`}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? 'bands-error' : undefined}
            />
            <span className="bands__unit">min</span>

            <button
              type="button"
              className="bands__remove"
              // One band is the floor; removing it would leave nothing to draw.
              disabled={inputs.length === 1}
              onClick={() => onRemove(index)}
              aria-label={`Remove the ${value || '—'} minute band`}
            >
              ×
            </button>
          </div>
        );
      })}

      {error && (
        <p className="bands__error" id="bands-error" role="alert">
          {error}
        </p>
      )}

      {inputs.length < MAX_BANDS && (
        <button type="button" className="bands__add" onClick={onAdd}>
          + Add a time
        </button>
      )}
    </fieldset>
  );
}
