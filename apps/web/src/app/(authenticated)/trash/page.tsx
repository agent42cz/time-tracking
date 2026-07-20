import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { listTrash } from '@/lib/services/time-entries';
import { TrashList } from './TrashList';

export default async function TrashPage(): Promise<ReactElement> {
  const s = await requireActiveCompany();
  const result = await listTrash(prisma(), s.userId, s.activeCompanyId);
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Koš" />
        <EmptyState title="Bez přístupu" />
      </div>
    );
  }
  const entries = result.value;
  const isAdmin = s.activeRole === 'admin';
  return (
    <div>
      <PageHeader
        title="Koš"
        description={
          isAdmin
            ? 'Smazané záznamy celé firmy. Po 30 dnech se trvale promazávají.'
            : 'Vaše smazané záznamy. Po 30 dnech se trvale promazávají.'
        }
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
              isAdmin={isAdmin}
              entries={entries.map((e) => ({
                id: e.id,
                description: e.description,
                userName: e.userName,
                clientName: e.clientName,
                projectName: e.projectName,
                startedAt: e.startedAt.toISOString(),
                endedAt: e.endedAt?.toISOString() ?? null,
                deletedAt: e.deletedAt.toISOString(),
              }))}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
