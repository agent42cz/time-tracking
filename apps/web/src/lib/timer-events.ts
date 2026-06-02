import { z } from 'zod';

export const TIMER_CHANGED_EVENT = 'tt:timer-changed';

export function notifyTimerChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TIMER_CHANGED_EVENT));
}

const TimerEntrySchema = z.object({
  id: z.string(),
  description: z.string(),
  clientName: z.string().nullable(),
  projectName: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  tags: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
    }),
  ),
});

export const TimerStateResponseSchema = z.object({
  running: z.array(TimerEntrySchema).optional(),
  history: z.array(TimerEntrySchema).optional(),
});

export type TimerStateResponse = z.infer<typeof TimerStateResponseSchema>;
export type TimerEntry = z.infer<typeof TimerEntrySchema>;
