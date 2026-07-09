'use client';
import { useState, useTransition } from 'react';
import { updateClientFundAction } from '@/lib/actions/catalog';

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: 'Po' },
  { iso: 2, label: 'Út' },
  { iso: 3, label: 'St' },
  { iso: 4, label: 'Čt' },
  { iso: 5, label: 'Pá' },
  { iso: 6, label: 'So' },
  { iso: 7, label: 'Ne' },
];

export function ClientFundForm(props: {
  clientId: string;
  fundInDashboard: boolean;
  weeklyFundMinutes: number | null;
  weekStartsOn: number | null;
  workingDays: number[];
}): React.ReactElement {
  const [enabled, setEnabled] = useState(props.fundInDashboard);
  const [hours, setHours] = useState(props.weeklyFundMinutes ? props.weeklyFundMinutes / 60 : 0);
  const [weekStart, setWeekStart] = useState(props.weekStartsOn ?? 1);
  const [days, setDays] = useState<number[]>(props.workingDays);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (iso: number) =>
    setDays((d) =>
      d.includes(iso) ? d.filter((x) => x !== iso) : [...d, iso].sort((a, b) => a - b),
    );

  const save = () =>
    start(async () => {
      setError(null);
      const r = await updateClientFundAction(props.clientId, {
        fundInDashboard: enabled,
        weeklyFundMinutes: hours > 0 ? Math.round(hours * 60) : null,
        weekStartsOn: enabled ? weekStart : null,
        workingDays: days,
      });
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Zobrazit v dashboardu
      </label>
      <label className="flex items-center gap-2">
        Týdenní fond (h):
        <input
          type="number"
          min={0}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="w-20 rounded border px-1 dark:bg-zinc-800"
        />
      </label>
      <label className="flex items-center gap-2">
        Začátek týdne:
        <select
          value={weekStart}
          onChange={(e) => setWeekStart(Number(e.target.value))}
          className="rounded border px-1 dark:bg-zinc-800"
        >
          {WEEKDAYS.map((d) => (
            <option key={d.iso} value={d.iso}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        Pracovní dny:
        {WEEKDAYS.map((d) => (
          <label key={d.iso} className="flex items-center gap-0.5">
            <input
              type="checkbox"
              checked={days.includes(d.iso)}
              onChange={() => toggleDay(d.iso)}
            />
            {d.label}
          </label>
        ))}
      </div>
      {error ? <p className="text-red-600">{error}</p> : null}
      <button
        onClick={save}
        disabled={pending}
        className="rounded bg-zinc-900 px-2 py-1 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? 'Ukládám…' : 'Uložit fond'}
      </button>
    </div>
  );
}
