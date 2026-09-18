import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createSession } from '../../src/lib/auth/sessions.js';
import { createCompany } from '../../src/lib/services/companies.js';

const ctx = vi.hoisted(() => ({ db: null as unknown as Prisma.TransactionClient }));
vi.mock('@/lib/session', () => ({
  prisma: () => ctx.db,
  SESSION_COOKIE: 'tt-session',
  COMPANY_COOKIE: 'tt-company',
}));
const timer = await import('../../src/app/api/v1/timer/route.js');
const catalog = await import('../../src/app/api/v1/catalog/route.js');
const entries = await import('../../src/app/api/v1/entries/route.js');
beforeAll(() => getTestPrisma(), 180_000);
afterAll(() => stopTestPrisma());

it('US-7: REST explicitly selects the second company and rejects unknown companies without fallback writes', async () => {
  await withTx(async (db) => {
    ctx.db = db;
    const user = await db.user.create({ data: { email: 'rest-multi@test.cz', fullName: 'M' } });
    const a = await createCompany(db, { name: 'A', createdByUserId: user.id });
    const b = await createCompany(db, { name: 'B', createdByUserId: user.id });
    const otherUser = await db.user.create({
      data: { email: 'rest-other@test.cz', fullName: 'O' },
    });
    const other = await createCompany(db, { name: 'Other', createdByUserId: otherUser.id });
    const { token } = await createSession(db, user.id);
    const request = (path: string, company: string, method = 'GET') =>
      new NextRequest(`http://localhost/api/v1/${path}?company=${company}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(method === 'POST'
          ? {
              body: JSON.stringify({
                description: 'Second',
                startedAt: '2026-01-01T10:00:00Z',
                endedAt: '2026-01-01T11:00:00Z',
              }),
            }
          : {}),
      });
    const auditCount = () => db.auditLog.count();
    const before = await auditCount();
    expect((await timer.POST(request('timer', b.id, 'POST'))).status).toBe(200);
    expect(await auditCount()).toBe(before + 1);
    const result = await (await timer.GET(request('timer', b.id))).json();
    expect(result.companyId).toBe(b.id);
    expect(result.running).toHaveLength(1);
    expect((await (await timer.GET(request('timer', a.id))).json()).running).toHaveLength(0);
    expect((await (await catalog.GET(request('catalog', b.id))).json()).companyId).toBe(b.id);
    for (const company of [other.id, 'missing']) {
      expect((await timer.GET(request('timer', company))).status).toBe(404);
      expect((await catalog.GET(request('catalog', company))).status).toBe(404);
      expect((await timer.POST(request('timer', company, 'POST'))).status).toBe(404);
      expect((await entries.POST(request('entries', company, 'POST'))).status).toBe(404);
    }
    expect(await auditCount()).toBe(before + 1);
  });
});

it('US-7: cookie-authenticated timer read uses the active-company cookie, not the first membership', async () => {
  await withTx(async (db) => {
    ctx.db = db;
    const user = await db.user.create({ data: { email: 'cookie-multi@test.cz', fullName: 'M' } });
    const first = await createCompany(db, { name: 'First', createdByUserId: user.id });
    const second = await createCompany(db, { name: 'Second', createdByUserId: user.id });
    const { token } = await createSession(db, user.id);
    const startOnSecond = new NextRequest(`http://localhost/api/v1/timer?company=${second.id}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Second company work' }),
    });
    expect((await timer.POST(startOnSecond)).status).toBe(200);

    const webRead = new NextRequest('http://localhost/api/v1/timer', {
      headers: { cookie: `tt-session=${token}; tt-company=${second.id}` },
    });
    const body = (await (await timer.GET(webRead)).json()) as {
      companyId: string;
      running: { description: string }[];
    };
    expect(body.companyId).toBe(second.id);
    expect(body.companyId).not.toBe(first.id);
    expect(body.running).toHaveLength(1);
    expect(body.running[0]?.description).toBe('Second company work');
  });
});
