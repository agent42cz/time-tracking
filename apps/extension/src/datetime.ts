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
