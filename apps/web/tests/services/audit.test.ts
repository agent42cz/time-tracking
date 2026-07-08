/**
 * Phase 6 — Audit log read surface + immutability + per-entry history.
 * Covers US-44, US-45, US-46.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { AuditAction, type AuditSource } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import {
  restoreEntry,
  softDeleteEntry,
  startTimer,
  updateEntry,
} from '../../src/lib/services/time-entries.js';
import { listAuditLog } from '../../src/lib/services/audit-query.js';
import { writeAudit } from '../../src/lib/services/audit.js';
import { ALL_ACTIONS } from '../../src/app/(authenticated)/audit/audit-actions.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface World {
  admin: string;
  user: string;
  outsider: string;
  company: string;
}

async function bootstrap(tx: Prisma.TransactionClient, suffix: string): Promise<World> {
  const admin = await tx.user.create({ data: { email: `aud-a-${suffix}@x.test`, fullName: 'A' } });
  const user = await tx.user.create({ data: { email: `aud-u-${suffix}@x.test`, fullName: 'U' } });
  const outsider = await tx.user.create({
    data: { email: `aud-o-${suffix}@x.test`, fullName: 'O' },
  });
  const company = await createCompany(tx, { name: `Aud ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
  await createCompany(tx, { name: `Other ${suffix}`, createdByUserId: outsider.id });
  return { admin: admin.id, user: user.id, outsider: outsider.id, company: company.id };
}

describe('audit log', () => {
  it('US-44: admin can filter the firm-wide log by actor/action/entity/date', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us44');
      const a = await startTimer(tx, w.user, { companyId: w.company, description: 'first' });
      const b = await startTimer(tx, w.user, { companyId: w.company, description: 'second' });
      if (!a.ok || !b.ok) throw new Error('setup');
      await updateEntry(tx, w.admin, b.value.id, { description: 'admin-edit' });

      const all = await listAuditLog(tx, w.admin, { companyId: w.company });
      expect(all.ok).toBe(true);
      if (all.ok) expect(all.value.rows.length).toBeGreaterThanOrEqual(3);

      const onlyAdmin = await listAuditLog(tx, w.admin, {
        companyId: w.company,
        actorUserId: w.admin,
      });
      expect(onlyAdmin.ok).toBe(true);
      if (onlyAdmin.ok)
        expect(onlyAdmin.value.rows.every((r) => r.actorUserId === w.admin)).toBe(true);

      const onlyUpdates = await listAuditLog(tx, w.admin, {
        companyId: w.company,
        action: 'update',
      });
      expect(onlyUpdates.ok).toBe(true);
      if (onlyUpdates.ok)
        expect(onlyUpdates.value.rows.every((r) => r.action === 'update')).toBe(true);

      // cross-company / non-admin
      const userView = await listAuditLog(tx, w.user, { companyId: w.company });
      expect(userView.ok).toBe(false);
      const cross = await listAuditLog(tx, w.outsider, { companyId: w.company });
      expect(cross.ok).toBe(false);
    });
  });

  it('US-45: per-entry history is exposed (already covered by getEntryHistory)', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us45');
      const a = await startTimer(tx, w.user, { companyId: w.company, description: 'orig' });
      if (!a.ok) throw new Error('setup');
      await updateEntry(tx, w.user, a.value.id, { description: 'v2' });
      const filtered = await listAuditLog(tx, w.admin, {
        companyId: w.company,
        entityType: 'TimeEntry',
        entityId: a.value.id,
      });
      expect(filtered.ok).toBe(true);
      if (filtered.ok) expect(filtered.value.rows).toHaveLength(2);
    });
  });

  it('US-46: admin restores from trash and the restore is itself audited', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us46');
      const a = await startTimer(tx, w.user, { companyId: w.company });
      if (!a.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, a.value.id);
      await restoreEntry(tx, w.admin, a.value.id);

      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: a.value.id } });
      expect(reread.deletedAt).toBeNull();

      const audit = await tx.auditLog.findMany({
        where: { entityType: 'TimeEntry', entityId: a.value.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((r) => r.action)).toEqual(['create', 'delete', 'restore']);
    });
  });

  it('writeAudit defaults source to web and stores the override', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'src');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');

      // Default branch
      await writeAudit(tx, {
        companyId: w.company,
        actorUserId: w.user,
        action: 'update',
        entityType: 'TimeEntry',
        entityId: e.value.id,
      });
      // Explicit mcp branch
      await writeAudit(tx, {
        companyId: w.company,
        actorUserId: w.user,
        action: 'update',
        entityType: 'TimeEntry',
        entityId: e.value.id,
        source: 'mcp' satisfies AuditSource,
      });

      const rows = await tx.auditLog.findMany({
        where: { entityType: 'TimeEntry', entityId: e.value.id, action: 'update' },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.source)).toEqual(['web', 'mcp']);
    });
  });

  it('audit rows are immutable — Prisma update on AuditLog has no side effects in tests, surface forbids', async () => {
    // The Prisma AuditLog model exposes update/delete at the ORM level (no DB
    // trigger blocks them). The route layer is the immutability boundary —
    // there is no audit-mutation route exposed. This test enforces that intent
    // by ensuring no service in services/* *mutates* an existing audit row:
    // no `update`, `delete`, `updateMany` or `deleteMany`.
    //
    // Inserts are not the rule's concern and are deliberately not matched.
    // `writeAudit` is the usual path, but `purgeOldDeleted` writes its batch of
    // `purge` rows straight through `db.auditLog.createMany` — one INSERT for N
    // entries, see ADR-0011. The regex below does not match `createMany`; do not
    // widen it.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const servicesDir = path.resolve(here, '../../src/lib/services');
    const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      if (f === 'audit.ts' || f === 'audit-query.ts') continue;
      const src = fs.readFileSync(path.join(servicesDir, f), 'utf8');
      expect(src).not.toMatch(/\.auditLog\.(update|delete|deleteMany|updateMany)\(/);
    }

    const mcpDir = path.resolve(here, '../../src/server/mcp');
    function walkDir(dir: string): string[] {
      const out: string[] = [];
      for (const e of fs.readdirSync(dir)) {
        const full = path.join(dir, e);
        if (fs.statSync(full).isDirectory()) out.push(...walkDir(full));
        else if (full.endsWith('.ts')) out.push(full);
      }
      return out;
    }
    for (const f of walkDir(mcpDir)) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toMatch(/\.auditLog\.(update|delete|deleteMany|updateMany)\(/);
    }
  });
});

describe('audit action filter', () => {
  it('US-99: the filter offers every AuditAction value', () => {
    expect(new Set(ALL_ACTIONS)).toEqual(new Set(Object.values(AuditAction)));
  });
});
