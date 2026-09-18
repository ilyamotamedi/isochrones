import { useCallback, useEffect, useState } from 'react';
import type { ResolvedTheme, ThemePreference } from '../types';
import {
  nextPreference,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from './theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** Advance to the next preference and persist it. */
  cycle: () => void;
}

/**
 * Owns the colour scheme.
 *
 * Two inputs, not one: the stored preference and the OS setting. Both are
 * live — the OS one because a machine set to switch at sunset will flip under
 * a tab that is already open, and a page that ignores that is the only window
 * still glowing white.
 */
export function useTheme(): ThemeState {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readStoredPreference(window.localStorage),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);

    query.addEventListener('change', onChange);
    // Re-read on mount: the OS can change between the initial state and here.
    setPrefersDark(query.matches);

    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;

    /*
     * The address bar and the task switcher take their colour from this, so
     * leaving it white puts a bright band above a dark app on mobile.
     */
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', resolved === 'dark' ? '#1f1f1f' : '#ffffff');
  }, [resolved]);

  const cycle = useCallback(() => {
    setPreference((prev) => {
      const next = nextPreference(prev);
      writeStoredPreference(window.localStorage, next);
      return next;
    });
  }, []);

  return { preference, resolved, cycle };
}
