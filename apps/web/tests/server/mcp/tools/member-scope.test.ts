import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { parseInclusiveAppZoneRange } from '@tt/shared/time';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { buildGroupedReport, runReport } from '../../../../src/lib/services/reports.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

const MIN = 60_000;
const month = { from: '2026-10-01', to: '2026-10-31' };

// Admin (company creator), plus a plain member "Mira" with October entries.
async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const admin = await tx.user.create({
    data: { email: `ms-a-${suffix}@x.test`, fullName: 'Admin' },
  });
  const c = await createCompany(tx, { name: `MS ${suffix}`, createdByUserId: admin.id });
  const companyId = typeof c === 'string' ? c : c.id;
  const mira = await tx.user.create({ data: { email: `ms-m-${suffix}@x.test`, fullName: 'Mira' } });
  await tx.membership.create({ data: { userId: mira.id, companyId, role: 'user' } });
  const sp = await tx.client.create({ data: { companyId, name: 'Svět Plodů' } });
  for (const [userId, iso, minutes] of [
    [mira.id, '2026-10-02T07:00:00Z', 120],
    [mira.id, '2026-10-20T07:00:00Z', 90],
    [admin.id, '2026-10-03T07:00:00Z', 60],
  ] as const) {
    const startedAt = new Date(iso);
    await tx.timeEntry.create({
      data: {
        userId,
        companyId,
        clientId: sp.id,
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * MIN),
      },
    });
  }
  return { adminId: admin.id, miraId: mira.id, companyId, clientId: sp.id };
}

describe('mcp: colleagues’ entries follow the /reports rules', () => {
  it('US-120: an admin lists members and reads and sums a colleague’s month like /reports', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '120');
      const m = await buildInProcessMcp({ db: tx, userId: w.adminId, companyId: w.companyId });
      try {
        const members = await m.client.callTool({ name: 'list_members', arguments: {} });
        expect(members.isError).toBeFalsy();
        expect(
          (members.structuredContent as { members: { userId: string; name: string }[] }).members,
        ).toEqual([
          expect.objectContaining({ userId: w.adminId, name: 'Admin', role: 'admin' }),
          expect.objectContaining({ userId: w.miraId, name: 'Mira', role: 'user' }),
        ]);

        const sum = await m.client.callTool({
          name: 'summarize_entries',
          arguments: { ...month, memberIds: [w.miraId], groupBy: 'client' },
        });
        expect(sum.isError).toBeFalsy();
        const s = sum.structuredContent as { totalMinutes: number; entryCount: number };
        expect(s).toMatchObject({ totalMinutes: 210, entryCount: 2 });

        // Same number the admin sees on /reports with member = Mira.
        const range = parseInclusiveAppZoneRange(month.from, month.to);
        const report = await runReport(tx, w.adminId, {
          companyId: w.companyId,
          ...range,
          clientIds: [w.clientId],
          memberIds: [w.miraId],
        });
        if (!report.ok) throw new Error('report');
        const grouped = buildGroupedReport(report.value, {
          groupBy: 'project',
          clampEnd: range.to,
        });
        expect(s.totalMinutes).toBe(grouped.grandTotalMs / MIN);

        const byMember = await m.client.callTool({
          name: 'summarize_entries',
          arguments: { ...month, memberIds: [w.adminId, w.miraId], groupBy: 'member' },
        });
        const groups = (
          byMember.structuredContent as {
            groups: { userId: string | null; userName: string | null; minutes: number }[];
          }
        ).groups;
        expect(groups.map((g) => [g.userName, g.minutes])).toEqual([
          ['Admin', 60],
          ['Mira', 210],
        ]);

        const list = await m.client.callTool({
          name: 'list_entries',
          arguments: { ...month, memberId: w.miraId },
        });
        expect(list.isError).toBeFalsy();
        const rows = (list.structuredContent as { entries: { userId: string }[] }).entries;
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.userId === w.miraId)).toBe(true);
      } finally {
        await m.close();
      }
    });
  });

  it('US-120: a plain member gets not_found for colleagues and reads only their own entries', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '120-scope');

      const asMira = await buildInProcessMcp({ db: tx, userId: w.miraId, companyId: w.companyId });
      try {
        for (const [name, args] of [
          ['summarize_entries', { ...month, memberIds: [w.adminId] }],
          ['list_entries', { memberId: w.adminId }],
          ['summarize_entries', { ...month, allMembers: true }],
        ] as const) {
          const out = await asMira.client.callTool({ name, arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }
        // A plain member may still name themself, and list_members shows only them.
        const own = await asMira.client.callTool({
          name: 'summarize_entries',
          arguments: { ...month, memberIds: [w.miraId] },
        });
        expect(own.structuredContent).toMatchObject({ totalMinutes: 210 });
        const ownList = await asMira.client.callTool({
          name: 'list_entries',
          arguments: { memberId: w.miraId },
        });
        expect((ownList.structuredContent as { entries: unknown[] }).entries).toHaveLength(2);
        const members = await asMira.client.callTool({ name: 'list_members', arguments: {} });
        expect(
          (members.structuredContent as { members: { userId: string }[] }).members.map(
            (x) => x.userId,
          ),
        ).toEqual([w.miraId]);
      } finally {
        await asMira.close();
      }
    });
  });

  it('US-120: an admin reaches every current member, all members incl. former ones, nothing outside', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '120-admin');
      const stranger = await tx.user.create({ data: { email: 'ms-s@x.test', fullName: 'S' } });
      // A second company the admin also belongs to, with its own member.
      const other = await createCompany(tx, { name: 'MS other', createdByUserId: w.adminId });
      const otherId = typeof other === 'string' ? other : other.id;
      const otherMember = await tx.user.create({ data: { email: 'ms-o@x.test', fullName: 'O' } });
      await tx.membership.create({
        data: { userId: otherMember.id, companyId: otherId, role: 'user' },
      });

      const m = await buildInProcessMcp({
        db: tx,
        userId: w.adminId,
        companyId: w.companyId,
        allCompanies: true,
      });
      try {
        for (const [name, args] of [
          ['summarize_entries', { ...month, memberIds: [stranger.id] }],
          ['summarize_entries', { ...month, memberIds: [w.miraId, stranger.id] }],
          ['summarize_entries', { ...month, companyId: w.companyId, memberIds: [otherMember.id] }],
          ['list_entries', { memberId: stranger.id }],
          ['list_entries', { memberId: otherMember.id }],
        ] as const) {
          const out = await m.client.callTool({ name, arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }

        // Mira leaves: her entries stay, she drops off list_members and can no
        // longer be named, but allMembers still counts her like unfiltered /reports.
        await tx.membership.delete({
          where: { userId_companyId: { userId: w.miraId, companyId: w.companyId } },
        });
        const named = await m.client.callTool({
          name: 'summarize_entries',
          arguments: { ...month, memberIds: [w.miraId] },
        });
        expect(named.structuredContent).toMatchObject({ code: 'not_found' });
        const all = await m.client.callTool({
          name: 'summarize_entries',
          arguments: { ...month, allMembers: true },
        });
        expect(all.structuredContent).toMatchObject({ totalMinutes: 270, entryCount: 3 });
        const both = await m.client.callTool({
          name: 'summarize_entries',
          arguments: { ...month, allMembers: true, memberIds: [w.adminId] },
        });
        expect(both.structuredContent).toMatchObject({ code: 'invalid_args' });
      } finally {
        await m.close();
      }
    });
  });
});
