/**
 * Pure helpers behind the popup's history section.
 * Kept in a separate module so they can be unit-tested without React.
 */

export interface RecentEntryInput {
  id: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  clientName: string | null;
  projectName: string | null;
}

export interface RecentDayGroup {
  /** YYYY-MM-DD local-time key — stable React `key`. */
  key: string;
  /** Czech-localized label: "Dnes", "Včera", or e.g. "Po 12.05.". */
  label: string;
  /** YYYY-MM key — for inserting month dividers between groups. */
  monthKey: string;
  /** Czech month-divider label, e.g. "Květen 2026". */
  monthLabel: string;
  /** Sum of entry durations for the group, in ms. Running entries clamp to `now`. */
  total: number;
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

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(d: Date): string {
  return `${MONTH_CS[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

export function dayLabel(d: Date, todayKey: string, yesterdayKey: string): string {
  const k = dayKey(d);
  if (k === todayKey) return 'Dnes';
  if (k === yesterdayKey) return 'Včera';
  const weekday = WEEKDAY_CS[d.getDay()] ?? '';
  return `${weekday} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/**
 * Groups entries by local-time day. Assumes entries arrive newest-first
 * (server contract) and that same-day entries are therefore contiguous —
 * which keeps grouping a single O(n) pass without sorting.
 *
 * Defensive: tolerates `undefined`/`null` input so a partial server response
 * (e.g. during a deploy where the field hasn't rolled out) cannot blank the popup.
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
        label: dayLabel(started, todayKey, yesterdayKey),
        monthKey: monthKey(started),
        monthLabel: monthLabel(started),
        total: dur,
        items: [e],
      });
    }
  }
  return groups;
}
