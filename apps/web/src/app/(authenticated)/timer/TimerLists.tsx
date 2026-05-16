'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { TIMER_CHANGED_EVENT, TimerStateResponseSchema, type TimerEntry } from '@/lib/timer-events';
import { RunningTimers } from './RunningTimers';
import { TodayList } from './TodayList';

interface RunningEntry {
  id: string;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: string;
  tags: { name: string; color: string }[];
}

interface TodayEntry extends RunningEntry {
  endedAt: string;
}

function toRunning(e: TimerEntry): RunningEntry {
  return {
    id: e.id,
    description: e.description,
    clientName: e.clientName,
    projectName: e.projectName,
    startedAt: e.startedAt,
    tags: e.tags.map((t) => ({ name: t.name, color: t.color })),
  };
}

function toToday(e: TimerEntry): TodayEntry | null {
  if (!e.endedAt) return null;
  return { ...toRunning(e), endedAt: e.endedAt };
}

export function TimerLists({
  initialRunning,
  initialToday,
  autoStackOverlaps = false,
}: {
  initialRunning: RunningEntry[];
  initialToday: TodayEntry[];
  autoStackOverlaps?: boolean;
}): ReactElement {
  const [running, setRunning] = useState<RunningEntry[]>(initialRunning);
  const [today, setToday] = useState<TodayEntry[]>(initialToday);
  const [now, setNow] = useState<number | null>(null);
  const hasRunning = running.length > 0;

  useEffect(() => {
    if (!hasRunning) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasRunning]);

  useEffect(() => {
    let cancelled = false;
    async function refetch(): Promise<void> {
      try {
        const res = await fetch('/api/v1/timer', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const parsed = TimerStateResponseSchema.safeParse(await res.json());
        if (!parsed.success || cancelled) return;
        setRunning((parsed.data.running ?? []).map(toRunning));
        setToday((parsed.data.today ?? []).map(toToday).filter((e): e is TodayEntry => e !== null));
      } catch {
        // ignore network/parse errors
      }
    }
    const onChange = (): void => void refetch();
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void refetch();
    };
    window.addEventListener(TIMER_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener(TIMER_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleStopped = (id: string): void => {
    setRunning((rs) => rs.filter((r) => r.id !== id));
  };

  const handleDeleted = (id: string): void => {
    setToday((ts) => ts.filter((t) => t.id !== id));
  };

  return (
    <>
      {running.length > 0 ? (
        <RunningTimers
          entries={running}
          now={now}
          onStopped={handleStopped}
          autoStackOverlaps={autoStackOverlaps}
        />
      ) : null}
      <TodayList entries={today} onDeleted={handleDeleted} autoStackOverlaps={autoStackOverlaps} />
    </>
  );
}
