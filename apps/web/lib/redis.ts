import 'server-only';
import IORedis from 'ioredis';
import { env } from './env';

let client: IORedis | null = null;
export function redis(): IORedis {
  if (!client) {
    client = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false, enableOfflineQueue: false });
    client.on('error', () => undefined);
  }
  return client;
}
