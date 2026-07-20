'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import {
  Alert,
  Button,
  Table,
  THead,
  Th,
  Tr,
  Td,
  DataCard,
  DataCardRow,
  DataCardActions,
  useConfirm,
} from '@tt/ui';
import { restoreEntryAction, purgeEntryAction } from '@/lib/actions/time';
import { fmtDur, fmtTime } from '@/lib/time-format';

interface Entry {
  id: string;
  description: string;
  userName: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: string;
  endedAt: string | null;
  deletedAt: string;
}

/** A running entry can be soft-deleted, so `endedAt` may be null. */
function timeRange(e: Entry): string {
  const start = fmtTime(new Date(e.startedAt));
  return e.endedAt ? `${start}–${fmtTime(new Date(e.endedAt))}` : `${start}–…`;
}

function duration(e: Entry): string {
  if (!e.endedAt) return '—';
  return fmtDur(new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime());
}

export function TrashList({
  entries,
  isAdmin,
}: {
  entries: Entry[];
  isAdmin: boolean;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const restore = (id: string): void =>
    startTransition(async () => {
      const r = await restoreEntryAction(id);
      if (!r.ok) setError(r.error);
    });

  const confirm = useConfirm();

  const purge = (id: string): void => {
    void (async () => {
      const ok = await confirm({
        title: 'Trvale smazat záznam?',
        description: 'Tuto akci nelze vrátit zpět. Záznam bude nenávratně odstraněn.',
        confirmLabel: 'Trvale smazat',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const r = await purgeEntryAction(id);
        if (!r.ok) setError(r.error);
      });
    })();
  };

  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>Popis</Th>
              {isAdmin ? <Th>Uživatel</Th> : null}
              <Th>Klient</Th>
              <Th>Kdy</Th>
              <Th>Trvání</Th>
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
                {isAdmin ? <Td>{e.userName}</Td> : null}
                <Td className="text-zinc-700 dark:text-zinc-300">
                  {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
                </Td>
                <Td className="font-mono text-xs tabular-nums">{timeRange(e)}</Td>
                <Td className="font-mono text-xs font-semibold tabular-nums">{duration(e)}</Td>
                <Td className="font-mono text-xs">
                  {new Date(e.deletedAt).toLocaleString('cs-CZ')}
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" loading={pending} onClick={() => restore(e.id)}>
                    Obnovit
                  </Button>
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => purge(e.id)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Trvale smazat
                    </Button>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {entries.map((e) => (
          <li key={e.id}>
            <DataCard>
              <DataCardRow label="Popis">
                {e.description || (
                  <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
                )}
              </DataCardRow>
              {isAdmin ? <DataCardRow label="Uživatel">{e.userName}</DataCardRow> : null}
              <DataCardRow label="Klient">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
                </span>
              </DataCardRow>
              <DataCardRow label="Kdy">
                <span className="font-mono text-xs tabular-nums">{timeRange(e)}</span>
              </DataCardRow>
              <DataCardRow label="Trvání">
                <span className="font-mono text-xs font-semibold tabular-nums">{duration(e)}</span>
              </DataCardRow>
              <DataCardRow label="Smazáno">
                <span className="font-mono text-xs">
                  <span className="hidden sm:inline">
                    {new Date(e.deletedAt).toLocaleString('cs-CZ')}
                  </span>
                  <span className="sm:hidden">
                    {new Date(e.deletedAt).toLocaleDateString('cs-CZ')}
                  </span>
                </span>
              </DataCardRow>
              <DataCardActions>
                <Button size="sm" variant="ghost" loading={pending} onClick={() => restore(e.id)}>
                  Obnovit
                </Button>
                {isAdmin ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => purge(e.id)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    Trvale smazat
                  </Button>
                ) : null}
              </DataCardActions>
            </DataCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
