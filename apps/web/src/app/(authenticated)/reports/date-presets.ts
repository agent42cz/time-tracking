export type PresetKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Dnes' },
  { key: 'yesterday', label: 'Včera' },
  { key: 'thisWeek', label: 'Tento týden' },
  { key: 'lastWeek', label: 'Minulý týden' },
  { key: 'thisMonth', label: 'Tento měsíc' },
  { key: 'lastMonth', label: 'Minulý měsíc' },
];

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Compute a preset's [from, to] local YYYY-MM-DD range relative to `now`. */
export function preset(kind: PresetKey, now: Date): { from: string; to: string } {
  const start = new Date(now);
  const end = new Date(now);
  switch (kind) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'thisWeek': {
      const dow = (start.getDay() + 6) % 7; // Mon=0..Sun=6
      start.setDate(start.getDate() - dow);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'lastWeek': {
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow - 7);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'thisMonth':
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
      break;
    case 'lastMonth':
      start.setMonth(start.getMonth() - 1, 1);
      end.setMonth(start.getMonth() + 1, 0);
      break;
  }
  return { from: ymdLocal(start), to: ymdLocal(end) };
}
