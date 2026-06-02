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
        | 'invalid_input'
        | 'invalid_window'
        | 'future_timestamp'
        | 'cascade_window_exceeded';
    };

const VALID_KINDS = ['create', 'edit', 'stop'] as const;
type ValidKind = (typeof VALID_KINDS)[number];

const VALID_DIRECTIONS = ['forward', 'backward'] as const;
type ValidDirection = (typeof VALID_DIRECTIONS)[number];

function isValidDirection(value: unknown): value is Direction {
  return VALID_DIRECTIONS.includes(value as ValidDirection);
}

type ParseResult = { ok: true; candidate: Candidate } | { ok: false; error: 'invalid_input' };

function parseInput(input: AutoStackActionInput): ParseResult {
  if (!VALID_KINDS.includes(input.candidate.kind as ValidKind)) {
    return { ok: false, error: 'invalid_input' };
  }
  const startedAt = new Date(input.candidate.startedAt);
  const endedAt = new Date(input.candidate.endedAt);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return { ok: false, error: 'invalid_input' };
  }
  if (input.candidate.kind === 'create') {
    return { ok: true, candidate: { kind: 'create', startedAt, endedAt } };
  }
  if (typeof input.candidate.id !== 'string' || input.candidate.id.length === 0) {
    return { ok: false, error: 'invalid_input' };
  }
  return {
    ok: true,
    candidate: {
      kind: input.candidate.kind as 'edit' | 'stop',
      id: input.candidate.id,
      startedAt,
      endedAt,
    },
  };
}

function planToWire(plan: Plan): WirePlan {
  return {
    direction: plan.direction,
    shifts: plan.shifts.map((s) => ({
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
  if (!isValidDirection(input.direction)) {
    return { ok: false, error: 'invalid_input' };
  }
  const parsed = parseInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const candidate = parsed.candidate;
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
  if (!isValidDirection(input.direction)) {
    return { ok: false, error: 'invalid_input' };
  }
  const parsed = parseInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const candidate = parsed.candidate;
  const result = await saveEntryWithAutoStack(prisma(), {
    actorUserId: session.userId,
    companyId: session.activeCompanyId,
    candidate,
    direction: input.direction,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: result.reason };
  revalidatePath('/timer');
  return { ok: true, candidateId: result.candidateId, plan: planToWire(result.plan) };
}
