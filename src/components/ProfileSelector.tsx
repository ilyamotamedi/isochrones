import { PROFILES, PROFILE_LABEL, type Profile } from '../types';

interface ProfileSelectorProps {
  value: Profile;
  onChange: (profile: Profile) => void;
}

/** Simple inline glyphs — avoids an icon dependency for three shapes. */
const ICON: Record<Profile, string> = {
  walking: 'M13.5 5.5a2 2 0 1 0-2-2 2 2 0 0 0 2 2M9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7 7 0 0 0 19 13v-2a5 5 0 0 1-4.2-2.4l-1-1.6c-.4-.6-1-1-1.8-1-.3 0-.5 0-.8.2L6 8.3V13h2V9.6z',
  cycling:
    'M15.5 5.5a2 2 0 1 0-2-2 2 2 0 0 0 2 2M5 12a5 5 0 1 0 5 5 5 5 0 0 0-5-5m0 8.5A3.5 3.5 0 1 1 8.5 17 3.5 3.5 0 0 1 5 20.5M10.8 10.5l2.4-2.4.8.8a5.9 5.9 0 0 0 4 1.6V8.5a4.2 4.2 0 0 1-2.8-1.2l-1.9-1.9a1.8 1.8 0 0 0-1.3-.5 1.8 1.8 0 0 0-1.3.5L7.8 8.1a1.8 1.8 0 0 0-.5 1.3 1.8 1.8 0 0 0 .5 1.3L11 13.8V19h2v-6.4l-2.2-2.1M19 12a5 5 0 1 0 5 5 5 5 0 0 0-5-5m0 8.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5',
  driving:
    'M18.9 5.6A1.5 1.5 0 0 0 17.5 4.5h-11a1.5 1.5 0 0 0-1.4 1.1L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8ZM6.8 6.5h10.4l1.4 4H5.4ZM6.5 16a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 6.5 16m11 0a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5',
};

/**
 * Mode of transport.
 *
 * Native radio inputs behind styled labels, rather than buttons carrying
 * `role="radio"`. A hand-rolled radiogroup also owes you roving tabindex and
 * arrow-key handling, and getting that subtly wrong is worse than not claiming
 * the role at all. The inputs are visually hidden but still focusable, so
 * keyboard and screen-reader behaviour is whatever the platform does.
 */
export function ProfileSelector({ value, onChange }: ProfileSelectorProps) {
  return (
    <fieldset className="profiles">
      <legend className="sr-only">Mode of transport</legend>

      {PROFILES.map((profile) => {
        const selected = profile === value;
        return (
          <label
            key={profile}
            className={`profiles__btn${selected ? ' profiles__btn--active' : ''}`}
          >
            <input
              type="radio"
              className="sr-only"
              name="profile"
              value={profile}
              checked={selected}
              onChange={() => onChange(profile)}
            />
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={ICON[profile]} fill="currentColor" />
            </svg>
            {/* Text label, not just the icon — three similar glyphs are not
                distinguishable enough on their own. */}
            <span>{PROFILE_LABEL[profile]}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
