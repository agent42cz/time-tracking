import type { ReactElement } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Table,
  THead,
  Th,
  Tr,
  Td,
  EmptyState,
} from '@tt/ui';
import type { GroupedReport } from '@/lib/services/reports';
import { fmtDur, ymd } from '@/lib/time-format';
import { ReportsRowActions } from './ReportsRowActions';

interface Props {
  report: GroupedReport;
  autoStackOverlaps: boolean;
  labels: { grandTotal: string; subtotal: string };
}

export function ReportGrouped({ report, autoStackOverlaps, labels }: Props): ReactElement {
  if (report.rowCount === 0) {
    return <EmptyState title="Žádné záznamy odpovídající filtru" />;
  }
  const showUser = report.groupBy !== 'member';
  return (
    <div className="space-y-4">
      {report.groups.map((g) => {
        const heading =
          report.groupBy === 'project' && g.clientName
            ? `${g.clientName} → ${g.label}`
            : report.groupBy === 'day'
              ? ymd(g.rows[0]!.startedAt)
              : g.label;
        return (
          <Card key={g.key}>
            <CardHeader>
              <CardTitle>{heading}</CardTitle>
              <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                {labels.subtotal}: {fmtDur(g.subtotalMs)}
              </span>
            </CardHeader>
            <CardBody>
              <Table>
                <THead>
                  <tr>
                    <Th>Datum</Th>
                    {showUser ? <Th>Uživatel</Th> : null}
                    {report.groupBy !== 'project' ? <Th>Klient</Th> : null}
                    {report.groupBy !== 'project' ? <Th>Projekt</Th> : null}
                    <Th>Popis</Th>
                    <Th>Štítky</Th>
                    <Th className="text-right">Čas</Th>
                    <Th>Akce</Th>
                  </tr>
                </THead>
                <tbody>
                  {g.rows.map((r) => (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">
                        {r.startedAt.toLocaleString('cs-CZ', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </Td>
                      {showUser ? <Td>{r.userName}</Td> : null}
                      {report.groupBy !== 'project' ? (
                        <Td className="text-zinc-700 dark:text-zinc-300">{r.clientName ?? '—'}</Td>
                      ) : null}
                      {report.groupBy !== 'project' ? (
                        <Td className="text-zinc-700 dark:text-zinc-300">{r.projectName ?? '—'}</Td>
                      ) : null}
                      <Td className="max-w-xs truncate" title={r.description}>
                        {r.description}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-300"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-right font-mono">{fmtDur(r.durationMs)}</Td>
                      <Td>
                        <ReportsRowActions
                          entryId={r.id}
                          startedAt={r.startedAt.toISOString()}
                          endedAt={r.endedAt ? r.endedAt.toISOString() : null}
                          autoStackOverlaps={autoStackOverlaps}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        );
      })}
      <div className="flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-700/60 pt-4">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{labels.grandTotal}:</span>
        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
          {fmtDur(report.grandTotalMs)}
        </span>
      </div>
    </div>
  );
}
