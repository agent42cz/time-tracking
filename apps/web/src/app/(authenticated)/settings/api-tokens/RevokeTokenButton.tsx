'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { Button, useConfirm } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { revokeTokenAction } from '@/lib/actions/api-tokens';

export function RevokeTokenButton({ tokenId }: { tokenId: string }): ReactElement {
  const t = useTranslations('settings.apiTokens');
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      loading={pending}
      onClick={() => {
        void (async () => {
          const ok = await confirm({
            title: t('revokeTitle'),
            description: t('revokeDescription'),
          });
          if (!ok) return;
          start(() => revokeTokenAction({ tokenId }));
        })();
      }}
    >
      {t('revoke')}
    </Button>
  );
}
