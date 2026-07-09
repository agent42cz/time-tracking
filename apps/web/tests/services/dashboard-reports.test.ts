/**
 * Phase 8 — Dashboard + Reports tests.
 * Covers US-36, US-37, US-38, US-39, US-40, US-41, US-42, US-43, US-48, US-49.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany, leaveCompany } from '../../src/lib/services/companies.js';
import { createClient, createProject, createTag } from '../../src/lib/services/catalog.js';
import {
  clientFundProgress,
  clientShare,
  dailyBreakdown,
  headlineKpis,
  inactiveUsers,
  peopleTotals,
  topProjects,
} from '../../src/lib/services/dashboard.js';
import { rowsToCsv, runReport } from '../../src/lib/services/reports.js';
import { hashPassword } from '../../src/lib/auth/passwords.js';
import {
  beginEnrollment,
  confirmEnrollment,
  disableTotp,
} from '../../src/lib/auth/totp-enrollment.js';
import { generateTotpCode } from '../../src/lib/auth/totp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface DashWorld {
  admin: string;
  user: string;
  inactiveUser: string;
  outsider: string;
  company: string;
  clientA: string;
  clientB: string;
  projectA: string;
  projectB: string;
  tagA: string;
  range: { start: Date; end: Date };
}

async function buildWorld(tx: Prisma.TransactionClient, suffix: string): Promise<DashWorld> {
  const admin = await tx.user.create({
    data: { email: `d-a-${suffix}@x.test`, fullName: 'Admin' },
  });
  const user = await tx.user.create({
    data: { email: `d-u-${suffix}@x.test`, fullName: 'Worker' },
  });
  const inactive = await tx.user.create({
    data: { email: `d-i-${suffix}@x.test`, fullName: 'Idle' },
  });
  const outsider = await tx.user.create({
    data: { email: `d-o-${suffix}@x.test`, fullName: 'Out' },
  });
  const company = await createCompany(tx, { name: `Dash ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
  await tx.membership.create({
    data: { userId: inactive.id, companyId: company.id, role: 'user' },
  });
  await createCompany(tx, { name: `Other ${suffix}`, createdByUserId: outsider.id });

  const clientA = await createClient(tx, admin.id, { companyId: company.id, name: 'Acme' });
  const clientB = await createClient(tx, admin.id, { companyId: company.id, name: 'Beta' });
  if (!clientA.ok || !clientB.ok) throw new Error('setup');
  const projectA = await createProject(tx, admin.id, { clientId: clientA.value.id, name: 'Site' });
  const projectB = await createProject(tx, admin.id, { clientId: clientB.value.id, name: 'API' });
  if (!projectA.ok || !projectB.ok) throw new Error('setup');
  const tagA = await createTag(tx, admin.id, { companyId: company.id, name: 'meeting' });
  if (!tagA.ok) throw new Error('setup');

  // Seed entries: range = May 1 -> May 8 (one full week)
  const day = (d: number, h: number) =>
    new Date(`2026-05-0${d}T${String(h).padStart(2, '0')}:00:00Z`);
  // Worker: 4h on May 1 (Acme/Site), 2h on May 2 (Beta/API)
  await tx.timeEntry.create({
    data: {
      userId: user.id,
      companyId: company.id,
      clientId: clientA.value.id,
      projectId: projectA.value.id,
      description: 'Layout work',
      startedAt: day(1, 8),
      endedAt: day(1, 12),
      tags: { create: [{ tagId: tagA.value.id }] },
    },
  });
  await tx.timeEntry.create({
    data: {
      userId: user.id,
      companyId: company.id,
      clientId: clientB.value.id,
      projectId: projectB.value.id,
      description: 'Endpoint stubs',
      startedAt: day(2, 9),
      endedAt: day(2, 11),
    },
  });
  // Admin: 1h on May 1 (Beta/API)
  await tx.timeEntry.create({
    data: {
      userId: admin.id,
      companyId: company.id,
      clientId: clientB.value.id,
      projectId: projectB.value.id,
      description: 'Code review',
      startedAt: day(1, 14),
      endedAt: day(1, 15),
    },
  });
  // 'inactive' has no entries.

  return {
    admin: admin.id,
    user: user.id,
    inactiveUser: inactive.id,
    outsider: outsider.id,
    company: company.id,
    clientA: clientA.value.id,
    clientB: clientB.value.id,
    projectA: projectA.value.id,
    projectB: projectB.value.id,
    tagA: tagA.value.id,
    range: {
      start: new Date('2026-05-01T00:00:00Z'),
      end: new Date('2026-05-08T00:00:00Z'),
    },
  };
}

describe('dashboard widgets', () => {
  it('US-36: headline KPIs match a hand-rolled SQL ground truth', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us36');
      const res = await headlineKpis(tx, w.admin, w.company, w.range);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // 4h + 2h + 1h = 7h
      expect(res.value.totalMs).toBe(7 * 60 * 60 * 1000);
      expect(res.value.activeMembers).toBe(2);
      expect(res.value.distinctClients).toBe(2);
      expect(res.value.distinctProjects).toBe(2);

      // cross-company
      const cross = await headlineKpis(tx, w.outsider, w.company, w.range);
      expect(cross.ok).toBe(false);
    });
  });

  it('US-37: per-member totals across the range', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us37');
      const res = await peopleTotals(tx, w.admin, w.company, w.range);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const byUser = new Map(res.value.map((r) => [r.userId, r.totalMs]));
      expect(byUser.get(w.user)).toBe(6 * 60 * 60 * 1000);
      expect(byUser.get(w.admin)).toBe(1 * 60 * 60 * 1000);
      expect(byUser.get(w.inactiveUser)).toBe(0);
    });
  });

  it('US-38: drill-down — admin can read another members entries', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us38');
      // Drill-down is the report filtered by member.
      const r = await runReport(tx, w.admin, {
        companyId: w.company,
        memberIds: [w.user],
        from: w.range.start,
        to: w.range.end,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.every((row) => row.userId === w.user)).toBe(true);
    });
  });

  it('US-39: inactive users in the period', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us39');
      const res = await inactiveUsers(tx, w.admin, w.company, w.range);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.map((u) => u.userId)).toEqual([w.inactiveUser]);
    });
  });

  it('US-40: daily breakdown stacked by client', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us40');
      const res = await dailyBreakdown(tx, w.admin, w.company, w.range, 'client');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const may1Acme = res.value.find((r) => r.day === '2026-05-01' && r.label === 'Acme');
      const may1Beta = res.value.find((r) => r.day === '2026-05-01' && r.label === 'Beta');
      const may2Beta = res.value.find((r) => r.day === '2026-05-02' && r.label === 'Beta');
      expect(may1Acme?.totalMs).toBe(4 * 60 * 60 * 1000);
      expect(may1Beta?.totalMs).toBe(1 * 60 * 60 * 1000);
      expect(may2Beta?.totalMs).toBe(2 * 60 * 60 * 1000);
    });
  });

  it('US-40: daily breakdown buckets cross-midnight entries by Prague start-day, not UTC', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us40-tz');
      // 2026-05-01 22:30 UTC = 00:30 Prague on 2026-05-02 (CEST = UTC+2).
      // UTC-based bucketing would file this under 2026-05-01; Prague-based
      // bucketing must file it under 2026-05-02 where the user lived through it.
      await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          clientId: w.clientA,
          projectId: w.projectA,
          description: 'Late-night fix',
          startedAt: new Date('2026-05-01T22:30:00Z'),
          endedAt: new Date('2026-05-01T23:00:00Z'),
        },
      });
      const res = await dailyBreakdown(tx, w.admin, w.company, w.range, 'client');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const may2Acme = res.value.find((r) => r.day === '2026-05-02' && r.label === 'Acme');
      const may1Acme = res.value.find((r) => r.day === '2026-05-01' && r.label === 'Acme');
      // The new 30m entry lands on May 2 (Prague day), not May 1 (UTC day).
      expect(may2Acme?.totalMs).toBe(30 * 60 * 1000);
      // May 1's Acme total is unchanged by the new entry.
      expect(may1Acme?.totalMs).toBe(4 * 60 * 60 * 1000);
    });
  });

  it('client share + top projects sum to total time', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us36b');
      const cs = await clientShare(tx, w.admin, w.company, w.range);
      const tp = await topProjects(tx, w.admin, w.company, w.range);
      expect(cs.ok && tp.ok).toBe(true);
      if (cs.ok && tp.ok) {
        const total = cs.value.reduce((acc, c) => acc + c.totalMs, 0);
        expect(total).toBe(7 * 60 * 60 * 1000);
        const totalP = tp.value.reduce((acc, p) => acc + p.totalMs, 0);
        expect(totalP).toBe(7 * 60 * 60 * 1000);
      }
    });
  });

  it('US-91: null client/project render Czech unassigned labels, not English', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'unassigned');
      // an entry with no client and no project, inside the range
      await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          clientId: null,
          projectId: null,
          description: 'loose',
          startedAt: new Date('2026-05-01T09:00:00Z'),
          endedAt: new Date('2026-05-01T10:00:00Z'),
        },
      });
      const share = await clientShare(tx, w.admin, w.company, w.range);
      const top = await topProjects(tx, w.admin, w.company, w.range);
      if (!share.ok || !top.ok) throw new Error('unexpected');
      expect(share.value.some((r) => r.clientName === 'Nepřiřazený klient')).toBe(true);
      expect(share.value.some((r) => r.clientName === '(deleted client)')).toBe(false);
      expect(top.value.some((r) => r.projectName === 'Nepřiřazený projekt')).toBe(true);
      expect(top.value.some((r) => r.projectName === '(deleted project)')).toBe(false);
    });
  });
});

describe('reports', () => {
  it('US-41: filter by client + tag + member at once', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us41');
      const res = await runReport(tx, w.admin, {
        companyId: w.company,
        clientIds: [w.clientA],
        memberIds: [w.user],
        tagIds: [w.tagA],
        tagsMode: 'and',
        from: w.range.start,
        to: w.range.end,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toHaveLength(1);
        expect(res.value[0]!.userId).toBe(w.user);
        expect(res.value[0]!.clientName).toBe('Acme');
      }
    });
  });

  it('US-42: CSV export round-trip preserves rows', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us42');
      const r = await runReport(tx, w.admin, { companyId: w.company });
      if (!r.ok) throw new Error('setup');
      const csv = rowsToCsv(r.value);
      const lines = csv.trim().split('\n');
      expect(lines[0]).toContain('id,user,client,project');
      expect(lines.length).toBe(r.value.length + 1);
    });
  });

  it('US-43: a regular user can run a report restricted to their own entries', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us43');
      const mine = await runReport(tx, w.user, {
        companyId: w.company,
        // user passes memberIds[admin] but the filter is ignored — they only see their own.
        memberIds: [w.admin],
      });
      expect(mine.ok).toBe(true);
      if (mine.ok) expect(mine.value.every((r) => r.userId === w.user)).toBe(true);
    });
  });

  it('US-77: runReport rows carry clientId and projectId for grouping', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'us77ids');
      const r = await runReport(tx, w.admin, { companyId: w.company });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const acme = r.value.find((row) => row.clientName === 'Acme');
      expect(acme?.clientId).toBe(w.clientA);
      expect(acme?.projectId).toBe(w.projectA);
    });
  });
});

describe('settings', () => {
  it('US-48: a user can re-enroll TOTP from settings (disable + begin + confirm)', async () => {
    await withTx(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: 'us48@x.test',
          fullName: 'U',
          passwordHash: await hashPassword('CorrectHorseBattery42!'),
        },
      });
      // Initial enrollment
      const e1 = await beginEnrollment(tx, u.id);
      await confirmEnrollment(tx, u.id, generateTotpCode(e1.secret));

      // Re-enroll: disable, then begin again
      await disableTotp(tx, u.id);
      const e2 = await beginEnrollment(tx, u.id);
      const codes = await confirmEnrollment(tx, u.id, generateTotpCode(e2.secret));
      expect(codes.recoveryCodes).toHaveLength(10);
      const reread = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(reread.totpEnabled).toBe(true);
      // Old secret was overwritten.
      expect(reread.totpSecret).toBe(e2.secret);
    });
  });

  it('US-49: a user can leave a company they no longer belong to', async () => {
    await withTx(async (tx) => {
      const me = await tx.user.create({ data: { email: 'us49@x.test', fullName: 'Me' } });
      const founder = await tx.user.create({ data: { email: 'us49f@x.test', fullName: 'F' } });
      const company = await createCompany(tx, { name: 'C', createdByUserId: founder.id });
      await tx.membership.create({
        data: { userId: me.id, companyId: company.id, role: 'user' },
      });
      const left = await leaveCompany(tx, me.id, company.id);
      expect(left.ok).toBe(true);
      const m = await tx.membership.findUnique({
        where: { userId_companyId: { userId: me.id, companyId: company.id } },
      });
      expect(m).toBeNull();
    });
  });
});

describe('client fund progress', () => {
  it('US-90: weekly/monthly/day breakdown for a working-days client (team-wide)', async () => {
    const { setNowProvider } = await import('@tt/shared/time');
    setNowProvider(() => new Date('2026-05-08T12:00:00Z')); // Friday
    try {
      await withTx(async (tx) => {
        const w = await buildWorld(tx, 'fund');
        // Dedicated client, isolated from buildWorld's pre-seeded clientA entries.
        const fc = await createClient(tx, w.admin, { companyId: w.company, name: 'FundCo' });
        if (!fc.ok) throw new Error('setup');
        const fundClientId = fc.value.id;
        // Make it a SPLY-like fund client: 24h/week, Wed/Thu/Fri.
        await tx.client.update({
          where: { id: fundClientId },
          data: {
            fundInDashboard: true,
            weeklyFundMinutes: 1440,
            weekStartsOn: 3,
            workingDays: [3, 4, 5],
          },
        });
        // Team logs 10h total this week on the fund client: 8h Wed (admin) + 2h Thu (worker).
        await tx.timeEntry.create({
          data: {
            userId: w.admin,
            companyId: w.company,
            clientId: fundClientId,
            startedAt: new Date('2026-05-06T06:00:00Z'),
            endedAt: new Date('2026-05-06T14:00:00Z'),
          },
        });
        await tx.timeEntry.create({
          data: {
            userId: w.user,
            companyId: w.company,
            clientId: fundClientId,
            startedAt: new Date('2026-05-07T06:00:00Z'),
            endedAt: new Date('2026-05-07T08:00:00Z'),
          },
        });

        const r = await clientFundProgress(tx, w.admin, w.company);
        if (!r.ok) throw new Error('not ok');
        const sply = r.value.clients.find((c) => c.clientId === fundClientId);
        if (!sply) throw new Error('missing');
        expect(sply.weekly).toEqual({ targetMinutes: 1440, workedMinutes: 600 });
        // May 2026 has 13 Wed/Thu/Fri -> monthly target 13 * 480 = 6240
        expect(sply.monthly.targetMinutes).toBe(6240);
        expect(sply.monthly.workedMinutes).toBe(600);
        // Greedy: Wed filled 480, Thu gets remaining 120, Fri 0.
        const [wed, thu, fri] = sply.days;
        expect(wed).toMatchObject({ isoWeekday: 3, allocatedMinutes: 480, isPast: true });
        expect(thu).toMatchObject({ isoWeekday: 4, allocatedMinutes: 120, isPast: true });
        expect(fri).toMatchObject({ isoWeekday: 5, allocatedMinutes: 0, isPast: false }); // today
      });
    } finally {
      setNowProvider(null);
    }
  });

  it('US-90: hours-only client has proportional monthly target and no day breakdown', async () => {
    const { setNowProvider } = await import('@tt/shared/time');
    setNowProvider(() => new Date('2026-05-15T12:00:00Z'));
    try {
      await withTx(async (tx) => {
        const w = await buildWorld(tx, 'fund-ho');
        await tx.client.update({
          where: { id: w.clientA },
          data: { fundInDashboard: true, weeklyFundMinutes: 600, weekStartsOn: 1, workingDays: [] },
        });
        const r = await clientFundProgress(tx, w.admin, w.company);
        if (!r.ok) throw new Error('not ok');
        const c = r.value.clients.find((x) => x.clientId === w.clientA);
        if (!c) throw new Error('missing');
        expect(c.days).toEqual([]);
        // 600 * 31 / 7 = 2657.14 -> round 2657
        expect(c.monthly.targetMinutes).toBe(2657);
      });
    } finally {
      setNowProvider(null);
    }
  });

  it('US-90: combined bar sums fund clients; cross-company actor gets not_found', async () => {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'fund-comb');
      await tx.client.update({
        where: { id: w.clientA },
        data: {
          fundInDashboard: true,
          weeklyFundMinutes: 1440,
          weekStartsOn: 3,
          workingDays: [3, 4, 5],
        },
      });
      await tx.client.update({
        where: { id: w.clientB },
        data: {
          fundInDashboard: true,
          weeklyFundMinutes: 960,
          weekStartsOn: 1,
          workingDays: [1, 2],
        },
      });
      const ok = await clientFundProgress(tx, w.admin, w.company);
      if (!ok.ok) throw new Error('not ok');
      expect(ok.value.combined.weekly.targetMinutes).toBe(2400); // 1440 + 960
      // outsider is admin of a different company -> existence hidden
      const cross = await clientFundProgress(tx, w.outsider, w.company);
      expect(cross.ok).toBe(false);
    });
  });
});
