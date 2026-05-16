'use client';

import { previewAutoStackAction } from '@/lib/actions/auto-stack';
import type { AutoStackActionInput } from '@/lib/actions/auto-stack';

export type OverlapCheckResult =
  | { kind: 'no-overlap' }
  | { kind: 'overlap'; candidate: AutoStackActionInput['candidate'] }
  | { kind: 'error'; error: string };

/**
 * Cheap server round-trip: ask the preview endpoint whether a candidate
 * overlaps any existing closed entry. Returns either 'no-overlap' (caller
 * proceeds with its normal action) or 'overlap' (caller opens the preview
 * dialog).
 */
export async function checkOverlap(
  candidate: AutoStackActionInput['candidate'],
): Promise<OverlapCheckResult> {
  const probe = await previewAutoStackAction({ candidate, direction: 'forward' });
  if (!probe.ok) {
    return { kind: 'error', error: probe.error };
  }
  const sameStart =
    new Date(probe.plan.candidateAfter.startedAt).getTime() ===
    new Date(candidate.startedAt).getTime();
  const sameEnd =
    new Date(probe.plan.candidateAfter.endedAt).getTime() === new Date(candidate.endedAt).getTime();
  const hasOverlap = probe.plan.shifts.length > 0 || !sameStart || !sameEnd;
  if (!hasOverlap) return { kind: 'no-overlap' };
  return { kind: 'overlap', candidate };
}
