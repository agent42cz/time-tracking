/**
 * Auto-stack save service (US-64..US-76).
 *
 * Locks the user's affected entries with SELECT ... FOR UPDATE, re-reads
 * inside the transaction, calls planAutoStack, applies the plan, writes
 * one audit row per shifted entry plus one for the candidate write, and
 * publishes a time_entry event per changed entry.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { getPeriodRange } from '@tt/shared/time';
import { writeAudit } from './audit.js';
import { publishTimeEntry } from '../realtime.js';
import {
  CandidateEndsInFutureError,
  type Candidate,
  type Direction,
  type Plan,
  planAutoStack,
} from './auto-stack.js';

const WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CASCADE_EDGE_BUFFER_MS = 60 * 60 * 1000;

// Backward cascade is constrained to the candidate's calendar day so it
// can't reach into previous days and rewrite history. Forward keeps the
// 7-day window since pushing into the next day is the intended overflow.
function computeWindow(
  direction: Direction,
  candidateStartedAt: Date,
): {
  windowStart: Date;
  windowEnd: Date;
} {
  if (direction === 'backward') {
    const today = getPeriodRange('today', candidateStartedAt);
    return { windowStart: today.start, windowEnd: today.end };
  }
  return {
    windowStart: new Date(candidateStartedAt.getTime() - WINDOW_DAYS * MS_PER_DAY),
    windowEnd: new Date(candidateStartedAt.getTime() + WINDOW_DAYS * MS_PER_DAY),
  };
}

export type SaveAutoStackResult =
  | { ok: true; candidateId: string; plan: Plan }
  | {
      ok: false;
      reason: 'not_found' | 'invalid_window' | 'future_timestamp' | 'cascade_window_exceeded';
    };

export interface SaveAutoStackInput {
  actorUserId: string;
  companyId: string;
  candidate: Candidate;
  direction: Direction;
  now: Date;
}

export async function saveEntryWithAutoStack(
  prisma: PrismaClient,
  input: SaveAutoStackInput,
): Promise<SaveAutoStackResult> {
  return prisma.$transaction(async (tx) => {
    return runInTx(tx, input);
  });
}

async function runInTx(
  tx: Prisma.TransactionClient,
  input: SaveAutoStackInput,
): Promise<SaveAutoStackResult> {
  const { actorUserId, companyId, candidate, direction, now } = input;

  const { windowStart, windowEnd } = computeWindow(direction, candidate.startedAt);

  // Cross-company / not-found check for edit/stop kinds.
  if (candidate.kind !== 'create') {
    const existing = await tx.timeEntry.findFirst({
      where: { id: candidate.id, userId: actorUserId, companyId, deletedAt: null },
      select: { id: true, endedAt: true },
    });
    if (existing === null) {
      return { ok: false, reason: 'not_found' };
    }
    if (candidate.kind === 'stop' && existing.endedAt !== null) {
      // Stopping an already-stopped entry → not_found (idempotent semantics).
      return { ok: false, reason: 'not_found' };
    }
  }

  // Lock the user's closed entries in the window.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM time_entries
    WHERE user_id = ${actorUserId}
      AND company_id = ${companyId}
      AND deleted_at IS NULL
      AND ended_at IS NOT NULL
      AND started_at >= ${windowStart}
      AND started_at < ${windowEnd}
    FOR UPDATE
  `;

  // Re-read the locked set as authoritative.
  const existingRows = await tx.timeEntry.findMany({
    where: {
      userId: actorUserId,
      companyId,
      deletedAt: null,
      endedAt: { not: null },
      startedAt: { gte: windowStart, lt: windowEnd },
    },
    select: { id: true, startedAt: true, endedAt: true },
    orderBy: { startedAt: 'asc' },
  });

  let plan: Plan;
  try {
    plan = planAutoStack({
      candidate,
      existing: existingRows.map((e) => ({
        id: e.id,
        startedAt: e.startedAt,
        endedAt: e.endedAt as Date,
      })),
      now,
      direction,
    });
  } catch (err) {
    if (err instanceof CandidateEndsInFutureError) {
      return { ok: false, reason: 'future_timestamp' };
    }
    throw err;
  }

  // Cascade-window check: bail if any shift lands within 1 hour of either edge.
  for (const s of plan.shifts) {
    if (
      s.after.startedAt.getTime() < windowStart.getTime() + CASCADE_EDGE_BUFFER_MS ||
      s.after.endedAt.getTime() > windowEnd.getTime() - CASCADE_EDGE_BUFFER_MS
    ) {
      return { ok: false, reason: 'cascade_window_exceeded' };
    }
  }

  // Apply the plan.
  let candidateId: string;
  if (candidate.kind === 'create') {
    const created = await tx.timeEntry.create({
      data: {
        userId: actorUserId,
        companyId,
        description: '',
        startedAt: plan.candidateAfter.startedAt,
        endedAt: plan.candidateAfter.endedAt,
      },
      select: { id: true },
    });
    candidateId = created.id;
    await writeAudit(tx, {
      companyId,
      actorUserId,
      action: 'create',
      entityType: 'time_entry',
      entityId: candidateId,
      after: {
        startedAt: plan.candidateAfter.startedAt.toISOString(),
        endedAt: plan.candidateAfter.endedAt.toISOString(),
      },
    });
    await publishTimeEntry('time_entry.created', {
      userId: actorUserId,
      companyId,
      entryId: candidateId,
    });
  } else {
    candidateId = candidate.id;
    const before = await tx.timeEntry.findFirstOrThrow({
      where: { id: candidateId, userId: actorUserId, companyId },
      select: { startedAt: true, endedAt: true },
    });
    const updated = await tx.timeEntry.updateMany({
      where: { id: candidateId, userId: actorUserId, companyId },
      data: {
        startedAt: plan.candidateAfter.startedAt,
        endedAt: plan.candidateAfter.endedAt,
      },
    });
    if (updated.count !== 1) throw new Error('candidate update affected wrong row count');
    await writeAudit(tx, {
      companyId,
      actorUserId,
      action: 'update',
      entityType: 'time_entry',
      entityId: candidateId,
      before: {
        startedAt: before.startedAt.toISOString(),
        endedAt: before.endedAt?.toISOString() ?? null,
      },
      after: {
        startedAt: plan.candidateAfter.startedAt.toISOString(),
        endedAt: plan.candidateAfter.endedAt.toISOString(),
      },
    });
    await publishTimeEntry(candidate.kind === 'stop' ? 'timer.stopped' : 'time_entry.updated', {
      userId: actorUserId,
      companyId,
      entryId: candidateId,
    });
  }

  for (const s of plan.shifts) {
    const shifted = await tx.timeEntry.updateMany({
      where: { id: s.entryId, userId: actorUserId, companyId },
      data: { startedAt: s.after.startedAt, endedAt: s.after.endedAt },
    });
    if (shifted.count !== 1) throw new Error('shift update affected wrong row count');
    await writeAudit(tx, {
      companyId,
      actorUserId,
      action: 'shift',
      entityType: 'time_entry',
      entityId: s.entryId,
      before: {
        startedAt: s.before.startedAt.toISOString(),
        endedAt: s.before.endedAt.toISOString(),
      },
      after: {
        startedAt: s.after.startedAt.toISOString(),
        endedAt: s.after.endedAt.toISOString(),
        direction: plan.direction,
        triggeredBy: candidateId,
      },
    });
    await publishTimeEntry('time_entry.updated', {
      userId: actorUserId,
      companyId,
      entryId: s.entryId,
    });
  }

  return { ok: true, candidateId, plan };
}

/**
 * Read-only preview — same window read, same plan, no writes.
 */
export async function previewAutoStack(
  prisma: PrismaClient,
  input: SaveAutoStackInput,
): Promise<SaveAutoStackResult> {
  const { actorUserId, companyId, candidate, direction, now } = input;
  const { windowStart, windowEnd } = computeWindow(direction, candidate.startedAt);

  if (candidate.kind !== 'create') {
    const existing = await prisma.timeEntry.findFirst({
      where: { id: candidate.id, userId: actorUserId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (existing === null) return { ok: false, reason: 'not_found' };
  }

  const existingRows = await prisma.timeEntry.findMany({
    where: {
      userId: actorUserId,
      companyId,
      deletedAt: null,
      endedAt: { not: null },
      startedAt: { gte: windowStart, lt: windowEnd },
    },
    select: { id: true, startedAt: true, endedAt: true },
    orderBy: { startedAt: 'asc' },
  });

  let plan: Plan;
  try {
    plan = planAutoStack({
      candidate,
      existing: existingRows.map((e) => ({
        id: e.id,
        startedAt: e.startedAt,
        endedAt: e.endedAt as Date,
      })),
      now,
      direction,
    });
  } catch (err) {
    if (err instanceof CandidateEndsInFutureError) {
      return { ok: false, reason: 'future_timestamp' };
    }
    throw err;
  }

  // Cascade-window check: bail if any shift lands within 1 hour of either edge.
  for (const s of plan.shifts) {
    if (
      s.after.startedAt.getTime() < windowStart.getTime() + CASCADE_EDGE_BUFFER_MS ||
      s.after.endedAt.getTime() > windowEnd.getTime() - CASCADE_EDGE_BUFFER_MS
    ) {
      return { ok: false, reason: 'cascade_window_exceeded' };
    }
  }

  return {
    ok: true,
    candidateId: candidate.kind === 'create' ? '' : candidate.id,
    plan,
  };
}
