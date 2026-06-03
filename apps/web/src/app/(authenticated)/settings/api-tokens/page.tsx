import type { ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import {
  Badge,
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
  DataCard,
  DataCardRow,
  DataCardActions,
} from '@tt/ui';
import { PageHeader } from '@/components/PageHeader';
import { prisma, requireUser } from '@/lib/session';
import { listTokens } from '@/lib/services/api-tokens';
import { CreateTokenDialog } from './CreateTokenDialog';
import { RevokeTokenButton } from './RevokeTokenButton';

function formatDate(date: Date): string {
  return date.toLocaleDateString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Prague',
  });
}

export default async function ApiTokensPage(): Promise<ReactElement> {
  const session = await requireUser();
  const t = await getTranslations('settings.apiTokens');
  const db = prisma();
  const tokens = await listTokens(db, session.userId);
  const memberships = await db.membership.findMany({
    where: { userId: session.userId },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { company: { name: 'asc' } },
  });
  const companies = memberships.map((m) => ({ id: m.company.id, name: m.company.name }));

  // Build a quick lookup for company names
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('subtitle')}</p>
          </div>
          <CreateTokenDialog companies={companies} />
        </CardHeader>
        <CardBody className="p-0">
          {tokens.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState title={t('empty')} />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <tr>
                      <Th>{t('name')}</Th>
                      <Th>{t('company')}</Th>
                      <Th>{t('createdAt')}</Th>
                      <Th>{t('lastUsed')}</Th>
                      <Th>{t('status')}</Th>
                      <Th />
                    </tr>
                  </THead>
                  <tbody>
                    {tokens.map((token) => (
                      <Tr key={token.id}>
                        <Td>
                          <span className="font-medium">{token.name}</span>
                          <span className="ml-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                            {token.prefix}…
                          </span>
                        </Td>
                        <Td>{companyMap.get(token.companyId) ?? token.companyId}</Td>
                        <Td>{formatDate(token.createdAt)}</Td>
                        <Td>{token.lastUsedAt ? formatDate(token.lastUsedAt) : '—'}</Td>
                        <Td>
                          {token.revokedAt ? (
                            <Badge tone="danger">{t('revoked')}</Badge>
                          ) : (
                            <Badge tone="success">{t('active')}</Badge>
                          )}
                        </Td>
                        <Td>{!token.revokedAt && <RevokeTokenButton tokenId={token.id} />}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <ul className="space-y-3 px-4 py-6 md:hidden">
                {tokens.map((token) => (
                  <li key={token.id}>
                    <DataCard>
                      <DataCardRow label={t('name')}>
                        <div>
                          <span className="font-medium">{token.name}</span>
                          <span className="ml-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                            {token.prefix}…
                          </span>
                        </div>
                      </DataCardRow>
                      <DataCardRow label={t('company')}>
                        {companyMap.get(token.companyId) ?? token.companyId}
                      </DataCardRow>
                      <DataCardRow label={t('createdAt')}>
                        {formatDate(token.createdAt)}
                      </DataCardRow>
                      <DataCardRow label={t('lastUsed')}>
                        {token.lastUsedAt ? formatDate(token.lastUsedAt) : '—'}
                      </DataCardRow>
                      <DataCardRow label={t('status')}>
                        {token.revokedAt ? (
                          <Badge tone="danger">{t('revoked')}</Badge>
                        ) : (
                          <Badge tone="success">{t('active')}</Badge>
                        )}
                      </DataCardRow>
                      <DataCardActions>
                        {!token.revokedAt && <RevokeTokenButton tokenId={token.id} />}
                      </DataCardActions>
                    </DataCard>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
