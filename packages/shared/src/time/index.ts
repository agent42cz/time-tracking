/**
 * Shared time helpers. All app code uses these instead of `Date.now()`
 * directly so tests can override the clock through `setNowProvider`.
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  getISODay,
  subDays,
  addDays,
  getDaysInMonth,
  eachDayOfInterval,
} from 'date-fns';

export const APP_TIMEZONE = 'Europe/Prague';

type NowProvider = () => Date;
let nowProvider: NowProvider = () => new Date();

export function setNowProvider(provider: NowProvider | null): void {
  nowProvider = provider ?? (() => new Date());
}

export function now(): Date {
  return nowProvider();
}

export function toAppZone(d: Date): Date {
  return toZonedTime(d, APP_TIMEZONE);
}

export function fromAppZone(d: Date): Date {
  return fromZonedTime(d, APP_TIMEZONE);
}

// `<input type="date">` and `<input type="time">` give wall-clock strings with
// no timezone. Parse them as Europe/Prague so the resulting UTC instant is
// independent of the server's local TZ (Coolify containers run as UTC).
export function parseAppZoneInput(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, APP_TIMEZONE);
}

export type Period = 'today' | 'week' | 'month' | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export function getPeriodRange(
  period: Exclude<Period, 'custom'>,
  reference: Date = now(),
): PeriodRange {
  const local = toAppZone(reference);
  switch (period) {
    case 'today':
      return { start: fromAppZone(startOfDay(local)), end: fromAppZone(endOfDay(local)) };
    case 'week':
      return {
        start: fromAppZone(startOfWeek(local, { weekStartsOn: 1 })),
        end: fromAppZone(endOfWeek(local, { weekStartsOn: 1 })),
      };
    case 'month':
      return { start: fromAppZone(startOfMonth(local)), end: fromAppZone(endOfMonth(local)) };
  }
}

// `getPeriodRange('month')` returns an inclusive end (endOfMonth, 23:59:59.999),
// but reports filter half-open [from, to). This helper returns a clean half-open
// previous-calendar-month range so the "last month" PDF includes the whole month.
export function getPreviousMonthRange(reference: Date = now()): PeriodRange {
  const local = toAppZone(reference);
  return {
    start: fromAppZone(startOfMonth(subMonths(local, 1))),
    end: fromAppZone(startOfMonth(local)),
  };
}

export function durationMs(start: Date, end: Date | null): number {
  return (end ?? now()).getTime() - start.getTime();
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatDurationHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/**
 * 7-day window (half-open) whose start is the most recent occurrence of the
 * ISO weekday `weekStartsOn` (1=Mon..7=Sun) at 00:00 Europe/Prague at or before
 * `reference`. E.g. weekStartsOn=3 (Wed) is SPLY's week boundary.
 */
export function weekRangeFor(weekStartsOn: number, reference: Date = now()): PeriodRange {
  const local = toAppZone(reference);
  const midnight = startOfDay(local);
  const currentIso = getISODay(midnight); // 1..7
  let diff = currentIso - weekStartsOn;
  if (diff < 0) diff += 7;
  const localStart = subDays(midnight, diff);
  return { start: fromAppZone(localStart), end: fromAppZone(addDays(localStart, 7)) };
}

/** Count days in `reference`'s Prague month whose ISO weekday is in `workingDays`. */
export function isoWorkingDayCountInMonth(workingDays: number[], reference: Date = now()): number {
  if (workingDays.length === 0) return 0;
  const local = toAppZone(reference);
  const set = new Set(workingDays);
  return eachDayOfInterval({ start: startOfMonth(local), end: endOfMonth(local) }).filter((d) =>
    set.has(getISODay(d)),
  ).length;
}

/** Calendar days in `reference`'s Prague month. */
export function daysInMonthCount(reference: Date = now()): number {
  return getDaysInMonth(toAppZone(reference));
}
