'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Button, Field, FieldGroup, Input, Select } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { issueTokenAction } from '@/lib/actions/api-tokens';

export function CreateTokenDialog({
  companies,
}: {
  companies: { id: string; name: string }[];
}): ReactElement {
  const t = useTranslations('settings.apiTokens');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleClose(): void {
    setOpen(false);
    setName('');
    setCompanyId(companies[0]?.id ?? '');
    setPlaintext(null);
    setError(null);
  }

  function buildDownloadHref(token: string): string {
    const config = {
      mcpServers: {
        'time-tracking': {
          type: 'http',
          url: `${window.location.origin}/api/mcp`,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    };
    return `data:application/json,${encodeURIComponent(JSON.stringify(config, null, 2))}`;
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t('create')}</Button>;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 sm:p-6">
        {plaintext ? (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {t('create')}
            </h2>
            <Alert tone="warning">{t('createdOnce')}</Alert>
            <div>
              <pre className="select-all overflow-x-auto rounded-md bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                {plaintext}
              </pre>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(plaintext);
                }}
                className="w-full sm:w-auto"
              >
                {t('copy')}
              </Button>
              <a
                href={buildDownloadHref(plaintext)}
                download="claude-mcp.json"
                className="inline-flex w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 sm:w-auto"
              >
                {t('downloadConfig')}
              </a>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={handleClose}>
                Zavřít
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                try {
                  const res = await issueTokenAction({ companyId, name });
                  setPlaintext(res.plaintext);
                } catch {
                  setError('Nepodařilo se vytvořit token.');
                }
              });
            }}
          >
            <FieldGroup>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {t('create')}
              </h2>
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Field label={t('name')} htmlFor="token-name">
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  autoFocus
                />
              </Field>
              {companies.length > 1 && (
                <Field label={t('company')} htmlFor="token-company">
                  <Select
                    id="token-company"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={pending}>
                  Zrušit
                </Button>
                <Button type="submit" loading={pending}>
                  {t('create')}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
      </div>
    </div>
  );
}
