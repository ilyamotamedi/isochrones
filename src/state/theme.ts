import type { ResolvedTheme, ThemePreference } from '../types';

/**
 * Theme resolution and persistence, with no React and no DOM.
 *
 * Split out because the rules — an unrecognised stored value, the cycle order,
 * what `system` means at a given moment — are the part worth testing, and the
 * same logic has to run twice: once in the blocking script in `<head>` before
 * React exists, and once in the app.
 */

export const THEME_STORAGE_KEY = 'isochrones:theme';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * Interprets whatever is in storage.
 *
 * Anything unrecognised — a value from an older build, or someone editing
 * localStorage by hand — falls back to `system` rather than throwing. A broken
 * preference should not be able to stop the app rendering.
 */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return PREFERENCES.includes(raw as ThemePreference) ? (raw as ThemePreference) : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * The next state of the cycling control: system → light → dark → system.
 *
 * `system` is first because it is the default, so a single press from a fresh
 * install is a deliberate override rather than a lateral move.
 */
export function nextPreference(preference: ThemePreference): ThemePreference {
  const index = PREFERENCES.indexOf(preference);
  return PREFERENCES[(index + 1) % PREFERENCES.length] ?? 'system';
}

/** How each state reads mid-sentence. */
const STATE_PHRASE: Record<ThemePreference, string> = {
  system: 'following system',
  light: 'light',
  dark: 'dark',
};

/**
 * What the control says it is and what pressing it will do.
 *
 * Both halves in one string, because the icon alone carries neither: a monitor
 * glyph does not announce itself as a theme control, and nothing about it
 * suggests a three-way cycle.
 *
 * The second half is derived from `nextPreference` rather than written out per
 * state, so reordering the cycle cannot leave the wording lying.
 */
export function themeActionLabel(preference: ThemePreference): string {
  return `Theme: ${STATE_PHRASE[preference]}. Switch to ${nextPreference(preference)}.`;
}

/**
 * Reads the stored preference.
 *
 * localStorage throws rather than returning null in a few real situations —
 * Safari's private mode historically, and any context where storage is blocked
 * by policy. Treating that as "no preference" keeps the app working.
 */
export function readStoredPreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function writeStoredPreference(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  preference: ThemePreference,
): void {
  try {
    if (preference === 'system') {
      // Removed rather than stored. "Follow the system" is the absence of an
      // override, and writing it would pin the default in place if it ever
      // changed.
      storage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not being able to remember the choice is a far smaller problem than
    // refusing to apply it.
  }
}
