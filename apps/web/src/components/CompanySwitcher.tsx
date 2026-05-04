'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { Select } from '@tt/ui';
import { switchCompanyAction } from '@/lib/actions/auth';

export function CompanySwitcher({
  activeCompanyId,
  memberships,
}: {
  activeCompanyId: string | null;
  memberships: { companyId: string; companyName: string; role: string }[];
}): ReactElement | null {
  const [pending, startTransition] = useTransition();
  if (memberships.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Aktivní firma
      </label>
      <Select
        value={activeCompanyId ?? ''}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await switchCompanyAction(id);
          });
        }}
      >
        {memberships.map((m) => (
          <option key={m.companyId} value={m.companyId}>
            {m.companyName} ({m.role === 'admin' ? 'správce' : 'člen'})
          </option>
        ))}
      </Select>
    </div>
  );
}
