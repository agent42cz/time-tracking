import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { prisma, requireAdmin } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { TrashList } from './TrashList';

export default async function TrashPage(): Promise<ReactElement> {
  const s = await requireAdmin();
  const entries = await prisma().timeEntry.findMany({
    where: { companyId: s.activeCompanyId, deletedAt: { not: null } },
    include: { user: true, client: true, project: true },
    orderBy: { deletedAt: 'desc' },
  });
  return (
    <div>
      <PageHeader
        title="Koš"
        description="Smazané záznamy. Po 30 dnech se trvale promazávají."
      />
      <Card>
        <CardHeader>
          <CardTitle>Záznamy ({entries.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {entries.length === 0 ? (
            <EmptyState title="Koš je prázdný" />
          ) : (
            <TrashList
              entries={entries.map((e) => ({
                id: e.id,
                description: e.description,
                userName: e.user.fullName,
                clientName: e.client?.name ?? null,
                projectName: e.project?.name ?? null,
                deletedAt: e.deletedAt!.toISOString(),
              }))}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
