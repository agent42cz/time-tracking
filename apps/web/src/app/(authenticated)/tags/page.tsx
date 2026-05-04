import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { TagsManager } from './TagsManager';

export default async function TagsPage(): Promise<ReactElement> {
  const s = await requireActiveCompany();
  const tags = await prisma().tag.findMany({
    where: { companyId: s.activeCompanyId },
    orderBy: { name: 'asc' },
  });
  return (
    <div>
      <PageHeader
        title="Štítky"
        description={
          s.activeRole === 'admin'
            ? 'Spravujte štítky pro celou firmu.'
            : 'Štítky firmy. Nový můžete vytvořit i přímo u záznamu.'
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Štítky firmy</CardTitle>
        </CardHeader>
        <CardBody>
          <TagsManager
            tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
            isAdmin={s.activeRole === 'admin'}
          />
        </CardBody>
      </Card>
    </div>
  );
}
