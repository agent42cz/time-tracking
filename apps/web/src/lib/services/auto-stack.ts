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

export type Direction = 'forward' | 'backward' | 'manual';

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

export class InvalidManualStartError extends Error {
  constructor() {
    super('Manual start is missing or not before the candidate end');
  }
}

const FUTURE_GRACE_MS = 60_000;

type WorkingEntry = { id: string; startedAt: Date; endedAt: Date };

export function planAutoStack(input: {
  candidate: Candidate;
  existing: ClosedEntry[];
  now: Date;
  direction: Direction;
  manualStartedAt?: Date;
}): Plan {
  const { candidate, existing, now, direction, manualStartedAt } = input;

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
  } else if (direction === 'backward') {
    // backward — dock to the earliest-startedAt entry that overlaps the
    // candidate (no requirement that it start before the candidate). The
    // candidate then ends at the dock's startedAt, and every other entry
    // chronologically before that point gets compacted backward against
    // the candidate's new left edge.
    let dockEntry: WorkingEntry | null = null;
    for (const e of working) {
      if (e.id === candidateId) continue;
      const overlaps =
        e.endedAt.getTime() > candidateEntry.startedAt.getTime() &&
        e.startedAt.getTime() < candidateEntry.endedAt.getTime();
      if (!overlaps) continue;
      if (dockEntry === null || e.startedAt.getTime() < dockEntry.startedAt.getTime()) {
        dockEntry = e;
      }
    }

    if (dockEntry !== null) {
      const candidateDuration =
        candidateEntry.endedAt.getTime() - candidateEntry.startedAt.getTime();
      const newCandidateEnd = new Date(dockEntry.startedAt);
      const newCandidateStart = new Date(dockEntry.startedAt.getTime() - candidateDuration);
      const candidateIdx = working.findIndex((e) => e.id === candidateId);
      working[candidateIdx] = {
        id: candidateId,
        startedAt: newCandidateStart,
        endedAt: newCandidateEnd,
      };

      // Compact every other entry whose startedAt is before the candidate's
      // new endedAt — i.e., the chain that must fit before the candidate.
      // Process them in descending startedAt order, anchoring each one
      // against the previous (closer-to-candidate) entry.
      const chain = working
        .filter(
          (e) =>
            e.id !== candidateId &&
            e.id !== dockEntry!.id &&
            e.startedAt.getTime() < newCandidateEnd.getTime(),
        )
        .sort((a, b) => {
          const cmp = b.startedAt.getTime() - a.startedAt.getTime();
          if (cmp !== 0) return cmp;
          return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        });

      let anchor = newCandidateStart;
      for (const entry of chain) {
        if (entry.endedAt.getTime() > anchor.getTime()) {
          const duration = entry.endedAt.getTime() - entry.startedAt.getTime();
          const newEnd = new Date(anchor);
          const newStart = new Date(anchor.getTime() - duration);
          const idx = working.findIndex((e) => e.id === entry.id);
          working[idx] = { id: entry.id, startedAt: newStart, endedAt: newEnd };
          anchor = newStart;
        } else {
          anchor = entry.startedAt;
        }
      }

      working.sort((a, b) => {
        const cmp = a.startedAt.getTime() - b.startedAt.getTime();
        if (cmp !== 0) return cmp;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    }
    // If no dockEntry: candidate stays, no shifts. (Truly no overlap.)
  } else {
    // manual — candidate is pinned at [manualStartedAt, candidate.endedAt] and
    // does not move. Every other entry that starts before the candidate's end
    // is compacted backward, preserving its duration, anchored at the manual
    // start.
    if (
      manualStartedAt === undefined ||
      manualStartedAt.getTime() >= candidateEntry.endedAt.getTime()
    ) {
      throw new InvalidManualStartError();
    }
    const pinnedEnd = candidateEntry.endedAt;
    const candidateIdx = working.findIndex((e) => e.id === candidateId);
    working[candidateIdx] = {
      id: candidateId,
      startedAt: new Date(manualStartedAt),
      endedAt: new Date(pinnedEnd),
    };

    const chain = working
      .filter((e) => e.id !== candidateId && e.startedAt.getTime() < pinnedEnd.getTime())
      .sort((a, b) => {
        const cmp = b.endedAt.getTime() - a.endedAt.getTime();
        if (cmp !== 0) return cmp;
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      });

    let anchor = new Date(manualStartedAt);
    for (const entry of chain) {
      if (entry.endedAt.getTime() > anchor.getTime()) {
        const duration = entry.endedAt.getTime() - entry.startedAt.getTime();
        const newEnd = new Date(anchor);
        const newStart = new Date(anchor.getTime() - duration);
        const idx = working.findIndex((e) => e.id === entry.id);
        working[idx] = { id: entry.id, startedAt: newStart, endedAt: newEnd };
        anchor = newStart;
      } else {
        anchor = entry.startedAt;
      }
    }

    working.sort((a, b) => {
      const cmp = a.startedAt.getTime() - b.startedAt.getTime();
      if (cmp !== 0) return cmp;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
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
