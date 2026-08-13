/**
 * Nepřítomnost — who is away, when, and has the admin seen it yet.
 *
 * Audit payloads carry the dates and the owner, never `kind` or `note`. The
 * reason for an absence is health-adjacent personal data (`sick`, `doctor`,
 * and whatever someone types into the note); audit rows are immutable, kept
 * after the absence itself is deleted, and readable by every admin — so the
 * log records *that* a notice changed and for which days, not why someone was
 * ill. Do not add them back without an ADR.
 *
 * Two things make this more than a CRUD table:
 *
 *  - **Lead time.** A notice must arrive at least a day ahead. That is the
 *    only rule; the arithmetic lives in `@tt/shared`
 *    (`validateAbsenceDates`) and is unit-tested there.
 *  - **Seen state.** The nav badge counts absences the viewer has no
 *    `AbsenceRead` row for. Opening one, or acknowledging the lot, writes the
 *    rows. Editing an absence deletes them again so the change re-notifies.
 *
 * Everything is company-scoped through `Membership`, so a cross-company id is
 * `not_found`, never `forbidden` (constitution §3).
 */
import type { Absence, AbsenceKind, Prisma, PrismaClient, Role } from '@prisma/client';
import {
  appZoneDay,
  now,
  dateToDay,
  dayToDate,
  isAbsenceKind,
  isDayString,
  validateAbsenceDates,
  type AbsenceRuleError,
  type DayString,
} from '@tt/shared';
import { writeAudit } from './audit.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type Result<T, R extends string = 'not_found'> =
  | { ok: true; value: T }
  | { ok: false; reason: R };

export type AbsenceError = 'not_found' | 'invalid' | 'rate_limited' | AbsenceRuleError;

/**
 * Ceiling on new notices per author per hour. Nobody plans twenty absences in
 * an hour by hand, so this only ever catches a runaway client or a script —
 * the one unbounded write path this feature adds. Counted straight off
 * `absences.created_at` rather than a new table: the window is short and the
 * scan is already scoped to one user's rows.
 */
export const ABSENCE_MAX_PER_HOUR = 20;
const ABSENCE_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface AbsenceView {
  id: string;
  userId: string;
  userName: string;
  kind: AbsenceKind;
  startDate: DayString;
  endDate: DayString;
  note: string;
  /** The viewer has an `AbsenceRead` row (or wrote the absence themselves). */
  seen: boolean;
  createdAt: Date;
}

/** How much of the company an absence reader may see. */
async function membershipOf(
  db: Db,
  userId: string,
  companyId: string,
): Promise<{ role: Role } | null> {
  const m = await db.membership.findUnique({ where: { userId_companyId: { userId, companyId } } });
  return m ? { role: m.role } : null;
}

interface AbsenceRow {
  id: string;
  userId: string;
  kind: AbsenceKind;
  startDate: Date;
  endDate: Date;
  note: string;
  createdAt: Date;
  user: { fullName: string };
  reads: { userId: string }[];
}

function toView(row: AbsenceRow, viewerId: string): AbsenceView {
  const startDate = dateToDay(row.startDate);
  const endDate = dateToDay(row.endDate);
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.fullName,
    kind: row.kind,
    startDate,
    endDate,
    note: row.note,
    seen: row.userId === viewerId || row.reads.length > 0,
    createdAt: row.createdAt,
  };
}

/**
 * The write gate: the author may touch their own notice, an admin may fix
 * anyone's in their company, everyone else — including another company — gets
 * `not_found` rather than a 403 (constitution §3, no existence leaks).
 */
async function loadWritable(
  db: Db,
  actorUserId: string,
  absenceId: string,
): Promise<Result<Absence, AbsenceError>> {
  const existing = await db.absence.findUnique({ where: { id: absenceId } });
  if (!existing) return { ok: false, reason: 'not_found' };
  const membership = await membershipOf(db, actorUserId, existing.companyId);
  if (!membership) return { ok: false, reason: 'not_found' };
  if (existing.userId !== actorUserId && membership.role !== 'admin')
    return { ok: false, reason: 'not_found' };
  return { ok: true, value: existing };
}

/**
 * `reads` is filtered to the viewer on purpose: `toView` only asks "did *I*
 * acknowledge this", so fetching every colleague's row would grow the payload
 * with company headcount for a boolean.
 */
function withViewer(viewerId: string) {
  return {
    user: { select: { fullName: true } },
    reads: { where: { userId: viewerId }, select: { userId: true } },
  };
}

export async function createAbsence(
  db: Db,
  actorUserId: string,
  input: {
    companyId: string;
    kind: string;
    startDate: string;
    endDate: string;
    note?: string;
  },
  /**
   * Today's Prague day, as a *separate* parameter. It must never be reachable
   * from `input`: a server action deserializes its arguments straight from the
   * client, TypeScript types are erased at runtime, and a caller-supplied
   * "today" would let anyone backdate a notice past the lead-time rule.
   */
  today: DayString = appZoneDay(),
): Promise<Result<{ id: string }, AbsenceError>> {
  const membership = await membershipOf(db, actorUserId, input.companyId);
  if (!membership) return { ok: false, reason: 'not_found' };
  if (!isAbsenceKind(input.kind)) return { ok: false, reason: 'invalid' };

  const check = validateAbsenceDates(today, input.startDate, input.endDate);
  if (!check.ok) return { ok: false, reason: check.error ?? 'invalid' };

  const note = (input.note ?? '').trim();
  if (note.length > 500) return { ok: false, reason: 'invalid' };

  const recent = await db.absence.count({
    where: {
      userId: actorUserId,
      createdAt: { gte: new Date(now().getTime() - ABSENCE_RATE_WINDOW_MS) },
    },
  });
  if (recent >= ABSENCE_MAX_PER_HOUR) return { ok: false, reason: 'rate_limited' };

  const created = await db.absence.create({
    data: {
      companyId: input.companyId,
      userId: actorUserId,
      kind: input.kind,
      startDate: dayToDate(input.startDate),
      endDate: dayToDate(input.endDate),
      note,
    },
  });
  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'create',
    entityType: 'absence',
    entityId: created.id,
    after: { startDate: input.startDate, endDate: input.endDate },
  });
  return { ok: true, value: { id: created.id } };
}

export async function updateAbsence(
  db: Db,
  actorUserId: string,
  absenceId: string,
  patch: { kind?: string; startDate?: string; endDate?: string; note?: string },
  /** Separate from `patch` for the reason spelled out on `createAbsence`. */
  today: DayString = appZoneDay(),
): Promise<Result<true, AbsenceError>> {
  const writable = await loadWritable(db, actorUserId, absenceId);
  if (!writable.ok) return writable;
  const existing = writable.value;

  const kind = patch.kind ?? existing.kind;
  if (!isAbsenceKind(kind)) return { ok: false, reason: 'invalid' };
  const startDate = patch.startDate ?? dateToDay(existing.startDate);
  const endDate = patch.endDate ?? dateToDay(existing.endDate);
  const check = validateAbsenceDates(today, startDate, endDate);
  if (!check.ok) return { ok: false, reason: check.error ?? 'invalid' };
  const note = (patch.note ?? existing.note).trim();
  if (note.length > 500) return { ok: false, reason: 'invalid' };

  await db.absence.update({
    where: { id: absenceId },
    data: { kind, startDate: dayToDate(startDate), endDate: dayToDate(endDate), note },
  });
  // The entry changed, so everyone who already acknowledged it must see it
  // again — otherwise a "moved to next week" edit would land silently.
  await db.absenceRead.deleteMany({ where: { absenceId } });

  await writeAudit(db, {
    companyId: existing.companyId,
    actorUserId,
    action: 'update',
    entityType: 'absence',
    entityId: absenceId,
    before: { startDate: dateToDay(existing.startDate), endDate: dateToDay(existing.endDate) },
    after: { startDate, endDate },
  });
  return { ok: true, value: true };
}

export async function deleteAbsence(
  db: Db,
  actorUserId: string,
  absenceId: string,
): Promise<Result<true, AbsenceError>> {
  const writable = await loadWritable(db, actorUserId, absenceId);
  if (!writable.ok) return writable;
  const existing = writable.value;

  await db.absence.delete({ where: { id: absenceId } });
  await writeAudit(db, {
    companyId: existing.companyId,
    actorUserId,
    action: 'delete',
    entityType: 'absence',
    entityId: absenceId,
    before: {
      userId: existing.userId,
      startDate: dateToDay(existing.startDate),
      endDate: dateToDay(existing.endDate),
    },
  });
  return { ok: true, value: true };
}

/**
 * Admins see the whole company; members see only their own rows. `from`/`to`
 * are inclusive calendar days; omit them for "everything from today on".
 */
export async function listAbsences(
  db: Db,
  viewerId: string,
  companyId: string,
  opts: { from?: DayString; to?: DayString; today?: DayString } = {},
): Promise<Result<AbsenceView[], AbsenceError>> {
  const membership = await membershipOf(db, viewerId, companyId);
  if (!membership) return { ok: false, reason: 'not_found' };
  const today = opts.today ?? appZoneDay();
  const from = opts.from ?? today;
  if (!isDayString(from)) return { ok: false, reason: 'invalid_day' };
  if (opts.to !== undefined && !isDayString(opts.to)) return { ok: false, reason: 'invalid_day' };

  const rows = await db.absence.findMany({
    where: {
      companyId,
      ...(membership.role === 'admin' ? {} : { userId: viewerId }),
      // Overlap, not containment: a holiday that started last week and runs
      // into the window still means the person is away.
      endDate: { gte: dayToDate(from) },
      ...(opts.to ? { startDate: { lte: dayToDate(opts.to) } } : {}),
    },
    include: withViewer(viewerId),
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  });
  return { ok: true, value: rows.map((r) => toView(r, viewerId)) };
}

/** Past absences, newest first — the "co bylo" tab. */
export async function listPastAbsences(
  db: Db,
  viewerId: string,
  companyId: string,
  opts: { today?: DayString; limit?: number } = {},
): Promise<Result<AbsenceView[], AbsenceError>> {
  const membership = await membershipOf(db, viewerId, companyId);
  if (!membership) return { ok: false, reason: 'not_found' };
  const today = opts.today ?? appZoneDay();
  const rows = await db.absence.findMany({
    where: {
      companyId,
      ...(membership.role === 'admin' ? {} : { userId: viewerId }),
      endDate: { lt: dayToDate(today) },
    },
    include: withViewer(viewerId),
    orderBy: [{ startDate: 'desc' }],
    take: opts.limit ?? 50,
  });
  return { ok: true, value: rows.map((r) => toView(r, viewerId)) };
}

/**
 * What the badge counts and what "Označit vše jako přečtené" clears — one
 * predicate, so the number on the button can never disagree with the number of
 * rows it marks.
 */
function unseenWhere(
  companyId: string,
  viewerId: string,
  today: DayString,
): Prisma.AbsenceWhereInput {
  return {
    companyId,
    userId: { not: viewerId },
    // Something that already finished is no longer news.
    endDate: { gte: dayToDate(today) },
    reads: { none: { userId: viewerId } },
  };
}

/**
 * The badge number: absences the viewer hasn't acknowledged and didn't write.
 * Members only ever see their own rows, so their badge is always 0 — the
 * notification exists for whoever reads other people's notices.
 */
export async function countUnseenAbsences(
  db: Db,
  viewerId: string,
  companyId: string,
  opts: { today?: DayString } = {},
): Promise<number> {
  const membership = await membershipOf(db, viewerId, companyId);
  if (!membership || membership.role !== 'admin') return 0;
  const today = opts.today ?? appZoneDay();
  return db.absence.count({ where: unseenWhere(companyId, viewerId, today) });
}

/** Acknowledge one absence — "already saw this". Idempotent. */
export async function markAbsenceSeen(
  db: Db,
  viewerId: string,
  absenceId: string,
): Promise<Result<true, AbsenceError>> {
  const visible = await loadWritable(db, viewerId, absenceId);
  if (!visible.ok) return visible;

  await db.absenceRead.upsert({
    where: { absenceId_userId: { absenceId, userId: viewerId } },
    create: { absenceId, userId: viewerId },
    update: {},
  });
  return { ok: true, value: true };
}

/** Acknowledge everything currently unseen — the "Vše přečteno" button. */
export async function markAllAbsencesSeen(
  db: Db,
  viewerId: string,
  companyId: string,
  opts: { today?: DayString } = {},
): Promise<Result<{ marked: number }, AbsenceError>> {
  const membership = await membershipOf(db, viewerId, companyId);
  if (!membership) return { ok: false, reason: 'not_found' };
  const today = opts.today ?? appZoneDay();
  const unseen = await db.absence.findMany({
    where: unseenWhere(companyId, viewerId, today),
    select: { id: true },
  });
  if (unseen.length > 0) {
    await db.absenceRead.createMany({
      data: unseen.map((a) => ({ absenceId: a.id, userId: viewerId })),
      skipDuplicates: true,
    });
  }
  return { ok: true, value: { marked: unseen.length } };
}

export interface WeekDayCell {
  day: DayString;
  kind: AbsenceKind;
  note: string;
}

export interface WeekMemberRow {
  userId: string;
  userName: string;
  /** One entry per absent day within the week, keyed by `yyyy-MM-dd`. */
  days: WeekDayCell[];
}

export interface WeekOverview {
  days: DayString[];
  members: WeekMemberRow[];
}

/**
 * Monday-morning view: the seven days of the week starting `weekStart`, and
 * who is away on each. Only members with at least one absent day appear.
 */
export async function getWeekOverview(
  db: Db,
  viewerId: string,
  companyId: string,
  weekStart: DayString,
): Promise<Result<WeekOverview, AbsenceError>> {
  const membership = await membershipOf(db, viewerId, companyId);
  if (!membership) return { ok: false, reason: 'not_found' };
  if (!isDayString(weekStart)) return { ok: false, reason: 'invalid_day' };

  const startMs = dayToDate(weekStart).getTime();
  const days: DayString[] = Array.from({ length: 7 }, (_, i) =>
    dateToDay(new Date(startMs + i * 86_400_000)),
  );
  const weekEnd = days[6]!;

  const rows = await db.absence.findMany({
    where: {
      companyId,
      ...(membership.role === 'admin' ? {} : { userId: viewerId }),
      startDate: { lte: dayToDate(weekEnd) },
      endDate: { gte: dayToDate(weekStart) },
    },
    include: { user: { select: { fullName: true } } },
    orderBy: [{ startDate: 'asc' }],
  });

  const byUser = new Map<string, WeekMemberRow>();
  for (const row of rows) {
    const entry = byUser.get(row.userId) ?? {
      userId: row.userId,
      userName: row.user.fullName,
      days: [],
    };
    for (const day of days) {
      if (day >= dateToDay(row.startDate) && day <= dateToDay(row.endDate)) {
        entry.days.push({ day, kind: row.kind, note: row.note });
      }
    }
    byUser.set(row.userId, entry);
  }
  const members = [...byUser.values()].sort((a, b) => a.userName.localeCompare(b.userName, 'cs'));
  return { ok: true, value: { days, members } };
}
