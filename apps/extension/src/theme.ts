/**
 * Theme handling for the extension popup. Mirrors the web app's
 * light/dark/system contract so the user only configures it once.
 *
 * Persistence: the source of truth lives on the server (User.theme)
 * and is fetched via /api/v1/me. We mirror the resolved value into
 * localStorage so an inline boot script can apply the .dark class
 * before React mounts, avoiding a flash of light content.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'tt:theme';
export const SHOW_STATS_STORAGE_KEY = 'tt:show-stats';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(theme: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

export function applyThemeClass(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function readStoredTheme(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(v) ? v : 'system';
}

export function writeStoredTheme(theme: ThemePreference): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function readShowStats(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(SHOW_STATS_STORAGE_KEY);
  return v !== 'false';
}

export function writeShowStats(show: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SHOW_STATS_STORAGE_KEY, show ? 'true' : 'false');
}
