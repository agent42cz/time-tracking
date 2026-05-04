import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { requireUser } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { CompaniesManager, CreateCompanyForm } from './CompaniesManager';

export default async function CompaniesPage(): Promise<ReactElement> {
  const session = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="Firmy" description="Vaše členství. Přepínat můžete v levém panelu." />
      <Card>
        <CardHeader>
          <CardTitle>Vaše firmy</CardTitle>
        </CardHeader>
        <CardBody>
          {session.memberships.length === 0 ? (
            <EmptyState
              title="Zatím nejste v žádné firmě"
              description="Vytvořte si vlastní níže nebo počkejte na pozvánku."
            />
          ) : (
            <CompaniesManager
              activeCompanyId={session.activeCompanyId}
              memberships={session.memberships.map((m) => ({
                companyId: m.companyId,
                companyName: m.companyName,
                companySlug: m.companySlug,
                role: m.role,
              }))}
            />
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Vytvořit novou firmu</CardTitle>
        </CardHeader>
        <CardBody>
          <CreateCompanyForm />
        </CardBody>
      </Card>
    </div>
  );
}
