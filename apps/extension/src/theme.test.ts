import { describe, expect, it } from 'vitest';
import { isThemePreference, resolveTheme } from './theme.js';

describe('isThemePreference', () => {
  it('accepts the three valid values', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
  });

  it('rejects anything else (including missing values)', () => {
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference('')).toBe(false);
    expect(isThemePreference('Light')).toBe(false);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(0)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('returns the user choice when not "system"', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows the OS preference when "system"', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });
});
