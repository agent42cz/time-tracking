/**
 * Publisher used by the web app to emit events. Single Redis client per
 * process, lazily initialized.
 */
import { Redis } from 'ioredis';
import type { WsEvent } from '@tt/shared/ws';

let _client: Redis | undefined;

export function getPublisher(redisUrl: string): Redis {
  if (!_client) _client = new Redis(redisUrl);
  return _client;
}

export async function publishEvent(redisUrl: string, evt: WsEvent): Promise<void> {
  const client = getPublisher(redisUrl);
  await client.publish(evt.channel, JSON.stringify(evt));
}
