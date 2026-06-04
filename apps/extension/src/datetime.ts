/** Helpers to bridge ISO timestamps and the browser-local value of
 *  <input type="datetime-local"> (format: YYYY-MM-DDTHH:MM, local zone). */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(local: string): string {
  // `new Date('YYYY-MM-DDTHH:MM')` is parsed in the browser's local zone.
  return new Date(local).toISOString();
}

export function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combine a local date (YYYY-MM-DD) and time (HH:MM) into an ISO string. */
export function combineToIso(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}`).toISOString();
}

/**
 * Resolve a start/end window from one base date and two local times.
 * If the end is at or before the start, it rolls to the next day
 * (the entry crosses midnight).
 */
export function resolveWindow(
  dateStr: string,
  startTime: string,
  endTime: string,
): { startIso: string; endIso: string; nextDay: boolean } {
  const start = new Date(`${dateStr}T${startTime}`);
  const end = new Date(`${dateStr}T${endTime}`);
  let nextDay = false;
  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
    nextDay = true;
  }
  return { startIso: start.toISOString(), endIso: end.toISOString(), nextDay };
}
