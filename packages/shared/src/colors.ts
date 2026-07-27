/**
 * Client colours (US-102). Ten fixed hues, each picked to stay legible as
 * *text* on both the light and the dark app background — the client name is
 * tinted, not just a swatch. DEFAULT_CLIENT_COLOR is deliberately outside the
 * palette: it is the "no colour chosen" state and renders as ordinary grey.
 */
export const DEFAULT_CLIENT_COLOR = '#6b7280';

export const CLIENT_COLORS = [
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // amber
  '#16a34a', // green
  '#0d9488', // teal
  '#0284c7', // sky
  '#2563eb', // blue
  '#7c3aed', // violet
  '#c026d3', // fuchsia
  '#db2777', // pink
] as const;

export function isClientColor(value: string): boolean {
  return value === DEFAULT_CLIENT_COLOR || (CLIENT_COLORS as readonly string[]).includes(value);
}
