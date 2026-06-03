'use client';

import type { ReactElement } from 'react';
import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
} from '@tt/ui';
import { startTimerAction, createManualAction } from '@/lib/actions/time';
import { notifyTimerChanged } from '@/lib/timer-events';
import { checkOverlap } from '@/components/time/save-with-overlap-check';
import { AutoStackPreviewDialog } from '@/components/time/AutoStackPreviewDialog';
import type { AutoStackActionInput } from '@/lib/actions/auto-stack';

interface ClientWithProjects {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
}
interface Tag {
  id: string;
  name: string;
  color: string;
}

export function TimerStartCard({
  clients,
  tags,
  autoStackOverlaps = false,
}: {
  clients: ClientWithProjects[];
  tags: Tag[];
  autoStackOverlaps?: boolean;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [clientId, setClientId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [autoStackOpen, setAutoStackOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<
    AutoStackActionInput['candidate'] | null
  >(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const router = useRouter();

  const projects = useMemo(
    () => clients.find((c) => c.id === clientId)?.projects ?? [],
    [clients, clientId],
  );

  function toggleTag(id: string): void {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Nové měření</CardTitle>
          <button
            type="button"
            className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            onClick={() => setShowManual((s) => !s)}
          >
            {showManual ? 'Zavřít ruční zápis' : 'Přidat ručně'}
          </button>
        </CardHeader>
        <CardBody>
          {error ? (
            <Alert tone="danger" className="mb-4">
              {error}
            </Alert>
          ) : null}
          {showManual ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                for (const id of tagIds) fd.append('tagIds', id);
                setError(null);
                setPending(true);
                try {
                  const date = String(fd.get('date') ?? '');
                  const from = String(fd.get('from') ?? '');
                  const to = String(fd.get('to') ?? '');
                  const startDate = new Date(`${date}T${from}:00`);
                  const endDate = new Date(`${date}T${to}:00`);

                  const doSubmit = async (): Promise<void> => {
                    const r = await createManualAction(fd);
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    form.reset();
                    setTagIds([]);
                    setShowManual(false);
                    notifyTimerChanged();
                    startTransition(() => {
                      router.refresh();
                    });
                  };

                  if (
                    !autoStackOverlaps ||
                    Number.isNaN(startDate.getTime()) ||
                    Number.isNaN(endDate.getTime())
                  ) {
                    await doSubmit();
                    return;
                  }

                  const candidate: AutoStackActionInput['candidate'] = {
                    kind: 'create',
                    startedAt: startDate.toISOString(),
                    endedAt: endDate.toISOString(),
                  };
                  const probe = await checkOverlap(candidate);
                  if (probe.kind === 'overlap') {
                    setPendingCandidate(candidate);
                    setPendingFormData(fd);
                    setAutoStackOpen(true);
                    return; // dialog continues the flow
                  }
                  if (probe.kind === 'error') {
                    setError('Nepodařilo se ověřit překryvy. Zkuste to znovu.');
                    return;
                  }
                  await doSubmit();
                } finally {
                  setPending(false);
                }
              }}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                <Field label="Datum" htmlFor="date">
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
                <Field label="Od" htmlFor="from">
                  <Input id="from" name="from" type="time" required />
                </Field>
                <Field label="Do" htmlFor="to">
                  <Input id="to" name="to" type="time" required />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Popis" htmlFor="description">
                  <Input id="description" name="description" placeholder="Co jste dělali?" />
                </Field>
              </div>
              <PickerRow
                clients={clients}
                projects={projects}
                clientId={clientId}
                setClientId={setClientId}
              />
              <TagPicker tags={tags} selected={tagIds} onToggle={toggleTag} />
              <div className="mt-4 flex w-full sm:w-auto justify-end">
                <Button type="submit" loading={pending} className="w-full sm:w-auto">
                  Uložit záznam
                </Button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                for (const id of tagIds) fd.append('tagIds', id);
                setError(null);
                setPending(true);
                try {
                  const r = await startTimerAction(fd);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  form.reset();
                  setTagIds([]);
                  setClientId('');
                  notifyTimerChanged();
                  startTransition(() => {
                    router.refresh();
                  });
                } finally {
                  setPending(false);
                }
              }}
            >
              <Field label="Co děláte?" htmlFor="description">
                <Input
                  id="description"
                  name="description"
                  placeholder="Např. Code review, schůzka s klientem…"
                  autoFocus
                />
              </Field>
              <PickerRow
                clients={clients}
                projects={projects}
                clientId={clientId}
                setClientId={setClientId}
              />
              <TagPicker tags={tags} selected={tagIds} onToggle={toggleTag} />
              <div className="mt-4 flex w-full sm:w-auto justify-end">
                <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
                  ▶ Spustit
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
      {autoStackOpen && pendingCandidate && pendingFormData ? (
        <AutoStackPreviewDialog
          open
          candidate={pendingCandidate}
          onClose={() => {
            setAutoStackOpen(false);
            setPendingCandidate(null);
            setPendingFormData(null);
          }}
          onSaveWithoutShift={async () => {
            const r = await createManualAction(pendingFormData);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setTagIds([]);
            setShowManual(false);
            notifyTimerChanged();
            startTransition(() => {
              router.refresh();
            });
          }}
          onShifted={() => {
            setTagIds([]);
            setShowManual(false);
            notifyTimerChanged();
            startTransition(() => {
              router.refresh();
            });
          }}
        />
      ) : null}
    </>
  );
}

function PickerRow({
  clients,
  projects,
  clientId,
  setClientId,
}: {
  clients: ClientWithProjects[];
  projects: { id: string; name: string }[];
  clientId: string;
  setClientId: (id: string) => void;
}): ReactElement {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-2">
      <Field label="Klient" htmlFor="clientId">
        <Select
          id="clientId"
          name="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">— bez klienta —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Projekt" htmlFor="projectId">
        <Select id="projectId" name="projectId" disabled={!clientId}>
          <option value="">— bez projektu —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function TagPicker({
  tags,
  selected,
  onToggle,
}: {
  tags: Tag[];
  selected: string[];
  onToggle: (id: string) => void;
}): ReactElement | null {
  if (tags.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Štítky</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const active = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t.id)}
              className={`rounded-full border px-2.5 py-1 sm:py-0.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
              }`}
              style={active ? { backgroundColor: t.color, borderColor: t.color } : undefined}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Re-export Badge so the file compiles even if unused at top-level.
export { Badge };
