'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { Button } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { revokeTokenAction } from '@/lib/actions/api-tokens';

export function RevokeTokenButton({ tokenId }: { tokenId: string }): ReactElement {
  const t = useTranslations('settings.apiTokens');
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      loading={pending}
      onClick={() => {
        if (!confirm(t('revokeConfirm'))) return;
        start(() => revokeTokenAction({ tokenId }));
      }}
    >
      {t('revoke')}
    </Button>
  );
}
