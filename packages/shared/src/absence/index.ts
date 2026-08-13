/**
 * Absence notice rules — pure calendar-day logic, no DB, no clock reads
 * beyond the `today` the caller passes in.
 *
 * One rule, straight from the brief: "hlásit, které dny tady nebudeš dříve než
 * 1 den předem" — a notice must land at least one whole day before the first
 * absent day.
 *
 * The brief's second ask ("delší dovolené tam pls dávej alespoň měsíc předem")
 * deliberately has no code behind it. It shipped briefly as a non-blocking
 * "Pozdě nahlášeno" flag and was dropped at the requester's direction; the
 * reminder now lives only in the form's hint text. See ADR-0016.
 */
export const ABSENCE_MIN_LEAD_DAYS = 1;

export const ABSENCE_KINDS = ['vacation', 'sick', 'doctor', 'personal', 'other'] as const;
export type AbsenceKindValue = (typeof ABSENCE_KINDS)[number];

export function isAbsenceKind(v: string): v is AbsenceKindValue {
  return (ABSENCE_KINDS as readonly string[]).includes(v);
}

/** `yyyy-MM-dd` — the wire format for a calendar day everywhere in this feature. */
export type DayString = string;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isDayString(v: string): v is DayString {
  if (!DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** A calendar day as a UTC-midnight `Date` — the shape Prisma wants for `@db.Date`. */
export function dayToDate(day: DayString): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function dateToDay(d: Date): DayString {
  return d.toISOString().slice(0, 10);
}

/** Inclusive day count: a one-day absence is 1, not 0. */
export function absenceLengthDays(start: DayString, end: DayString): number {
  return Math.round((dayToDate(end).getTime() - dayToDate(start).getTime()) / MS_PER_DAY) + 1;
}

/** Whole days between `today` and the first absent day. Tomorrow → 1. */
export function leadDays(today: DayString, start: DayString): number {
  return Math.round((dayToDate(start).getTime() - dayToDate(today).getTime()) / MS_PER_DAY);
}

export function addDaysToDay(day: DayString, days: number): DayString {
  return dateToDay(new Date(dayToDate(day).getTime() + days * MS_PER_DAY));
}

export type AbsenceRuleError = 'invalid_day' | 'end_before_start' | 'too_late';

export interface AbsenceValidation {
  ok: boolean;
  error?: AbsenceRuleError;
}

/**
 * `today` is the current Europe/Prague calendar day; the caller derives it so
 * this stays a pure function.
 */
export function validateAbsenceDates(
  today: DayString,
  start: string,
  end: string,
): AbsenceValidation {
  if (!isDayString(start) || !isDayString(end)) return { ok: false, error: 'invalid_day' };
  if (absenceLengthDays(start, end) < 1) return { ok: false, error: 'end_before_start' };
  if (leadDays(today, start) < ABSENCE_MIN_LEAD_DAYS) return { ok: false, error: 'too_late' };
  return { ok: true };
}
