import { describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  nextPreference,
  parseThemePreference,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from './theme';

describe('parseThemePreference', () => {
  it('accepts the three known values', () => {
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('falls back to system for anything else', () => {
    // A value from an older build, or someone editing localStorage by hand.
    expect(parseThemePreference('sepia')).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the system when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the system when overridden', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextPreference', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });

  it('returns to a known state from a corrupt one', () => {
    expect(nextPreference('sepia' as never)).toBe('system');
  });
});

describe('readStoredPreference', () => {
  it('reads a stored override', () => {
    expect(readStoredPreference({ getItem: () => 'dark' })).toBe('dark');
  });

  it('treats a throwing storage as no preference', () => {
    // Blocked storage is a real situation, not a hypothetical, and it must not
    // stop the app rendering.
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredPreference(storage)).toBe('system');
  });
});

describe('writeStoredPreference', () => {
  it('stores an explicit override', () => {
    const setItem = vi.fn();
    writeStoredPreference({ setItem, removeItem: vi.fn() }, 'dark');
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
  });

  it('removes the key for system rather than writing it', () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    writeStoredPreference({ setItem, removeItem }, 'system');
    expect(removeItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('swallows a throwing storage', () => {
    expect(() =>
      writeStoredPreference(
        {
          setItem: () => {
            throw new Error('quota');
          },
          removeItem: () => {
            throw new Error('quota');
          },
        },
        'light',
      ),
    ).not.toThrow();
  });
});
