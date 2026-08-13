'use client';

import { useState, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select } from '@tt/ui';
import { createAbsenceAction } from '@/lib/actions/absences';
import { ABSENCE_KIND_LABELS, ABSENCE_KIND_ORDER } from './kinds';

/**
 * `minDate` is tomorrow in Europe/Prague, computed on the server so the input
 * can't be relaxed by a client with a skewed clock — the service re-checks it
 * anyway; this only keeps the picker honest.
 */
export function AbsenceForm({ minDate }: { minDate: string }): ReactElement {
  const router = useRouter();
  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(minDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    const result = await createAbsenceAction(new FormData(form));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    setStartDate(minDate);
    setEndDate(minDate);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nahlásit nepřítomnost</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Od">
              <Input
                type="date"
                name="startDate"
                required
                min={minDate}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  // Keep the range sane: a start past the end drags the end along.
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </Field>
            <Field label="Do">
              <Input
                type="date"
                name="endDate"
                required
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <Field label="Důvod">
              <Select name="kind" defaultValue="vacation">
                {ABSENCE_KIND_ORDER.map((kind) => (
                  <option key={kind} value={kind}>
                    {ABSENCE_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Poznámka (nepovinné)">
              <Input type="text" name="note" maxLength={500} placeholder="např. Chorvatsko" />
            </Field>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Nejpozději den předem.</p>
            <Button type="submit" disabled={pending}>
              {pending ? 'Ukládám…' : 'Nahlásit'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
