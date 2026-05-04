import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { prisma, requireAdmin } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { MembersManager, PendingInvites } from './MembersManager';
import { InviteForm } from './InviteForm';

export default async function MembersPage(): Promise<ReactElement> {
  const s = await requireAdmin();
  const [memberships, invites] = await Promise.all([
    prisma().membership.findMany({
      where: { companyId: s.activeCompanyId },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    }),
    prisma().invite.findMany({
      where: { companyId: s.activeCompanyId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Členové" description="Spravujte členy firmy a jejich role." />

      <Card>
        <CardHeader>
          <CardTitle>Pozvat nového člena</CardTitle>
        </CardHeader>
        <CardBody>
          <InviteForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Členové ({memberships.length})</CardTitle>
        </CardHeader>
        <CardBody>
          <MembersManager
            currentUserId={s.userId}
            memberships={memberships.map((m) => ({
              userId: m.userId,
              fullName: m.user.fullName,
              email: m.user.email,
              role: m.role,
              joinedAt: m.joinedAt.toISOString(),
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Čekající pozvánky ({invites.length})</CardTitle>
        </CardHeader>
        <CardBody>
          <PendingInvites
            invites={invites.map((i) => ({
              id: i.id,
              email: i.email,
              role: i.role,
              expiresAt: i.expiresAt.toISOString(),
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
