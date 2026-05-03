/**
 * Wire types for the WS service. The web app and extension both consume these.
 */
import { z } from 'zod';

export const WsEventSchema = z.object({
  channel: z.string(), // e.g. user:abc, company:xyz
  type: z.enum([
    'time_entry.created',
    'time_entry.updated',
    'time_entry.deleted',
    'time_entry.restored',
    'timer.started',
    'timer.stopped',
    'client.changed',
    'project.changed',
    'tag.changed',
    'membership.changed',
  ]),
  payload: z.record(z.unknown()),
  emittedAt: z.string(),
});

export type WsEvent = z.infer<typeof WsEventSchema>;

export { createWsClient } from './client.js';
export type { WsClient, WsClientOpts, WsListener } from './client.js';
