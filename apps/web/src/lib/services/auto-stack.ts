/**
 * Auto-stack planner (US-64..US-76).
 *
 * Pure function. Takes a candidate write and the user's existing closed
 * entries for the affected window and returns a Plan describing every
 * shift. The DB-aware caller applies the plan inside a transaction.
 *
 * Direction is per-save:
 *  - forward: candidate stays put, later overlapping entries shift later
 *  - backward: candidate shifts earlier (endedAt = first earlier-overlapping
 *    entry's startedAt); earlier overlapping entries shift earlier
 *
 * Running timers (endedAt IS NULL) are never passed in via `existing`.
 */

export type ClosedEntry = {
  id: string;
  startedAt: Date;
  endedAt: Date;
};

export type Candidate =
  | { kind: 'create'; startedAt: Date; endedAt: Date }
  | { kind: 'edit'; id: string; startedAt: Date; endedAt: Date }
  | { kind: 'stop'; id: string; startedAt: Date; endedAt: Date };

export type Direction = 'forward' | 'backward';

export type Shift = {
  entryId: string;
  before: { startedAt: Date; endedAt: Date };
  after: { startedAt: Date; endedAt: Date };
};

export type Plan = {
  direction: Direction;
  shifts: Shift[];
  candidateAfter: { startedAt: Date; endedAt: Date };
};

export class CandidateEndsInFutureError extends Error {
  constructor() {
    super('Candidate endedAt is in the future');
  }
}

const FUTURE_GRACE_MS = 60_000;

type WorkingEntry = { id: string; startedAt: Date; endedAt: Date };

export function planAutoStack(input: {
  candidate: Candidate;
  existing: ClosedEntry[];
  now: Date;
  direction: Direction;
}): Plan {
  const { candidate, existing, now, direction } = input;

  if (candidate.endedAt.getTime() > now.getTime() + FUTURE_GRACE_MS) {
    throw new CandidateEndsInFutureError();
  }

  const candidateId = candidate.kind === 'create' ? '' : candidate.id;
  const filtered = existing.filter((e) => e.id !== candidateId);
  const candidateEntry: WorkingEntry = {
    id: candidateId,
    startedAt: candidate.startedAt,
    endedAt: candidate.endedAt,
  };

  const working: WorkingEntry[] = [...filtered, candidateEntry].sort((a, b) => {
    const cmp = a.startedAt.getTime() - b.startedAt.getTime();
    if (cmp !== 0) return cmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const originalById = new Map<string, { startedAt: Date; endedAt: Date }>();
  for (const e of filtered) originalById.set(e.id, { startedAt: e.startedAt, endedAt: e.endedAt });

  if (direction === 'forward') {
    const candidateIdx = working.findIndex((e) => e.id === candidateId);
    for (let i = candidateIdx; i < working.length; i++) {
      if (i === 0) continue;
      const prev = working[i - 1]!;
      const curr = working[i]!;
      if (curr.startedAt.getTime() < prev.endedAt.getTime()) {
        const duration = curr.endedAt.getTime() - curr.startedAt.getTime();
        working[i] = {
          id: curr.id,
          startedAt: new Date(prev.endedAt),
          endedAt: new Date(prev.endedAt.getTime() + duration),
        };
      }
    }
  } else {
    // backward — implemented in Task 5
    throw new Error('backward not yet implemented');
  }

  const finalCandidate = working.find((e) => e.id === candidateId)!;
  const shifts: Shift[] = [];
  for (const e of working) {
    if (e.id === candidateId) continue;
    const orig = originalById.get(e.id)!;
    if (
      e.startedAt.getTime() !== orig.startedAt.getTime() ||
      e.endedAt.getTime() !== orig.endedAt.getTime()
    ) {
      shifts.push({
        entryId: e.id,
        before: { startedAt: orig.startedAt, endedAt: orig.endedAt },
        after: { startedAt: e.startedAt, endedAt: e.endedAt },
      });
    }
  }
  shifts.sort((a, b) => a.after.startedAt.getTime() - b.after.startedAt.getTime());

  return {
    direction,
    shifts,
    candidateAfter: { startedAt: finalCandidate.startedAt, endedAt: finalCandidate.endedAt },
  };
}
