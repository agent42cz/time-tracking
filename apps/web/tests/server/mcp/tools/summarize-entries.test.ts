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

interface Group {
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  day: string | null;
  minutes: number;
  entryCount: number;
}
interface Summary {
  from: string;
  to: string;
  groupBy: string;
  totalMinutes: number;
  totalHours: number;
  entryCount: number;
  groups: Group[];
}

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `se-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `SE ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

const MIN = 60_000;

async function entry(
  tx: Prisma.TransactionClient,
  w: { userId: string; companyId: string },
  startIso: string,
  minutes: number,
  links: { clientId?: string; projectId?: string } = {},
) {
  const startedAt = new Date(startIso);
  await tx.timeEntry.create({
    data: {
      userId: w.userId,
      companyId: w.companyId,
      ...links,
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * MIN),
    },
  });
}

describe('mcp tool: summarize_entries', () => {
  it('US-116: sums a month by client, project and day, matching the tracker report', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '116');
      const sp = await tx.client.create({ data: { companyId: w.companyId, name: 'Svět Plodů' } });
      const web = await tx.project.create({ data: { clientId: sp.id, name: 'Web' } });
      const other = await tx.client.create({ data: { companyId: w.companyId, name: 'Jiný' } });

      await entry(tx, w, '2026-10-01T07:00:00Z', 120, { clientId: sp.id, projectId: web.id });
      await entry(tx, w, '2026-10-01T10:00:00Z', 90, { clientId: sp.id });
      await entry(tx, w, '2026-10-15T08:00:00Z', 60, { clientId: other.id });
      // Starts on 31 Oct (Prague) and runs past midnight: only the in-period part counts.
      await entry(tx, w, '2026-10-31T22:30:00Z', 60, { clientId: sp.id, projectId: web.id });
      // Outside October.
      await entry(tx, w, '2026-11-02T08:00:00Z', 600, { clientId: sp.id });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const call = async (args: Record<string, unknown>) => {
          const out = await m.client.callTool({ name: 'summarize_entries', arguments: args });
          expect(out.isError).toBeFalsy();
          return out.structuredContent as unknown as Summary;
        };
        const month = { from: '2026-10-01', to: '2026-10-31' };

        const byClient = await call({ ...month, groupBy: 'client' });
        expect(byClient.entryCount).toBe(4);
        expect(byClient.totalMinutes).toBe(120 + 90 + 60 + 30);
        expect(byClient.totalHours).toBe(5);
        const spGroup = byClient.groups.find((g) => g.clientId === sp.id)!;
        expect(spGroup).toMatchObject({ clientName: 'Svět Plodů', minutes: 240, entryCount: 3 });

        const onlySp = await call({ ...month, clientId: sp.id, groupBy: 'project' });
        expect(onlySp.totalMinutes).toBe(240);
        expect(onlySp.groups.map((g) => [g.projectName, g.minutes])).toEqual([
          [null, 90],
          ['Web', 150],
        ]);

        const byDay = await call({ ...month, groupBy: 'day' });
        expect(byDay.groups.map((g) => [g.day, g.minutes])).toEqual([
          ['2026-10-01', 210],
          ['2026-10-15', 60],
          ['2026-10-31', 30],
        ]);

        // Same numbers as the /reports page for the same filters.
        const range = parseInclusiveAppZoneRange(month.from, month.to);
        const report = await runReport(tx, w.userId, {
          companyId: w.companyId,
          ...range,
          clientIds: [sp.id],
        });
        if (!report.ok) throw new Error('report');
        const grouped = buildGroupedReport(report.value, {
          groupBy: 'project',
          clampEnd: range.to,
        });
        expect(onlySp.totalMinutes).toBe(grouped.grandTotalMs / MIN);
      } finally {
        await m.close();
      }
    });
  });

  it('US-116: missing range is invalid_args; foreign company or client is not_found', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '116-scope');
      const other = await createCompany(tx, { name: 'SE other', createdByUserId: w.userId });
      const otherId = typeof other === 'string' ? other : other.id;
      const otherClient = await tx.client.create({ data: { companyId: otherId, name: 'Cizí' } });
      const month = { from: '2026-10-01', to: '2026-10-31' };

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const missing = await m.client.callTool({
          name: 'summarize_entries',
          arguments: { from: '2026-10-01' },
        });
        expect(missing.isError).toBe(true);

        for (const args of [
          { ...month, companyId: otherId },
          { ...month, clientId: otherClient.id },
        ]) {
          const out = await m.client.callTool({ name: 'summarize_entries', arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }
      } finally {
        await m.close();
      }
    });
  });
});
