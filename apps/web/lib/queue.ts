import 'server-only';
import { Queue } from 'bullmq';
import { queueFor, type MediaJobData } from '@atomo/db';
import { redis } from './redis';

const queues = new Map<string, Queue<MediaJobData>>();
function queue(name: string): Queue<MediaJobData> {
  let q = queues.get(name);
  if (!q) {
    q = new Queue<MediaJobData>(name, { connection: redis() });
    queues.set(name, q);
  }
  return q;
}

/** Enqueue idempotent: jobId BullMQ = id job DB, jadi klik ganda tidak menggandakan kerja. */
export async function enqueueMedia(data: MediaJobData): Promise<void> {
  await queue(queueFor(data.kind)).add(data.kind, data, {
    jobId: data.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: { age: 7 * 86_400 },
  });
}
