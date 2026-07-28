/**
 * Compatibility shim for installed extensions (ADR-0015).
 *
 * AIAGE-57 removed tags, but the extension ships through the Chrome Web Store, so
 * published build 1.6.1 keeps calling the freshly-deployed API and does
 * `catalog.tags.length` / `e.tags.map(...)` with no runtime validation — an absent
 * key is `undefined` and the popup throws.
 *
 * These tests pin the empty arrays so the shim cannot be dropped by accident. When
 * 1.6.2+ adoption is high enough, delete the shim AND this file together.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { createClient } from '../../src/lib/services/catalog.js';

const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  userId: '',
  companyId: null as string | null,
}));

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
          autoStackOverlaps: false,
          authSource: 'extension' as const,
          memberships: [],
        }
      : null,
  pickActiveCompany: () => (ctx.companyId ? { companyId: ctx.companyId, role: 'admin' } : null),
}));

const { GET: catalogGet } = await import('../../src/app/api/v1/catalog/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

function req(url: string): NextRequest {
  return new NextRequest(url);
}

describe('extension compatibility shim (ADR-0015)', () => {
  it('US-18: /api/v1/catalog still serves an empty tags array for installed extensions', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({
        data: { email: 'shim@example.test', fullName: 'Shim', passwordHash: 'x' },
      });
      ctx.userId = user.id;
      const co = await createCompany(tx, { name: 'Shim Co', createdByUserId: user.id });
      ctx.companyId = co.id;
      await createClient(tx, user.id, { companyId: co.id, name: 'Acme' });

      const body = (await (await catalogGet(req('http://localhost/api/v1/catalog'))).json()) as {
        clients: unknown[];
        tags: unknown[];
      };

      // The crash site in 1.6.1 is `catalog.tags.length > 0` — an absent key throws.
      expect(Array.isArray(body.tags)).toBe(true);
      expect(body.tags).toEqual([]);
      expect(body.clients.length).toBeGreaterThan(0);
    });
  });

  it('US-18: the no-active-company early return also carries the tags array', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({
        data: { email: 'shim2@example.test', fullName: 'Shim2', passwordHash: 'x' },
      });
      ctx.userId = user.id;
      ctx.companyId = null; // pickActiveCompany returns null

      const body = (await (await catalogGet(req('http://localhost/api/v1/catalog'))).json()) as {
        companyId: string | null;
        tags: unknown[];
      };

      expect(body.companyId).toBeNull();
      expect(body.tags).toEqual([]);
    });
  });
});
