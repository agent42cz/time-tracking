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

export function planAutoStack(_input: {
  candidate: Candidate;
  existing: ClosedEntry[];
  now: Date;
  direction: Direction;
}): Plan {
  throw new Error('not implemented');
}
