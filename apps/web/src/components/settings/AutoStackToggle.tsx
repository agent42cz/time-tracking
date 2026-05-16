'use client';

import { useTransition, useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { setAutoStackOverlapsAction } from '@/lib/actions/settings';

export function AutoStackToggle({ initialValue }: { initialValue: boolean }): ReactElement {
  const t = useTranslations('autoStack');
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(initialValue);

  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        className="mt-1 h-4 w-4"
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          startTransition(async () => {
            const result = await setAutoStackOverlapsAction(next);
            if (!result.ok) {
              setChecked(!next);
            }
          });
        }}
      />
      <span className="flex flex-col">
        <span className="font-medium">{t('settingLabel')}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('settingHelper')}</span>
      </span>
    </label>
  );
}
