import { themeActionLabel } from '../state/theme';
import type { ResolvedTheme, ThemePreference } from '../types';

interface ThemeToggleProps {
  preference: ThemePreference;
  /** What `system` currently works out to — picks the icon. */
  resolved: ResolvedTheme;
  onCycle: () => void;
}

/**
 * Three-state control in one button: system → light → dark.
 *
 * A segmented control would make "system" visible as a state rather than
 * something you discover by pressing, but it costs a full row in a panel where
 * vertical space on a phone is the scarcest thing there is. The compromise is
 * an explicit label in the accessible name and the tooltip, so the current
 * state is always available even though it is not always on screen.
 */
export function ThemeToggle({ preference, resolved, onCycle }: ThemeToggleProps) {
  const label = themeActionLabel(preference);

  return (
    <span className="tooltip-host">
      <button
        type="button"
        className="theme-toggle"
        onClick={onCycle}
        /*
         * No `title`. The native tooltip waits about a second, which is long
         * enough that people press an unfamiliar icon to find out what it does
         * rather than wait to be told. The span below does the same job
         * immediately.
         */
        aria-label={label}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {preference === 'system' ? (
            // A display: the setting is delegated, not chosen.
            <>
              <rect
                x="3"
                y="4"
                width="18"
                height="13"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path d="M9 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </>
          ) : resolved === 'dark' ? (
            <path
              d="M20 14.5A8 8 0 019.5 4 8.5 8.5 0 1020 14.5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </button>

      {/*
        aria-hidden: this repeats the button's accessible name word for word,
        and a screen reader that picked up both would say it twice.
      */}
      <span className="tooltip" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
