import { afterAll, beforeAll, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { createManualEntry, startTimer, updateEntry } from '../../src/lib/services/time-entries.js';
beforeAll(() => getTestPrisma(), 180_000);
afterAll(() => stopTestPrisma());
it('US-7: second-company entries reject clients and projects from the first company on create and edit', async () => {
  await withTx(async (db) => {
    const user = await db.user.create({ data: { email: 'links@test.cz', fullName: 'U' } });
    const a = await createCompany(db, { name: 'A', createdByUserId: user.id });
    const b = await createCompany(db, { name: 'B', createdByUserId: user.id });
    const client = await db.client.create({ data: { companyId: a.id, name: 'A Client' } });
    const project = await db.project.create({ data: { clientId: client.id, name: 'A Project' } });
    const timer = await startTimer(db, user.id, { companyId: b.id });
    if (!timer.ok) throw new Error('setup');
    const auditCount = () => db.auditLog.count();
    const before = await auditCount();
    for (const refs of [
      { clientId: client.id },
      { projectId: project.id },
      { clientId: 'missing' },
      { projectId: 'missing' },
    ]) {
      expect(await startTimer(db, user.id, { companyId: b.id, ...refs })).toMatchObject({
        ok: false,
        reason: 'not_found',
      });
      expect(
        await createManualEntry(db, user.id, {
          companyId: b.id,
          ...refs,
          startedAt: new Date('2026-01-01T10:00:00Z'),
          endedAt: new Date('2026-01-01T11:00:00Z'),
        }),
      ).toMatchObject({ ok: false, reason: 'not_found' });
      expect(await updateEntry(db, user.id, timer.value.id, refs)).toMatchObject({
        ok: false,
        reason: 'not_found',
      });
    }
    expect(await auditCount()).toBe(before);
  });
});
