'use client';

import type { ReactElement, ReactNode } from 'react';
import { ConfirmProvider } from '@tt/ui';

export function AuthShell({ children }: { children: ReactNode }): ReactElement {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
