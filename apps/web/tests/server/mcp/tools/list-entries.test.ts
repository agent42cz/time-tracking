import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface Row {
  id: string;
  title: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  running: boolean;
  durationMinutes: number;
  clientId: string | null;
  projectId: string | null;
}
interface Page {
  entries: Row[];
  nextCursor: string | null;
}

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `le-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `LE ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

const MIN = 60_000;

describe('mcp tool: list_entries', () => {
  it('US-115: pages through a whole Prague month with cursor, filters by client and text', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '115');
      const acme = await tx.client.create({ data: { companyId: w.companyId, name: 'Acme' } });
      // 60 entries across October 2026 — more than the old 50-row cap.
      const base = Date.parse('2026-10-01T06:00:00Z');
      for (let i = 0; i < 60; i++) {
        const startedAt = new Date(base + i * 12 * 60 * MIN);
        await tx.timeEntry.create({
          data: {
            userId: w.userId,
            companyId: w.companyId,
            clientId: i % 2 === 0 ? acme.id : null,
            description: i === 7 ? 'Faktura Gaude' : `práce ${i}`,
            note: 'x'.repeat(800),
            startedAt,
            endedAt: new Date(startedAt.getTime() + 90 * MIN),
          },
        });
      }
      // Just outside the range on both sides (Prague midnight = 22:00Z in October).
      for (const iso of ['2026-09-30T21:30:00Z', '2026-10-31T23:30:00Z']) {
        await tx.timeEntry.create({
          data: {
            userId: w.userId,
            companyId: w.companyId,
            startedAt: new Date(iso),
            endedAt: new Date(Date.parse(iso) + 10 * MIN),
          },
        });
      }

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const seen: Row[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
          const out = await m.client.callTool({
            name: 'list_entries',
            arguments: { from: '2026-10-01', to: '2026-10-31', limit: 25, cursor },
          });
          expect(out.isError).toBeFalsy();
          const page = out.structuredContent as unknown as Page;
          seen.push(...page.entries);
          cursor = page.nextCursor ?? undefined;
          pages++;
        } while (cursor);
        expect(pages).toBe(3);
        expect(seen).toHaveLength(60);
        expect(new Set(seen.map((e) => e.id)).size).toBe(60);
        // Chronological and untruncated, with a duration and a running flag.
        expect(seen[0]!.startedAt).toBe('2026-10-01T06:00:00.000Z');
        expect(seen[0]!.description).toHaveLength(800);
        expect(seen[0]!.durationMinutes).toBe(90);
        expect(seen[0]!.running).toBe(false);

        const byClient = await m.client.callTool({
          name: 'list_entries',
          arguments: { from: '2026-10-01', to: '2026-10-31', clientId: acme.id, limit: 100 },
        });
        const clientRows = (byClient.structuredContent as unknown as Page).entries;
        expect(clientRows).toHaveLength(30);
        expect(clientRows.every((e) => e.clientId === acme.id)).toBe(true);

        const byText = await m.client.callTool({
          name: 'list_entries',
          arguments: { query: 'gaude' },
        });
        const textRows = (byText.structuredContent as unknown as Page).entries;
        expect(textRows.map((e) => e.title)).toEqual(['Faktura Gaude']);
      } finally {
        await m.close();
      }
    });
  });

  it('US-115: marks a running entry and counts its duration up to now', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '115-run');
      await tx.timeEntry.create({
        data: {
          userId: w.userId,
          companyId: w.companyId,
          startedAt: new Date(Date.now() - 30 * MIN),
        },
      });
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({ name: 'list_entries', arguments: {} });
        const [row] = (out.structuredContent as unknown as Page).entries;
        expect(row!.running).toBe(true);
        expect(row!.endedAt).toBeNull();
        expect(row!.durationMinutes).toBeGreaterThanOrEqual(30);
        expect(row!.durationMinutes).toBeLessThan(32);
      } finally {
        await m.close();
      }
    });
  });

  it('US-115: a garbled cursor or reversed range is invalid_args', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '115-bad');
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        for (const args of [{ cursor: 'not-a-cursor' }, { from: '2026-10-31', to: '2026-10-01' }]) {
          const out = await m.client.callTool({ name: 'list_entries', arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'invalid_args' });
        }
        // Not a calendar day: rejected by the input schema (SDK error, no structured code).
        for (const args of [{ from: '2026-13-01' }, { to: '2026-02-31' }]) {
          const out = await m.client.callTool({ name: 'list_entries', arguments: args });
          expect(out.isError).toBe(true);
          expect(JSON.stringify(out.content)).not.toContain('Invalid time value');
        }
      } finally {
        await m.close();
      }
    });
  });

  it("US-115: another company, its client, or a colleague's entries never show up", async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '115-scope');
      const colleague = await tx.user.create({ data: { email: 'le-col@x.test', fullName: 'C' } });
      await tx.membership.create({
        data: { userId: colleague.id, companyId: w.companyId, role: 'user' },
      });
      await tx.timeEntry.create({
        data: {
          userId: colleague.id,
          companyId: w.companyId,
          startedAt: new Date('2026-10-02T08:00:00Z'),
          endedAt: new Date('2026-10-02T09:00:00Z'),
        },
      });
      const other = await createCompany(tx, { name: 'LE other', createdByUserId: w.userId });
      const otherId = typeof other === 'string' ? other : other.id;
      const otherClient = await tx.client.create({ data: { companyId: otherId, name: 'Cizí' } });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const own = await m.client.callTool({ name: 'list_entries', arguments: {} });
        expect((own.structuredContent as unknown as Page).entries).toEqual([]);

        for (const args of [{ companyId: otherId }, { clientId: otherClient.id }]) {
          const out = await m.client.callTool({ name: 'list_entries', arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }
      } finally {
        await m.close();
      }
    });
  });
});
