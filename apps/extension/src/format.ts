/**
 * Duration as HH:MM — for *stopped* entries, day totals and summary cards
 * (AIAGE-28). The running row uses `formatDurationHMS` instead (AIAGE-51,
 * US-90), because a live timer without a seconds field looks frozen.
 */
export function fmtDurationHM(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
