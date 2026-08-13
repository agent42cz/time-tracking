/**
 * Nepřítomnost — absence notices, seen state and the week overview.
 * Covers US-105 … US-112.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { addDaysToDay } from '@tt/shared';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import {
  ABSENCE_MAX_PER_HOUR,
  countUnseenAbsences,
  createAbsence,
  deleteAbsence,
  getWeekOverview,
  listAbsences,
  listPastAbsences,
  markAbsenceSeen,
  markAllAbsencesSeen,
  updateAbsence,
} from '../../src/lib/services/absences.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

/** Fixed "today" so the lead-time rules are deterministic. 2026-08-13 is a Thursday. */
const TODAY = '2026-08-13';
const TOMORROW = '2026-08-14';
/** Monday of the following week. */
const NEXT_MONDAY = '2026-08-17';

interface World {
  admin: string;
  admin2: string;
  member: string;
  outsider: string;
  company: string;
  otherCompany: string;
}

async function bootstrap(tx: Prisma.TransactionClient, suffix: string): Promise<World> {
  const admin = await tx.user.create({
    data: { email: `abs-admin-${suffix}@example.test`, fullName: 'Alena Admin' },
  });
  const admin2 = await tx.user.create({
    data: { email: `abs-admin2-${suffix}@example.test`, fullName: 'Bedřich Admin' },
  });
  const member = await tx.user.create({
    data: { email: `abs-member-${suffix}@example.test`, fullName: 'Cyril Člen' },
  });
  const outsider = await tx.user.create({
    data: { email: `abs-out-${suffix}@example.test`, fullName: 'Dana Cizí' },
  });
  const company = await createCompany(tx, { name: `Abs ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({
    data: { userId: admin2.id, companyId: company.id, role: 'admin' },
  });
  await tx.membership.create({ data: { userId: member.id, companyId: company.id, role: 'user' } });
  const otherCompany = await createCompany(tx, {
    name: `Abs other ${suffix}`,
    createdByUserId: outsider.id,
  });
  return {
    admin: admin.id,
    admin2: admin2.id,
    member: member.id,
    outsider: outsider.id,
    company: company.id,
    otherCompany: otherCompany.id,
  };
}

async function auditCount(tx: Prisma.TransactionClient, companyId: string): Promise<number> {
  return tx.auditLog.count({ where: { companyId, entityType: 'absence' } });
}

describe('absences (Nepřítomnost)', () => {
  it('US-105: a member reports an absence and it shows up in the company list with one audit row', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'create');
      const before = await auditCount(tx, w.company);

      const created = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'vacation',
          startDate: NEXT_MONDAY,
          endDate: '2026-08-18',
          note: 'Chorvatsko',
        },
        TODAY,
      );
      expect(created.ok).toBe(true);
      expect(await auditCount(tx, w.company)).toBe(before + 1);

      // The admin sees the whole company…
      const adminList = await listAbsences(tx, w.admin, w.company, { today: TODAY });
      expect(adminList.ok && adminList.value).toHaveLength(1);
      expect(adminList.ok && adminList.value[0]).toMatchObject({
        userName: 'Cyril Člen',
        kind: 'vacation',
        startDate: NEXT_MONDAY,
        endDate: '2026-08-18',
        note: 'Chorvatsko',
      });

      // …and the author sees their own row.
      const memberList = await listAbsences(tx, w.member, w.company, { today: TODAY });
      expect(memberList.ok && memberList.value).toHaveLength(1);
    });
  });

  it('US-106: a notice for today is rejected as too late and writes nothing', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'late');
      const before = await auditCount(tx, w.company);

      const r = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'sick',
          startDate: TODAY,
          endDate: TODAY,
        },
        TODAY,
      );
      expect(r).toEqual({ ok: false, reason: 'too_late' });
      expect(await tx.absence.count({ where: { companyId: w.company } })).toBe(0);
      expect(await auditCount(tx, w.company)).toBe(before);

      // Tomorrow is fine.
      const ok = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'sick',
          startDate: TOMORROW,
          endDate: TOMORROW,
        },
        TODAY,
      );
      expect(ok.ok).toBe(true);
    });
  });

  it('US-105: the audit trail records the dates and the owner, never the health reason', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'auditprivacy');
      const created = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'sick',
          startDate: TOMORROW,
          endDate: TOMORROW,
          note: 'zápal plic',
        },
        TODAY,
      );
      const id = created.ok ? created.value.id : '';
      await updateAbsence(tx, w.member, id, { endDate: NEXT_MONDAY }, TODAY);
      await deleteAbsence(tx, w.member, id);

      const rows = await tx.auditLog.findMany({
        where: { companyId: w.company, entityType: 'absence' },
      });
      expect(rows).toHaveLength(3);
      // Audit rows are immutable and outlive the absence — they must not
      // become a permanent record of who was ill and why.
      const dumped = JSON.stringify(rows.map((r) => ({ before: r.before, after: r.after })));
      expect(dumped).not.toContain('sick');
      expect(dumped).not.toContain('zápal plic');
      // …while still carrying enough to answer "who moved which days".
      expect(dumped).toContain(TOMORROW);
      expect(dumped).toContain(w.member);
    });
  });

  it('US-105: a runaway client cannot flood the company with notices', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'ratelimit');
      const file = (dayOffset: number): ReturnType<typeof createAbsence> =>
        createAbsence(
          tx,
          w.member,
          {
            companyId: w.company,
            kind: 'other',
            startDate: addDaysToDay(TODAY, dayOffset),
            endDate: addDaysToDay(TODAY, dayOffset),
          },
          TODAY,
        );

      for (let i = 1; i <= ABSENCE_MAX_PER_HOUR; i += 1) {
        expect((await file(i)).ok).toBe(true);
      }
      expect(await file(ABSENCE_MAX_PER_HOUR + 1)).toEqual({ ok: false, reason: 'rate_limited' });
      expect(await tx.absence.count({ where: { companyId: w.company } })).toBe(
        ABSENCE_MAX_PER_HOUR,
      );

      // The cap is per author — a colleague is unaffected.
      const other = await createAbsence(
        tx,
        w.admin2,
        { companyId: w.company, kind: 'other', startDate: TOMORROW, endDate: TOMORROW },
        TODAY,
      );
      expect(other.ok).toBe(true);
    });
  });

  it('US-106: a client-supplied field cannot move "today" and backdate a notice', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'clockspoof');
      // A server action deserializes its arguments straight from the browser,
      // and TypeScript types are erased at runtime — so the clock must not be
      // reachable through the input/patch objects. Simulate the crafted
      // payload: extra `today` key, cast away, still rejected.
      const crafted = {
        companyId: w.company,
        kind: 'vacation',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        today: '2026-07-01',
      } as unknown as Parameters<typeof createAbsence>[2];

      expect(await createAbsence(tx, w.member, crafted, TODAY)).toEqual({
        ok: false,
        reason: 'too_late',
      });
      expect(await tx.absence.count({ where: { companyId: w.company } })).toBe(0);

      const existing = await createAbsence(
        tx,
        w.member,
        { companyId: w.company, kind: 'vacation', startDate: NEXT_MONDAY, endDate: NEXT_MONDAY },
        TODAY,
      );
      const id = existing.ok ? existing.value.id : '';
      const craftedPatch = {
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        today: '2026-07-01',
      } as unknown as Parameters<typeof updateAbsence>[3];
      expect(await updateAbsence(tx, w.member, id, craftedPatch, TODAY)).toEqual({
        ok: false,
        reason: 'too_late',
      });
    });
  });

  it('US-105: a long absence is accepted whether it is filed a week or a month ahead', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'longabsence');

      // US-107 (retired) used to flag the first of these as short notice.
      // Nothing distinguishes them now — both are ordinary rows.
      const late = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'vacation',
          startDate: '2026-08-24',
          endDate: '2026-08-28',
        },
        TODAY,
      );
      expect(late.ok).toBe(true);

      const early = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'vacation',
          startDate: '2026-09-21',
          endDate: '2026-09-25',
        },
        TODAY,
      );
      expect(early.ok).toBe(true);

      const list = await listAbsences(tx, w.admin, w.company, { today: TODAY });
      expect(list.ok && list.value).toHaveLength(2);
    });
  });

  it('US-108: the admin badge counts other members unseen notices, never their own', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'badge');
      await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'doctor',
          startDate: TOMORROW,
          endDate: TOMORROW,
        },
        TODAY,
      );
      await createAbsence(
        tx,
        w.admin,
        {
          companyId: w.company,
          kind: 'vacation',
          startDate: NEXT_MONDAY,
          endDate: NEXT_MONDAY,
        },
        TODAY,
      );

      expect(await countUnseenAbsences(tx, w.admin, w.company, { today: TODAY })).toBe(1);
      // A plain member has no company-wide view, so nothing to be notified about.
      expect(await countUnseenAbsences(tx, w.member, w.company, { today: TODAY })).toBe(0);

      // Something that already ended is no longer news.
      await tx.absence.updateMany({
        where: { companyId: w.company, userId: w.member },
        data: { startDate: new Date('2026-08-01'), endDate: new Date('2026-08-02') },
      });
      expect(await countUnseenAbsences(tx, w.admin, w.company, { today: TODAY })).toBe(0);
    });
  });

  it('US-109: opening an absence clears the badge for that admin only', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'seen');
      const created = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'personal',
          startDate: TOMORROW,
          endDate: TOMORROW,
        },
        TODAY,
      );
      const id = created.ok ? created.value.id : '';

      expect(await markAbsenceSeen(tx, w.admin, id)).toEqual({ ok: true, value: true });
      expect(await countUnseenAbsences(tx, w.admin, w.company, { today: TODAY })).toBe(0);
      // Seen state is per viewer — the second admin still has it pending.
      expect(await countUnseenAbsences(tx, w.admin2, w.company, { today: TODAY })).toBe(1);

      // Acknowledging twice is a no-op, not a duplicate-key crash.
      expect(await markAbsenceSeen(tx, w.admin, id)).toEqual({ ok: true, value: true });

      const list = await listAbsences(tx, w.admin, w.company, { today: TODAY });
      expect(list.ok && list.value[0]?.seen).toBe(true);

      // "Označit vše jako přečtené" clears the rest in one go.
      const all = await markAllAbsencesSeen(tx, w.admin2, w.company, { today: TODAY });
      expect(all.ok && all.value.marked).toBe(1);
      expect(await countUnseenAbsences(tx, w.admin2, w.company, { today: TODAY })).toBe(0);
    });
  });

  it('US-110: editing an absence re-notifies everyone who had already seen it', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'edit');
      const created = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'vacation',
          startDate: TOMORROW,
          endDate: TOMORROW,
        },
        TODAY,
      );
      const id = created.ok ? created.value.id : '';
      await markAbsenceSeen(tx, w.admin, id);
      expect(await countUnseenAbsences(tx, w.admin, w.company, { today: TODAY })).toBe(0);

      const before = await auditCount(tx, w.company);
      const updated = await updateAbsence(
        tx,
        w.member,
        id,
        {
          startDate: NEXT_MONDAY,
          endDate: '2026-08-19',
        },
        TODAY,
      );
      expect(updated.ok).toBe(true);
      expect(await auditCount(tx, w.company)).toBe(before + 1);
      // The dates moved, so the admin must look again.
      expect(await countUnseenAbsences(tx, w.admin, w.company, { today: TODAY })).toBe(1);
    });
  });

  it('US-111: the week overview lists absent days per member, including a run that started earlier', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'week');
      // Starts before the target week (Mon 17th) and runs into it.
      await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'vacation',
          startDate: '2026-08-14',
          endDate: '2026-08-18',
        },
        TODAY,
      );
      await createAbsence(
        tx,
        w.admin2,
        {
          companyId: w.company,
          kind: 'doctor',
          startDate: '2026-08-19',
          endDate: '2026-08-19',
        },
        TODAY,
      );

      const week = await getWeekOverview(tx, w.admin, w.company, NEXT_MONDAY);
      expect(week.ok).toBe(true);
      if (!week.ok) return;
      expect(week.value.days).toEqual([
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
        '2026-08-20',
        '2026-08-21',
        '2026-08-22',
        '2026-08-23',
      ]);
      // Sorted by name: Bedřich (admin2) then Cyril (member).
      expect(week.value.members.map((m) => m.userName)).toEqual(['Bedřich Admin', 'Cyril Člen']);
      expect(week.value.members[1]?.days.map((d) => d.day)).toEqual(['2026-08-17', '2026-08-18']);
      expect(week.value.members[0]?.days.map((d) => d.day)).toEqual(['2026-08-19']);

      // A plain member sees only their own row in the same week.
      const memberWeek = await getWeekOverview(tx, w.member, w.company, NEXT_MONDAY);
      expect(memberWeek.ok && memberWeek.value.members.map((m) => m.userId)).toEqual([w.member]);
    });
  });

  it('US-112: cross-company access to absences returns not_found on every operation', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'crosscompany');
      const created = await createAbsence(
        tx,
        w.member,
        {
          companyId: w.company,
          kind: 'vacation',
          startDate: NEXT_MONDAY,
          endDate: NEXT_MONDAY,
        },
        TODAY,
      );
      const id = created.ok ? created.value.id : '';

      // Reads
      expect(await listAbsences(tx, w.outsider, w.company, { today: TODAY })).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await listPastAbsences(tx, w.outsider, w.company, { today: TODAY })).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await getWeekOverview(tx, w.outsider, w.company, NEXT_MONDAY)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await countUnseenAbsences(tx, w.outsider, w.company, { today: TODAY })).toBe(0);

      // Mutations
      const auditBefore = await auditCount(tx, w.company);
      expect(
        await createAbsence(
          tx,
          w.outsider,
          {
            companyId: w.company,
            kind: 'vacation',
            startDate: NEXT_MONDAY,
            endDate: NEXT_MONDAY,
          },
          TODAY,
        ),
      ).toEqual({ ok: false, reason: 'not_found' });
      expect(await updateAbsence(tx, w.outsider, id, { kind: 'sick' }, TODAY)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await deleteAbsence(tx, w.outsider, id)).toEqual({ ok: false, reason: 'not_found' });
      expect(await markAbsenceSeen(tx, w.outsider, id)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await auditCount(tx, w.company)).toBe(auditBefore);

      // A same-company member cannot touch someone else's notice either — but
      // an admin can, and the author can delete their own (one audit row).
      const other = await createAbsence(
        tx,
        w.admin2,
        {
          companyId: w.company,
          kind: 'doctor',
          startDate: NEXT_MONDAY,
          endDate: NEXT_MONDAY,
        },
        TODAY,
      );
      const otherId = other.ok ? other.value.id : '';
      expect(await deleteAbsence(tx, w.member, otherId)).toEqual({
        ok: false,
        reason: 'not_found',
      });

      const beforeDelete = await auditCount(tx, w.company);
      expect(await deleteAbsence(tx, w.member, id)).toEqual({ ok: true, value: true });
      expect(await auditCount(tx, w.company)).toBe(beforeDelete + 1);
      expect(await tx.absence.findUnique({ where: { id } })).toBeNull();
    });
  });
});
