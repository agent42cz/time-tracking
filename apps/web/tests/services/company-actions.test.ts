import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { createSession } from '../../src/lib/auth/sessions.js';
const state = vi.hoisted(() => ({ cookies: new Map<string, string>(), revalidate: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (key: string) => (state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined),
    set: (key: string, value: string) => state.cookies.set(key, value),
    delete: (key: string) => state.cookies.delete(key),
  }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/cache', () => ({ revalidatePath: state.revalidate }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error('404');
  },
}));
const { createCompanyAction } = await import('../../src/lib/actions/companies.js');
const { switchCompanyAction } = await import('../../src/lib/actions/auth.js');
beforeAll(() => getTestPrisma(), 180_000);
afterAll(() => {
  globalThis.__ttPrisma = undefined;
  return stopTestPrisma();
});
it('US-6: creates a second firm via settings and updates the active company and navigation', async () => {
  await withTx(async (db) => {
    globalThis.__ttPrisma = db as PrismaClient;
    state.cookies.clear();
    state.revalidate.mockClear();
    const user = await db.user.create({ data: { email: 'action@test.cz', fullName: 'U' } });
    const first = await createCompany(db, { name: 'First', createdByUserId: user.id });
    const session = await createSession(db, user.id);
    state.cookies.set('tt-session', session.token);
    state.cookies.set('tt-company', first.id);
    const auditCount = () => db.auditLog.count();
    const before = await auditCount();
    const form = new FormData();
    form.set('name', 'My second company');
    await expect(createCompanyAction(form)).rejects.toThrow('redirect:/timer');
    expect(state.cookies.get('tt-company')).not.toBe(first.id);
    expect(await db.membership.count({ where: { userId: user.id } })).toBe(2);
    expect(await auditCount()).toBe(before + 1);
    expect(state.revalidate).toHaveBeenCalledWith('/', 'layout');
  });
});
it('US-7: web switching rejects an inaccessible company and leaves the current selection intact', async () => {
  await withTx(async (db) => {
    globalThis.__ttPrisma = db as PrismaClient;
    state.cookies.clear();
    const user = await db.user.create({ data: { email: 'switch@test.cz', fullName: 'U' } });
    const first = await createCompany(db, { name: 'First', createdByUserId: user.id });
    const session = await createSession(db, user.id);
    state.cookies.set('tt-session', session.token);
    state.cookies.set('tt-company', first.id);
    await expect(switchCompanyAction('missing')).rejects.toThrow('404');
    expect(state.cookies.get('tt-company')).toBe(first.id);
  });
});
it('US-7: switching company updates the cookie and does not force /timer', async () => {
  await withTx(async (db) => {
    globalThis.__ttPrisma = db as PrismaClient;
    state.cookies.clear();
    state.revalidate.mockClear();
    const user = await db.user.create({ data: { email: 'stay@test.cz', fullName: 'U' } });
    const first = await createCompany(db, { name: 'First', createdByUserId: user.id });
    const second = await createCompany(db, { name: 'Second', createdByUserId: user.id });
    const session = await createSession(db, user.id);
    state.cookies.set('tt-session', session.token);
    state.cookies.set('tt-company', first.id);
    await expect(switchCompanyAction(second.id)).resolves.toBeUndefined();
    expect(state.cookies.get('tt-company')).toBe(second.id);
    expect(state.revalidate).toHaveBeenCalledWith('/', 'layout');
  });
});
