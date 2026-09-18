'use client';
import { useEffect, useState, useTransition, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { setTokenCompanyScopeAction } from '@/lib/actions/api-tokens';

export function TokenCompanyScope({
  tokenId,
  allCompanies,
}: {
  tokenId: string;
  allCompanies: boolean;
}): ReactElement {
  const t = useTranslations('settings.apiTokens');
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(allCompanies);
  useEffect(() => setChecked(allCompanies), [allCompanies]);
  const [error, setError] = useState(false);
  return (
    <div className="mt-2 max-w-sm">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => {
            const enabled = e.target.checked;
            setError(false);
            setChecked(enabled);
            start(async () => {
              try {
                await setTokenCompanyScopeAction(tokenId, enabled);
              } catch {
                setChecked(allCompanies);
                setError(true);
              }
            });
          }}
        />
        {t('allCompanies')}
      </label>
      <p className="mt-1 text-xs text-zinc-500">{t('scopeHint')}</p>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {t('scopeError')}
        </p>
      ) : null}
    </div>
  );
}
