import { AuditAction } from '@prisma/client';

/**
 * Every action the audit log can record. Derived from the Prisma enum rather
 * than hand-maintained — the old hardcoded list had silently drifted, omitting
 * `reorder` and `shift` (both actively written by catalog.ts and
 * auto-stack-save.ts), so those rows showed up in the unfiltered table but
 * could not be filtered for. Pinned by a test (US-99).
 *
 * Kept out of `page.tsx` so tests can import it without dragging in
 * `next/headers` via `@/lib/session`.
 */
export const ALL_ACTIONS: AuditAction[] = Object.values(AuditAction);
