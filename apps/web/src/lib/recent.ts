/**
 * Pure helpers behind the timer page's history section. Prague-aware (the web
 * SSRs on UTC servers, so bucketing must use Europe/Prague, not local time).
 * Ported from apps/extension/src/recent.ts (which buckets browser-local).
 */
import { toAppZone } from '@tt/shared/time';
import { dayKey } from '@/lib/time-format';

export interface RecentEntryInput {
  id: string;
  description: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  clientName: string | null;
  projectName: string | null;
  tags: { name: string; color: string }[];
}

export interface RecentDayGroup {
  key: string; // Prague YYYY-MM-DD — stable React key
  label: string; // "Dnes" | "Včera" | "Po 12.05."
  monthKey: string; // Prague YYYY-MM — for month dividers
  monthLabel: string; // "Květen 2026"
  total: number; // sum of durations (ms); running entries clamp to `now`
  items: RecentEntryInput[];
}

const WEEKDAY_CS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const MONTH_CS = [
  'Leden',
  'Únor',
  'Březen',
  'Duben',
  'Květen',
  'Červen',
  'Červenec',
  'Srpen',
  'Září',
  'Říjen',
  'Listopad',
  'Prosinec',
];
const pad = (n: number): string => String(n).padStart(2, '0');

function monthKeyOf(d: Date): string {
  const z = toAppZone(d);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}`;
}
function monthLabelOf(d: Date): string {
  const z = toAppZone(d);
  return `${MONTH_CS[z.getMonth()] ?? ''} ${z.getFullYear()}`;
}
function dayLabelOf(d: Date, todayKey: string, yesterdayKey: string): string {
  const k = dayKey(d);
  if (k === todayKey) return 'Dnes';
  if (k === yesterdayKey) return 'Včera';
  const z = toAppZone(d);
  return `${WEEKDAY_CS[z.getDay()] ?? ''} ${pad(z.getDate())}.${pad(z.getMonth() + 1)}.`;
}

/**
 * Groups entries by Prague-local day. Assumes entries arrive newest-first
 * (server contract), so same-day entries are contiguous → single O(n) pass.
 * Tolerates null/undefined so a partial response can't blank the page.
 */
export function groupRecentByDay(
  entries: RecentEntryInput[] | null | undefined,
  now: Date,
): RecentDayGroup[] {
  if (!entries || entries.length === 0) return [];
  const nowMs = now.getTime();
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(nowMs - 86_400_000));
  const groups: RecentDayGroup[] = [];
  for (const e of entries) {
    const started = new Date(e.startedAt);
    const k = dayKey(started);
    const endMs = e.endedAt ? new Date(e.endedAt).getTime() : nowMs;
    const dur = endMs - started.getTime();
    const last = groups[groups.length - 1];
    if (last && last.key === k) {
      last.total += dur;
      last.items.push(e);
    } else {
      groups.push({
        key: k,
        label: dayLabelOf(started, todayKey, yesterdayKey),
        monthKey: monthKeyOf(started),
        monthLabel: monthLabelOf(started),
        total: dur,
        items: [e],
      });
    }
  }
  return groups;
}
