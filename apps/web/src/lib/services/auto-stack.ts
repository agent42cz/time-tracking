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
    // backward — find first earlier-overlapping entry with startedAt <= candidate.startedAt
    const candidateIdx = working.findIndex((e) => e.id === candidateId);
    let dockEntry: WorkingEntry | null = null;
    for (let i = candidateIdx - 1; i >= 0; i--) {
      const earlier = working[i]!;
      const overlaps =
        earlier.endedAt.getTime() > candidateEntry.startedAt.getTime() &&
        earlier.startedAt.getTime() < candidateEntry.endedAt.getTime();
      if (earlier.startedAt.getTime() <= candidateEntry.startedAt.getTime() && overlaps) {
        dockEntry = earlier;
        break;
      }
    }

    if (dockEntry !== null) {
      const candidateDuration =
        candidateEntry.endedAt.getTime() - candidateEntry.startedAt.getTime();
      const newCandidateEnd = new Date(dockEntry.startedAt);
      const newCandidateStart = new Date(dockEntry.startedAt.getTime() - candidateDuration);
      working[candidateIdx] = {
        id: candidateId,
        startedAt: newCandidateStart,
        endedAt: newCandidateEnd,
      };
      working.sort((a, b) => {
        const cmp = a.startedAt.getTime() - b.startedAt.getTime();
        if (cmp !== 0) return cmp;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      // Walk backward from new candidate position; cascade earlier entries.
      const newCandidateIdx = working.findIndex((e) => e.id === candidateId);
      for (let i = newCandidateIdx - 1; i >= 0; i--) {
        const curr = working[i]!;
        const succ = working[i + 1]!;
        if (curr.endedAt.getTime() > succ.startedAt.getTime()) {
          const duration = curr.endedAt.getTime() - curr.startedAt.getTime();
          working[i] = {
            id: curr.id,
            startedAt: new Date(succ.startedAt.getTime() - duration),
            endedAt: new Date(succ.startedAt),
          };
        }
      }
    }
    // If no dockEntry: candidate stays, no shifts. (backward degeneracy.)
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
  // Forward: ascending by after.startedAt (shifts push entries later).
  // Backward: descending by after.startedAt (shifts pull entries earlier, cascade order).
  if (direction === 'forward') {
    shifts.sort((a, b) => a.after.startedAt.getTime() - b.after.startedAt.getTime());
  } else {
    shifts.sort((a, b) => b.after.startedAt.getTime() - a.after.startedAt.getTime());
  }

  return {
    direction,
    shifts,
    candidateAfter: { startedAt: finalCandidate.startedAt, endedAt: finalCandidate.endedAt },
  };
}
