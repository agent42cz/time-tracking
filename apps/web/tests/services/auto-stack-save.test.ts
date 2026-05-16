/**
 * Integration tests for saveEntryWithAutoStack + previewAutoStack.
 * Covers US-66..US-76.
 *
 * Uses real Postgres via testcontainers. saveEntryWithAutoStack opens its
 * own transaction (FOR UPDATE lock), so we cannot use withTx for isolation.
 * Instead each test starts from a clean DB via beforeEach(resetDb).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, resetDb, stopTestPrisma } from '@tt/db/test';
import {
  previewAutoStack,
  saveEntryWithAutoStack,
} from '../../src/lib/services/auto-stack-save.js';

let prisma: PrismaClient;
let companyId: string;
let userId: string;
let otherCompanyId: string;
let otherUserId: string;

const t = (hhmm: string): Date => new Date(`2026-05-16T${hhmm}:00.000Z`);

beforeAll(async () => {
  prisma = await getTestPrisma();
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
  const company = await prisma.company.create({ data: { name: 'Co', slug: 'co' } });
  companyId = company.id;
  await prisma.membership.create({
    data: { userId, companyId, role: 'admin' },
  });

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

async function auditCount(): Promise<number> {
  return prisma.auditLog.count({ where: { companyId } });
}

describe('saveEntryWithAutoStack', () => {
  it('US-66: non-overlapping create produces zero shifts and one audit row', async () => {
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('10:00') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.shifts).toEqual([]);
    }
    expect(await auditCount()).toBe(1);
  });

  it('US-68: forward cascade writes one audit row per shifted entry plus one for the candidate', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    const b = await makeEntry(t('10:00'), t('11:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.startedAt.toISOString()).toBe(t('11:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('12:00').toISOString());
    expect(await auditCount()).toBe(2);
    const shiftAudits = await prisma.auditLog.findMany({
      where: { companyId, action: 'shift' },
    });
    expect(shiftAudits).toHaveLength(1);
    const shiftAfter = shiftAudits[0]!.after as { direction?: string; triggeredBy?: string };
    expect(shiftAfter.direction).toBe('forward');
    expect(shiftAfter.triggeredBy).toBe(result.candidateId);
    void a;
  });

  it('US-70: stop-timer kind triggers auto-stack on the resulting closed entry', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const running = await makeEntry(t('09:30'), null);
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'stop', id: running.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: running.id } });
    expect(after.startedAt.toISOString()).toBe(t('10:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('11:00').toISOString());
  });

  it('US-71: edit kind excludes the edited entry from existing', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    const b = await makeEntry(t('10:00'), t('11:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: b.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.startedAt.toISOString()).toBe(t('10:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('11:00').toISOString());
    void a;
  });

  it('US-72: cross-company entry id returns not_found', async () => {
    const otherEntry = await makeEntry(t('09:00'), t('10:00'), otherUserId, otherCompanyId);
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: otherEntry.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('US-73: concurrent saves serialize and produce no residual overlap', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const [r1, r2] = await Promise.all([
      saveEntryWithAutoStack(prisma, {
        actorUserId: userId,
        companyId,
        candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
        direction: 'forward',
        now: t('23:59'),
      }),
      saveEntryWithAutoStack(prisma, {
        actorUserId: userId,
        companyId,
        candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
        direction: 'forward',
        now: t('23:59'),
      }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const all = await prisma.timeEntry.findMany({
      where: { userId, companyId, deletedAt: null },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, endedAt: true },
    });
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.startedAt.getTime()).toBeGreaterThanOrEqual(all[i - 1]!.endedAt!.getTime());
    }
  });

  it('US-74: forward cascade past now succeeds; shifted entry has endedAt > now', async () => {
    const fixedNow = t('11:00');
    await makeEntry(t('09:00'), t('10:00'));
    const b = await makeEntry(t('10:00'), t('11:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: fixedNow,
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.endedAt!.getTime()).toBeGreaterThan(fixedNow.getTime());
  });

  it('US-75: backward direction shifts candidate earlier and writes direction=backward audit', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'backward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const created = await prisma.timeEntry.findUniqueOrThrow({ where: { id: result.candidateId } });
    expect(created.startedAt.toISOString()).toBe(t('08:00').toISOString());
    expect(created.endedAt?.toISOString()).toBe(t('09:00').toISOString());
    void a;
  });

  it('US-76: parallel timers — stopping the second triggers auto-stack', async () => {
    await makeEntry(t('10:00'), t('11:00'));
    const t2 = await makeEntry(t('10:30'), null);
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'stop', id: t2.id, startedAt: t('10:30'), endedAt: t('12:00') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: t2.id } });
    expect(after.startedAt.toISOString()).toBe(t('11:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('12:30').toISOString());
  });

  it('soft-deleted entries are excluded from existing', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    await prisma.timeEntry.update({
      where: { id: a.id },
      data: { deletedAt: new Date('2026-05-16T00:00:00.000Z') },
    });
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.plan.shifts).toEqual([]);
    expect(result.plan.candidateAfter.startedAt.toISOString()).toBe(t('09:30').toISOString());
    expect(result.plan.candidateAfter.endedAt.toISOString()).toBe(t('10:30').toISOString());
  });

  it('running timers are excluded from existing', async () => {
    await makeEntry(t('09:00'), null);
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.plan.shifts).toEqual([]);
  });
});

describe('previewAutoStack', () => {
  it('US-67: returns plan for both directions when called twice', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const fwd = await previewAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    const back = await previewAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'backward',
      now: t('23:59'),
    });
    expect(fwd.ok).toBe(true);
    expect(back.ok).toBe(true);
    if (!fwd.ok || !back.ok) throw new Error('expected ok');
    expect(fwd.plan.candidateAfter.startedAt.toISOString()).toBe(t('10:00').toISOString());
    expect(back.plan.candidateAfter.startedAt.toISOString()).toBe(t('08:00').toISOString());
  });

  it('US-72: preview returns not_found for cross-company entry id', async () => {
    const otherEntry = await makeEntry(t('09:00'), t('10:00'), otherUserId, otherCompanyId);
    const result = await previewAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: otherEntry.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
