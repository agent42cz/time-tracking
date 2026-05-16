import { describe, expect, it } from 'vitest';
import {
  CandidateEndsInFutureError,
  planAutoStack,
  type ClosedEntry,
} from '../../src/lib/services/auto-stack.js';

const t = (hhmm: string): Date => new Date(`2026-05-16T${hhmm}:00.000Z`);

describe('planAutoStack — forward', () => {
  const now = t('23:59');

  it('US-66: empty existing returns no shifts', () => {
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('10:00') },
      existing: [],
      now,
      direction: 'forward',
    });
    expect(plan.shifts).toEqual([]);
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:00'), endedAt: t('10:00') });
    expect(plan.direction).toBe('forward');
  });

  it('US-67: single forward overlap shifts the candidate preserving its duration', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('09:00'), endedAt: t('10:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'forward',
    });
    // A starts before candidate. Sorted: [A, candidate]. Walk forward from candidate's
    // index. prev=A, curr=candidate. candidate.startedAt 09:30 < A.endedAt 10:00 →
    // candidate shifts to 10:00–11:00 (preserves 60 min duration). A unchanged.
    expect(plan.shifts).toEqual([]);
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:00') });
  });

  it('US-68: cascade through three entries', () => {
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:30'), endedAt: t('11:30') },
      { id: 'C', startedAt: t('12:00'), endedAt: t('13:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:45') },
      existing,
      now,
      direction: 'forward',
    });
    // sorted: A 09:00-10:00, candidate 09:30-10:45 (75min), B 10:30-11:30 (60min), C 12:00-13:00 (60min)
    // walk fwd from candidate (idx 1):
    //   candidate vs A: 09:30 < 10:00 → candidate to 10:00–11:15
    //   B vs candidate: 10:30 < 11:15 → B to 11:15–12:15 (preserves 60min)
    //   C vs B: 12:00 < 12:15 → C to 12:15–13:15 (preserves 60min)
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:15') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'B',
        before: { startedAt: t('10:30'), endedAt: t('11:30') },
        after: { startedAt: t('11:15'), endedAt: t('12:15') },
      },
      {
        entryId: 'C',
        before: { startedAt: t('12:00'), endedAt: t('13:00') },
        after: { startedAt: t('12:15'), endedAt: t('13:15') },
      },
    ]);
  });

  it('US-67: candidate placed inside larger entry shifts to existing.endedAt', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('09:00'), endedAt: t('11:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:00') },
      existing,
      now,
      direction: 'forward',
    });
    // candidate 09:30-10:00 (30min) inside A. Walk: candidate vs A → candidate to 11:00-11:30.
    expect(plan.candidateAfter).toEqual({ startedAt: t('11:00'), endedAt: t('11:30') });
    expect(plan.shifts).toEqual([]);
  });

  it('US-67: identical startedAt — tie-break by id ascending', () => {
    const existing: ClosedEntry[] = [{ id: 'Z', startedAt: t('09:00'), endedAt: t('10:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('10:00') },
      existing,
      now,
      direction: 'forward',
    });
    // Tie on startedAt. The candidate's effective id when 'create' is the empty string,
    // which sorts before 'Z'. Sorted: [candidate, Z]. Walk fwd:
    //   Z vs candidate: Z.startedAt 09:00 < candidate.endedAt 10:00 → Z shifts to 10:00–11:00.
    // Candidate stays at 09:00-10:00.
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:00'), endedAt: t('10:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'Z',
        before: { startedAt: t('09:00'), endedAt: t('10:00') },
        after: { startedAt: t('10:00'), endedAt: t('11:00') },
      },
    ]);
  });

  it('US-74: cascade pushing final entry past now still succeeds', () => {
    const fixedNow = t('11:00');
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:00'), endedAt: t('11:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now: fixedNow,
      direction: 'forward',
    });
    // sorted: A 09-10, candidate 09:30-10:30 (60min), B 10-11
    // walk: candidate vs A → candidate 10:00-11:00. B vs candidate → B 11:00-12:00
    // B.endedAt (12:00) > now (11:00) — allowed.
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'B',
        before: { startedAt: t('10:00'), endedAt: t('11:00') },
        after: { startedAt: t('11:00'), endedAt: t('12:00') },
      },
    ]);
  });

  it('throws CandidateEndsInFutureError when candidate.endedAt > now', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('23:00') },
        existing: [],
        now: t('10:00'),
        direction: 'forward',
      }),
    ).toThrow(CandidateEndsInFutureError);
  });

  it('US-71: edit case removes the edited entry from existing before planning', () => {
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:00'), endedAt: t('11:00') }, // being edited
      { id: 'C', startedAt: t('11:00'), endedAt: t('12:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'edit', id: 'B', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'forward',
    });
    // After removing B: [A 09-10, C 11-12]. Insert candidate 09:30-10:30 → sorted
    // [A, candidate, C]. Walk: candidate vs A → candidate 10-11. C vs candidate →
    // C.startedAt 11:00 == candidate.endedAt 11:00 → no overlap (strict <). No shift.
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:00') });
    expect(plan.shifts).toEqual([]);
  });
});

describe('planAutoStack — backward', () => {
  const now = t('23:59');

  it('US-75: single backward overlap shifts candidate so endedAt = A.startedAt', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('09:00'), endedAt: t('10:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    // A.startedAt 09:00 <= candidate.startedAt 09:30; overlap exists.
    // candidateAfter.endedAt = 09:00, duration 60min → 08:00-09:00.
    expect(plan.candidateAfter).toEqual({ startedAt: t('08:00'), endedAt: t('09:00') });
    expect(plan.shifts).toEqual([]);
    expect(plan.direction).toBe('backward');
  });

  it('US-75: backward cascade through two earlier entries', () => {
    const existing: ClosedEntry[] = [
      { id: 'C', startedAt: t('07:00'), endedAt: t('08:00') },
      { id: 'B', startedAt: t('07:30'), endedAt: t('08:30') },
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    // Dock = A (the only entry with startedAt <= candidate.startedAt AND overlapping).
    // candidateAfter: endedAt = A.startedAt = 09:00, duration 60min → 08:00–09:00.
    // Walk backward from candidate:
    //   B 07:30-08:30 vs candidate 08:00-09:00 → B.endedAt 08:30 > candidate.startedAt 08:00
    //     → B shifts to 07:00-08:00 (duration 60min, endedAt = 08:00)
    //   C 07:00-08:00 vs B 07:00-08:00 → C.endedAt 08:00 > B.startedAt 07:00
    //     → C shifts to 06:00-07:00 (duration 60min, endedAt = 07:00)
    expect(plan.candidateAfter).toEqual({ startedAt: t('08:00'), endedAt: t('09:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'B',
        before: { startedAt: t('07:30'), endedAt: t('08:30') },
        after: { startedAt: t('07:00'), endedAt: t('08:00') },
      },
      {
        entryId: 'C',
        before: { startedAt: t('07:00'), endedAt: t('08:00') },
        after: { startedAt: t('06:00'), endedAt: t('07:00') },
      },
    ]);
  });

  it('backward degeneracy: no earlier-overlapping entry → no shifts, candidate stays', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('10:00'), endedAt: t('11:00') }];
    // Candidate 09:30-10:30 overlaps A, but A.startedAt 10:00 > candidate.startedAt 09:30
    // → no earlier dock. Backward degenerates to no shifts; candidate stays.
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:30'), endedAt: t('10:30') });
    expect(plan.shifts).toEqual([]);
    expect(plan.direction).toBe('backward');
  });

  it('US-71: edit case removes the edited entry from existing in backward mode too', () => {
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:00'), endedAt: t('11:00') }, // being edited
    ];
    const plan = planAutoStack({
      candidate: { kind: 'edit', id: 'B', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    // After removing B: [A 09-10]. Candidate 09:30-10:30 overlaps A.
    // Dock = A (A.startedAt 09:00 <= candidate.startedAt 09:30 AND overlaps).
    // candidateAfter.endedAt = A.startedAt = 09:00, duration 60min → 08:00-09:00.
    expect(plan.candidateAfter).toEqual({ startedAt: t('08:00'), endedAt: t('09:00') });
    expect(plan.shifts).toEqual([]);
  });

  it('throws CandidateEndsInFutureError regardless of direction', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('23:00') },
        existing: [],
        now: t('10:00'),
        direction: 'backward',
      }),
    ).toThrow(CandidateEndsInFutureError);
  });
});
