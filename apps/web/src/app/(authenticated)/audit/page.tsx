import type { ReactElement } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  THead,
  Th,
  Tr,
  Td,
} from '@tt/ui';
import { prisma, requireAdmin } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { listAuditLog } from '@/lib/services/audit-query';
import type { AuditAction } from '@prisma/client';

const ALL_ACTIONS: AuditAction[] = [
  'create',
  'update',
  'delete',
  'restore',
  'invite',
  'invite_accepted',
  'invite_revoked',
  'remove_member',
  'role_change',
  'login',
  'logout',
  'totp_enable',
  'totp_disable',
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; from?: string; to?: string }>;
}): Promise<ReactElement> {
  const s = await requireAdmin();
  const sp = await searchParams;
  const result = await listAuditLog(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    action: ALL_ACTIONS.includes(sp.action as AuditAction) ? (sp.action as AuditAction) : undefined,
    entityType: sp.entity || undefined,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to) : undefined,
    limit: 100,
  });
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Audit" />
        <EmptyState title="Bez přístupu" />
      </div>
    );
  }

  const userIds = Array.from(
    new Set(result.value.rows.map((r) => r.actorUserId).filter(Boolean) as string[]),
  );
  const users = await prisma().user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, fullName: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div>
      <PageHeader title="Audit log" description="Všechny změny v aktivní firmě." />
      <Card>
        <CardHeader>
          <CardTitle>Záznamy ({result.value.rows.length})</CardTitle>
        </CardHeader>
        <CardBody>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Akce
              </span>
              <select
                name="action"
                defaultValue={sp.action ?? ''}
                className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-sm"
              >
                <option value="">— vše —</option>
                {ALL_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Entita
              </span>
              <input
                name="entity"
                defaultValue={sp.entity ?? ''}
                placeholder="TimeEntry, Tag, …"
                className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Od</span>
              <input
                type="date"
                name="from"
                defaultValue={sp.from ?? ''}
                className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Do</span>
              <input
                type="date"
                name="to"
                defaultValue={sp.to ?? ''}
                className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900"
            >
              Filtrovat
            </button>
          </form>

          {result.value.rows.length === 0 ? (
            <EmptyState title="Žádné záznamy" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Kdy</Th>
                  <Th>Kdo</Th>
                  <Th>Akce</Th>
                  <Th>Entita</Th>
                  <Th>ID</Th>
                </tr>
              </THead>
              <tbody>
                {result.value.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap font-mono text-xs">
                      {r.createdAt.toLocaleString('cs-CZ')}
                    </Td>
                    <Td>
                      {r.actorUserId
                        ? (userMap.get(r.actorUserId)?.fullName ?? r.actorUserId)
                        : '—'}
                    </Td>
                    <Td>
                      <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs">
                        {r.action}
                      </span>
                    </Td>
                    <Td>{r.entityType}</Td>
                    <Td className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {r.entityId}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
