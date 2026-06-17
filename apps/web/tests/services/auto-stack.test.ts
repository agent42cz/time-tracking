import { describe, expect, it } from 'vitest';
import {
  CandidateEndsInFutureError,
  InvalidManualStartError,
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

  it('US-75: dock can start AFTER candidate as long as it overlaps', () => {
    // Candidate 09:30-10:30 overlaps A but A starts later than the candidate.
    // Earlier rule required dock.startedAt <= candidate.startedAt; new rule
    // picks A regardless. Candidate docks to A's start.
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('10:00'), endedAt: t('11:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:00'), endedAt: t('10:00') });
    expect(plan.shifts).toEqual([]);
    expect(plan.direction).toBe('backward');
  });

  it('US-75: chain entries that fall inside candidate after move are cascaded backward too', () => {
    // Edit Test5 (10:03-10:12). Test6 (10:04-10:12) overlaps. Test4
    // (09:56-09:58) and Test3 (09:54-09:56) end up inside candidate's new
    // range after the dock move and must be compacted backward.
    const existing: ClosedEntry[] = [
      { id: 'T1', startedAt: t('09:50'), endedAt: t('09:53') },
      { id: 'T2', startedAt: t('09:51'), endedAt: t('09:53') },
      { id: 'T3', startedAt: t('09:54'), endedAt: t('09:56') },
      { id: 'T4', startedAt: t('09:56'), endedAt: t('09:58') },
      { id: 'T5', startedAt: t('10:03'), endedAt: t('10:12') }, // being edited
      { id: 'T6', startedAt: t('10:04'), endedAt: t('10:12') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'edit', id: 'T5', startedAt: t('10:03'), endedAt: t('10:12') },
      existing,
      now,
      direction: 'backward',
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:55'), endedAt: t('10:04') });
    const shiftById = new Map(plan.shifts.map((s) => [s.entryId, s]));
    expect(shiftById.get('T4')!.after).toEqual({ startedAt: t('09:53'), endedAt: t('09:55') });
    expect(shiftById.get('T3')!.after).toEqual({ startedAt: t('09:51'), endedAt: t('09:53') });
    expect(shiftById.get('T2')!.after).toEqual({ startedAt: t('09:49'), endedAt: t('09:51') });
    expect(shiftById.get('T1')!.after).toEqual({ startedAt: t('09:46'), endedAt: t('09:49') });
    expect(shiftById.has('T6')).toBe(false); // dock stays put
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

describe('planAutoStack — manual', () => {
  const now = t('23:59');

  it('US-82: manual start moves the earlier blocker back, preserving its length', () => {
    // Blocker A 12:30–13:30; candidate ends 14:00; user pins start at 13:00.
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('12:30'), endedAt: t('13:30') }];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
      existing,
      now,
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    expect(plan.direction).toBe('manual');
    expect(plan.candidateAfter).toEqual({ startedAt: t('13:00'), endedAt: t('14:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'A',
        before: { startedAt: t('12:30'), endedAt: t('13:30') },
        after: { startedAt: t('12:00'), endedAt: t('13:00') },
      },
    ]);
  });

  it('US-82: manual cascade pushes a chain of earlier entries back', () => {
    const existing: ClosedEntry[] = [
      { id: 'EARLY', startedAt: t('11:00'), endedAt: t('11:30') }, // no overlap, stays
      { id: 'MID', startedAt: t('12:50'), endedAt: t('13:10') }, // overlaps after first move
      { id: 'BLOCK', startedAt: t('12:30'), endedAt: t('13:30') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
      existing,
      now,
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('13:00'), endedAt: t('14:00') });
    const byId = new Map(plan.shifts.map((s) => [s.entryId, s]));
    // BLOCK (12:30–13:30) anchors at 13:00 → 12:00–13:00.
    expect(byId.get('BLOCK')!.after).toEqual({ startedAt: t('12:00'), endedAt: t('13:00') });
    // MID (12:50–13:10) ends after 12:00 anchor → 11:40–12:00 (20 min preserved).
    expect(byId.get('MID')!.after).toEqual({ startedAt: t('11:40'), endedAt: t('12:00') });
    // EARLY ends 11:30 < 11:40 anchor → untouched.
    expect(byId.has('EARLY')).toBe(false);
  });

  it('US-82: no overlap — candidate just adopts the manual start, no shifts', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('11:00'), endedAt: t('12:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:30'), endedAt: t('14:00') },
      existing,
      now,
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('13:00'), endedAt: t('14:00') });
    expect(plan.shifts).toEqual([]);
  });

  it('US-86: manual start missing throws InvalidManualStartError', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
        existing: [],
        now,
        direction: 'manual',
      }),
    ).toThrow(InvalidManualStartError);
  });

  it('US-86: manual start at/after candidate end throws InvalidManualStartError', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
        existing: [],
        now,
        direction: 'manual',
        manualStartedAt: t('14:00'),
      }),
    ).toThrow(InvalidManualStartError);
  });

  it('US-82: entries that end before the manual start are never moved', () => {
    // E and F both end before manualStartedAt (13:00) and overlap each other,
    // but neither overlaps the candidate window — so neither may move.
    const existing: ClosedEntry[] = [
      { id: 'E', startedAt: t('12:00'), endedAt: t('12:50') },
      { id: 'F', startedAt: t('11:55'), endedAt: t('12:30') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:30'), endedAt: t('14:00') },
      existing,
      now: t('23:59'),
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('13:00'), endedAt: t('14:00') });
    expect(plan.shifts).toEqual([]);
  });

  it('US-82: an entry that overlaps only the moved blocker still cascades', () => {
    // G ends at 12:30 (before manualStart 13:00) so it does not overlap the
    // window directly — but after BLOCK docks to 12:10–13:00, G overlaps it and
    // must cascade back.
    const existing: ClosedEntry[] = [
      { id: 'BLOCK', startedAt: t('12:40'), endedAt: t('13:30') },
      { id: 'G', startedAt: t('11:50'), endedAt: t('12:30') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
      existing,
      now: t('23:59'),
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    const byId = new Map(plan.shifts.map((s) => [s.entryId, s]));
    expect(byId.get('BLOCK')!.after).toEqual({ startedAt: t('12:10'), endedAt: t('13:00') });
    expect(byId.get('G')!.after).toEqual({ startedAt: t('11:30'), endedAt: t('12:10') });
  });
});
