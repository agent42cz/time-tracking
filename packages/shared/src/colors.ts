/**
 * Client colours (US-102).
 *
 * Ten hues, each as a light/dark PAIR. The client name is tinted as text, so
 * 4.5:1 applies — and no single hex clears that on both a near-white and a
 * near-black background. The `light` value is canonical: it is what the DB
 * stores and what `isClientColor` validates. `dark` is looked up at render
 * time via `darkVariantOf`.
 *
 * DEFAULT_CLIENT_COLOR is deliberately outside the palette: it is the
 * "no colour chosen" state and inherits the surrounding theme colour.
 */
export const DEFAULT_CLIENT_COLOR = '#6b7280';

export interface ClientColor {
  /** Canonical, stored in Client.color. Legible on zinc-50 / white. */
  light: string;
  /** Render-time counterpart. Legible on zinc-900 / zinc-800. */
  dark: string;
}

export const CLIENT_COLORS: readonly ClientColor[] = [
  { light: '#b91c1c', dark: '#f87171' }, // red
  { light: '#c2410c', dark: '#fb923c' }, // orange
  { light: '#a16207', dark: '#fbbf24' }, // amber
  { light: '#15803d', dark: '#4ade80' }, // green
  { light: '#0f766e', dark: '#2dd4bf' }, // teal
  { light: '#0369a1', dark: '#38bdf8' }, // sky
  { light: '#1d4ed8', dark: '#60a5fa' }, // blue
  { light: '#6d28d9', dark: '#a78bfa' }, // violet
  { light: '#a21caf', dark: '#e879f9' }, // fuchsia
  { light: '#be185d', dark: '#f472b6' }, // pink
] as const;

/** The stored (light) hexes — the values that may appear in Client.color. */
export const CLIENT_COLOR_VALUES: readonly string[] = CLIENT_COLORS.map((c) => c.light);

export function isClientColor(value: string): boolean {
  return value === DEFAULT_CLIENT_COLOR || CLIENT_COLOR_VALUES.includes(value);
}

/** Dark-theme counterpart of a stored colour, or null if it has none (the default grey). */
export function darkVariantOf(light: string): string | null {
  return CLIENT_COLORS.find((c) => c.light === light)?.dark ?? null;
}
