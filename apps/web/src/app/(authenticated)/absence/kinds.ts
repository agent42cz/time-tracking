import type { AbsenceKind } from '@prisma/client';
import { formatDayKey } from '@/lib/time-format';

/** Czech labels + chip colours for the five absence kinds. */
export const ABSENCE_KIND_LABELS: Record<AbsenceKind, string> = {
  vacation: 'Dovolená',
  sick: 'Nemoc',
  doctor: 'Lékař',
  personal: 'Osobní volno',
  other: 'Jiné',
};

export const ABSENCE_KIND_CLASSES: Record<AbsenceKind, string> = {
  vacation: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  sick: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  doctor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  personal: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  other: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200',
};

export const ABSENCE_KIND_ORDER: AbsenceKind[] = [
  'vacation',
  'sick',
  'doctor',
  'personal',
  'other',
];

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

/** `2026-08-17` → `17.8.` — compact enough for the week grid header. */
export function formatDayShort(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(d)}.${Number(m)}.`;
}

export function formatDayRange(start: string, end: string): string {
  // formatDayKey is the app's one `yyyy-MM-dd` → `dd.MM.yyyy` renderer
  // (constitution §4); don't grow a second one here.
  return start === end ? formatDayKey(start) : `${formatDayKey(start)} – ${formatDayKey(end)}`;
}

/**
 * ISO weekday label for a `yyyy-MM-dd` day, Monday-first. Named apart from
 * `time-format.ts`'s `weekdayLabel(Date)` on purpose — that one resolves a real
 * instant through Europe/Prague, this one reads a bare calendar day, and
 * importing the wrong one would silently shift a day.
 */
export function weekdayLabelForDay(day: string): string {
  const iso = ((new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return WEEKDAYS[iso]!;
}

/** Weekend check for a bare calendar day — see `weekdayLabelForDay`. */
export function isWeekendDay(day: string): boolean {
  const dow = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}
