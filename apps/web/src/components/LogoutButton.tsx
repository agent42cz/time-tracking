'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { Button } from '@tt/ui';
import { logoutAction } from '@/lib/actions/auth';

export function LogoutButton(): ReactElement {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => startTransition(() => logoutAction())}
    >
      Odhlásit
    </Button>
  );
}
