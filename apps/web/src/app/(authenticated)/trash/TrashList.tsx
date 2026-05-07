'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Button, Table, THead, Th, Tr, Td } from '@tt/ui';
import { restoreEntryAction } from '@/lib/actions/time';

interface Entry {
  id: string;
  description: string;
  userName: string;
  clientName: string | null;
  projectName: string | null;
  deletedAt: string;
}

export function TrashList({ entries }: { entries: Entry[] }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
      <Table>
        <THead>
          <tr>
            <Th>Popis</Th>
            <Th>Uživatel</Th>
            <Th>Klient</Th>
            <Th>Smazáno</Th>
            <Th className="text-right">Akce</Th>
          </tr>
        </THead>
        <tbody>
          {entries.map((e) => (
            <Tr key={e.id}>
              <Td className="max-w-xs truncate">
                {e.description || (
                  <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
                )}
              </Td>
              <Td>{e.userName}</Td>
              <Td className="text-zinc-700 dark:text-zinc-300">
                {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
              </Td>
              <Td className="font-mono text-xs">{new Date(e.deletedAt).toLocaleString('cs-CZ')}</Td>
              <Td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await restoreEntryAction(e.id);
                      if (!r.ok) setError(r.error);
                    })
                  }
                >
                  Obnovit
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
