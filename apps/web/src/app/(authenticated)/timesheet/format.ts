import { toAppZone } from '@tt/shared/time';

// All times in the DB are real UTC instants (Postgres timestamptz). These
// helpers render them as Europe/Prague wall-clock independently of the
// server's local TZ — Coolify containers run UTC, but `pnpm dev` may run
// anywhere. Every Date that touches a label goes through `toAppZone` first.

const pad = (n: number): string => String(n).padStart(2, '0');

export function fmtTime(d: Date): string {
  const z = toAppZone(d);
  return `${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

export function dayKey(d: Date): string {
  const z = toAppZone(d);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

export function ymd(d: Date): string {
  const z = toAppZone(d);
  return `${pad(z.getDate())}.${pad(z.getMonth() + 1)}.${z.getFullYear()}`;
}

export function fmtDur(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

export function weekdayLabel(d: Date): string {
  return toAppZone(d).toLocaleDateString('cs-CZ', { weekday: 'long' });
}

export function isWeekend(d: Date): boolean {
  const day = toAppZone(d).getDay();
  return day === 0 || day === 6;
}
