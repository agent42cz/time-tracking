import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, resetDb, stopTestPrisma } from '@tt/db/test';

const ctx = vi.hoisted(() => ({ db: null as unknown as PrismaClient, userId: '' }));
vi.mock('@/lib/session', () => ({ prisma: () => ctx.db, SESSION_COOKIE: 'tt-session' }));
vi.mock('@/lib/api/auth', () => ({
  resolveApiSession: async () =>
    ctx.userId
      ? {
          userId: ctx.userId,
          email: '',
          fullName: '',
          totpEnabled: false,
          theme: 'system',
          autoStackOverlaps: true,
          memberships: [],
        }
      : null,
  pickActiveCompany: () => null,
}));
const { POST: previewPOST } =
  await import('../../src/app/api/v1/entries/[id]/auto-stack/preview/route.js');
const { POST: applyPOST } = await import('../../src/app/api/v1/entries/[id]/auto-stack/route.js');

let prisma: PrismaClient;
let companyId: string;
let userId: string;
let otherCompanyId: string;
let otherUserId: string;
const t = (hhmm: string): Date => new Date(`2026-05-16T${hhmm}:00.000Z`);

beforeAll(async () => {
  prisma = await getTestPrisma();
  ctx.db = prisma;
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);
beforeEach(async () => {
  await resetDb(prisma);
  const owner = await prisma.user.create({
    data: { email: 'owner@test', passwordHash: 'x', fullName: 'Owner' },
  });
  userId = owner.id;
  ctx.userId = owner.id;
  const company = await prisma.company.create({ data: { name: 'Co', slug: 'co' } });
  companyId = company.id;
  await prisma.membership.create({ data: { userId, companyId, role: 'admin' } });
  const other = await prisma.user.create({
    data: { email: 'other@test', passwordHash: 'x', fullName: 'Other' },
  });
  otherUserId = other.id;
  const otherCo = await prisma.company.create({ data: { name: 'Other Co', slug: 'other-co' } });
  otherCompanyId = otherCo.id;
  await prisma.membership.create({
    data: { userId: otherUserId, companyId: otherCompanyId, role: 'admin' },
  });
});

async function makeEntry(
  startedAt: Date,
  endedAt: Date | null,
  uid = userId,
  cid = companyId,
): Promise<{ id: string }> {
  return prisma.timeEntry.create({
    data: { userId: uid, companyId: cid, description: '', startedAt, endedAt },
    select: { id: true },
  });
}
function req(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

describe('auto-stack REST routes', () => {
  it('US-81: preview returns a plan for an overlapping forward case', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const cand = await makeEntry(t('09:30'), t('10:30'));
    const res = await previewPOST(
      req(`http://localhost/api/v1/entries/${cand.id}/auto-stack/preview`, {
        direction: 'forward',
      }),
      params(cand.id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; plan: { candidateAfter: unknown } };
    expect(body.ok).toBe(true);
    expect(body.plan.candidateAfter).toBeDefined();
  });

  it('US-82: apply with manual start moves the blocker and persists', async () => {
    const blocker = await makeEntry(t('12:30'), t('13:30'));
    const cand = await makeEntry(t('12:45'), t('14:00'));
    const res = await applyPOST(
      req(`http://localhost/api/v1/entries/${cand.id}/auto-stack`, {
        direction: 'manual',
        startedAt: t('13:00').toISOString(),
      }),
      params(cand.id),
    );
    expect(res.status).toBe(200);
    const moved = await prisma.timeEntry.findUniqueOrThrow({ where: { id: blocker.id } });
    expect(moved.startedAt.toISOString()).toBe(t('12:00').toISOString());
  });

  it('US-85: preview on a cross-company entry id returns 404 not_found', async () => {
    const foreign = await makeEntry(t('10:00'), t('11:00'), otherUserId, otherCompanyId);
    const res = await previewPOST(
      req(`http://localhost/api/v1/entries/${foreign.id}/auto-stack/preview`, {
        direction: 'forward',
      }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('US-85: apply on a cross-company entry id returns 404 not_found', async () => {
    const foreign = await makeEntry(t('10:00'), t('11:00'), otherUserId, otherCompanyId);
    const res = await applyPOST(
      req(`http://localhost/api/v1/entries/${foreign.id}/auto-stack`, { direction: 'forward' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('US-86: apply with manual start ≥ end returns 422 invalid_window', async () => {
    const cand = await makeEntry(t('12:45'), t('14:00'));
    const res = await applyPOST(
      req(`http://localhost/api/v1/entries/${cand.id}/auto-stack`, {
        direction: 'manual',
        startedAt: t('14:00').toISOString(),
      }),
      params(cand.id),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_window');
  });
});
