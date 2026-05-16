'use server';

import { revalidatePath } from 'next/cache';
import { requireActiveCompany, prisma } from '../session.js';
import { previewAutoStack, saveEntryWithAutoStack } from '../services/auto-stack-save.js';
import type { Candidate, Direction, Plan } from '../services/auto-stack.js';

export type AutoStackActionInput = {
  candidate: {
    kind: 'create' | 'edit' | 'stop';
    id?: string;
    startedAt: string;
    endedAt: string;
  };
  direction: Direction;
};

// Server actions serialize Date objects to ISO strings over the wire.
// The wire-shape of the plan replaces Date fields with strings.
export type WirePlan = {
  direction: Direction;
  shifts: Array<{
    entryId: string;
    before: { startedAt: string; endedAt: string };
    after: { startedAt: string; endedAt: string };
  }>;
  candidateAfter: { startedAt: string; endedAt: string };
};

export type AutoStackActionResult =
  | { ok: true; candidateId: string; plan: WirePlan }
  | {
      ok: false;
      error:
        | 'unauthorized'
        | 'not_found'
        | 'invalid_window'
        | 'future_timestamp'
        | 'cascade_window_exceeded';
    };

function parseInput(input: AutoStackActionInput): Candidate {
  const startedAt = new Date(input.candidate.startedAt);
  const endedAt = new Date(input.candidate.endedAt);
  if (input.candidate.kind === 'create') {
    return { kind: 'create', startedAt, endedAt };
  }
  if (input.candidate.id === undefined) {
    throw new Error('id required for edit/stop');
  }
  return { kind: input.candidate.kind, id: input.candidate.id, startedAt, endedAt };
}

function planToWire(plan: Plan): WirePlan {
  return {
    direction: plan.direction,
    shifts: plan.shifts.map((s) => ({
      entryId: s.entryId,
      before: {
        startedAt: s.before.startedAt.toISOString(),
        endedAt: s.before.endedAt.toISOString(),
      },
      after: {
        startedAt: s.after.startedAt.toISOString(),
        endedAt: s.after.endedAt.toISOString(),
      },
    })),
    candidateAfter: {
      startedAt: plan.candidateAfter.startedAt.toISOString(),
      endedAt: plan.candidateAfter.endedAt.toISOString(),
    },
  };
}

export async function previewAutoStackAction(
  input: AutoStackActionInput,
): Promise<AutoStackActionResult> {
  const session = await requireActiveCompany();
  const candidate = parseInput(input);
  const result = await previewAutoStack(prisma(), {
    actorUserId: session.userId,
    companyId: session.activeCompanyId,
    candidate,
    direction: input.direction,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: result.reason };
  return { ok: true, candidateId: result.candidateId, plan: planToWire(result.plan) };
}

export async function saveEntryWithAutoStackAction(
  input: AutoStackActionInput,
): Promise<AutoStackActionResult> {
  const session = await requireActiveCompany();
  const candidate = parseInput(input);
  const result = await saveEntryWithAutoStack(prisma(), {
    actorUserId: session.userId,
    companyId: session.activeCompanyId,
    candidate,
    direction: input.direction,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: result.reason };
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true, candidateId: result.candidateId, plan: planToWire(result.plan) };
}
