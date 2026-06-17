import type { NextRequest } from 'next/server';
import { errorCors } from './cors.js';
import type { ApiSession } from './auth.js';
import { prisma } from '../session.js';
import type { Candidate, Direction, Plan } from '../services/auto-stack.js';

const VALID_DIRECTIONS = ['forward', 'backward', 'manual'] as const;

export interface ParsedAutoStackRequest {
  candidate: Candidate;
  companyId: string;
  direction: Direction;
  manualStartedAt?: Date;
}

export type ParseOutcome =
  | { ok: true; value: ParsedAutoStackRequest }
  | { ok: false; response: Response };

/**
 * Parse + validate an auto-stack request body and resolve the target entry
 * for this user. Returns either the parsed inputs (entry resolved to an
 * `edit` candidate) or a ready CORS error Response. A cross-company or
 * unknown id resolves to a 404 `not_found` (no existence leak).
 */
export async function parseAutoStackRequest(
  req: NextRequest,
  session: ApiSession,
  id: string,
): Promise<ParseOutcome> {
  let body: { direction?: unknown; startedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: errorCors(req, 400, 'invalid_json') };
  }
  if (!VALID_DIRECTIONS.includes(body.direction as (typeof VALID_DIRECTIONS)[number])) {
    return { ok: false, response: errorCors(req, 400, 'invalid_input') };
  }
  const direction = body.direction as Direction;

  const entry = await prisma().timeEntry.findFirst({
    where: { id, userId: session.userId, deletedAt: null },
    select: { companyId: true, startedAt: true, endedAt: true },
  });
  if (!entry || !entry.endedAt) {
    return { ok: false, response: errorCors(req, 404, 'not_found') };
  }

  let manualStartedAt: Date | undefined;
  if (direction === 'manual') {
    if (typeof body.startedAt !== 'string') {
      return { ok: false, response: errorCors(req, 400, 'invalid_input') };
    }
    manualStartedAt = new Date(body.startedAt);
    if (Number.isNaN(manualStartedAt.getTime())) {
      return { ok: false, response: errorCors(req, 400, 'invalid_input') };
    }
  }

  return {
    ok: true,
    value: {
      candidate: { kind: 'edit', id, startedAt: entry.startedAt, endedAt: entry.endedAt },
      companyId: entry.companyId,
      direction,
      manualStartedAt,
    },
  };
}

export function planToWire(plan: Plan): unknown {
  return {
    direction: plan.direction,
    shifts: plan.shifts.map((s) => ({
      entryId: s.entryId,
      before: {
        startedAt: s.before.startedAt.toISOString(),
        endedAt: s.before.endedAt.toISOString(),
      },
      after: { startedAt: s.after.startedAt.toISOString(), endedAt: s.after.endedAt.toISOString() },
    })),
    candidateAfter: {
      startedAt: plan.candidateAfter.startedAt.toISOString(),
      endedAt: plan.candidateAfter.endedAt.toISOString(),
    },
  };
}
