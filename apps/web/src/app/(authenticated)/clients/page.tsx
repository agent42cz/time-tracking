import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { prisma, requireAdmin } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { ClientsManager } from './ClientsManager';

export default async function ClientsPage(): Promise<ReactElement> {
  const s = await requireAdmin();
  const clients = await prisma().client.findMany({
    where: { companyId: s.activeCompanyId },
    include: {
      projects: {
        orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { timeEntries: true } } },
      },
      _count: { select: { timeEntries: true } },
    },
    orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return (
    <div>
      <PageHeader
        title="Klienti a projekty"
        description="Spravujte seznam klientů a jejich projektů."
      />
      <Card>
        <CardHeader>
          <CardTitle>Seznam</CardTitle>
        </CardHeader>
        <CardBody>
          <ClientsManager
            clients={clients.map((c) => ({
              id: c.id,
              name: c.name,
              archived: c.archived,
              entryCount: c._count.timeEntries,
              projects: c.projects.map((p) => ({
                id: p.id,
                name: p.name,
                archived: p.archived,
                entryCount: p._count.timeEntries,
              })),
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
