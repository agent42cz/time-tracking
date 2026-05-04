import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, Table, THead, Th, Tr, Td } from '@tt/ui';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { runReport } from '@/lib/services/reports';
import { ReportFiltersForm } from './ReportFiltersForm';

function fmtDur(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

interface SP {
  from?: string;
  to?: string;
  client?: string | string[];
  project?: string | string[];
  member?: string | string[];
  tag?: string | string[];
  tagsMode?: string;
  search?: string;
}

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}): Promise<ReactElement> {
  const s = await requireActiveCompany();
  const sp = await searchParams;
  const isAdmin = s.activeRole === 'admin';

  const [clients, projects, members, tags] = await Promise.all([
    prisma().client.findMany({
      where: { companyId: s.activeCompanyId },
      orderBy: { name: 'asc' },
    }),
    prisma().project.findMany({
      where: { client: { companyId: s.activeCompanyId } },
      include: { client: true },
      orderBy: { name: 'asc' },
    }),
    isAdmin
      ? prisma().membership.findMany({
          where: { companyId: s.activeCompanyId },
          include: { user: true },
          orderBy: { user: { fullName: 'asc' } },
        })
      : Promise.resolve([]),
    prisma().tag.findMany({
      where: { companyId: s.activeCompanyId },
      orderBy: { name: 'asc' },
    }),
  ]);

  const filters = {
    companyId: s.activeCompanyId,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to) : undefined,
    clientIds: asArray(sp.client),
    projectIds: asArray(sp.project),
    memberIds: asArray(sp.member),
    tagIds: asArray(sp.tag),
    tagsMode: sp.tagsMode === 'and' ? ('and' as const) : ('or' as const),
    search: sp.search || undefined,
  };

  const result = await runReport(prisma(), s.userId, filters);

  const exportQS = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => exportQS.append(k, x));
    else if (typeof v === 'string') exportQS.append(k, v);
  }

  const total = result.ok
    ? result.value.reduce((a, r) => a + r.durationMs, 0)
    : 0;

  return (
    <div>
      <PageHeader
        title="Reporty"
        description="Filtrovaný přehled záznamů s exportem do CSV."
        actions={
          <a
            href={`/api/reports/export.csv?${exportQS.toString()}`}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Stáhnout CSV
          </a>
        }
      />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Filtry</CardTitle>
          </CardHeader>
          <CardBody>
            <ReportFiltersForm
              isAdmin={isAdmin}
              clients={clients.map((c) => ({ id: c.id, name: c.name }))}
              projects={projects.map((p) => ({
                id: p.id,
                name: `${p.client.name} → ${p.name}`,
              }))}
              members={members.map((m) => ({ id: m.userId, name: m.user.fullName }))}
              tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
              initial={{
                from: sp.from ?? '',
                to: sp.to ?? '',
                clientIds: asArray(sp.client),
                projectIds: asArray(sp.project),
                memberIds: asArray(sp.member),
                tagIds: asArray(sp.tag),
                tagsMode: filters.tagsMode,
                search: sp.search ?? '',
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Záznamy ({result.ok ? result.value.length : 0})</CardTitle>
            <span className="font-mono text-sm text-zinc-700">{fmtDur(total)}</span>
          </CardHeader>
          <CardBody>
            {!result.ok || result.value.length === 0 ? (
              <EmptyState title="Žádné záznamy odpovídající filtru" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Datum</Th>
                    <Th>Uživatel</Th>
                    <Th>Klient</Th>
                    <Th>Projekt</Th>
                    <Th>Popis</Th>
                    <Th>Štítky</Th>
                    <Th className="text-right">Čas</Th>
                  </tr>
                </THead>
                <tbody>
                  {result.value.map((r) => (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">
                        {r.startedAt.toLocaleString('cs-CZ', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </Td>
                      <Td>{r.userName}</Td>
                      <Td className="text-zinc-700">{r.clientName ?? '—'}</Td>
                      <Td className="text-zinc-700">{r.projectName ?? '—'}</Td>
                      <Td className="max-w-xs truncate" title={r.description}>
                        {r.description}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <span
                              key={t.id}
                              className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700"
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-right font-mono">{fmtDur(r.durationMs)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
