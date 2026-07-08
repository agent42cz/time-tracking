/**
 * Pure duration arithmetic. **This module must have zero imports.**
 *
 * It is imported directly by the Chrome extension popup
 * (`@tt/shared/time/duration`), which must not pull in `date-fns-tz` (via
 * `./index.js`), `zod` (via `../validators/`), or the WS client (via `../ws/`).
 * Keep it dependency-free.
 */
export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatDurationHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
