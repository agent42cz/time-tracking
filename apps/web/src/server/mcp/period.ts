import { z } from 'zod';
import { parseInclusiveAppZoneRange } from '@tt/shared/time';

/** A real calendar day as `YYYY-MM-DD` (rejects e.g. `2026-02-31`). */
export const dayInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, 'Not a calendar day.');

/**
 * Inclusive Europe/Prague days → half-open `[from, to)` instants, exactly as the
 * /reports page reads its `from`/`to` params. `null` when `to` is before `from`.
 */
export function parseDayRange(from?: string, to?: string): { from?: Date; to?: Date } | null {
  if (from && to && to < from) return null;
  return parseInclusiveAppZoneRange(from, to);
}
