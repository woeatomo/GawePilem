import { Queue, Worker, type Job as BullJob } from 'bullmq';
import IORedis from 'ioredis';
import { MEDIA_QUEUE, RENDER_QUEUE, type MediaJobData } from '@atomo/db';
import { env } from './env';
import { log, runJob } from './job';
import { charref, clips, keyframes, voiceOver } from './handlers/media';
import { render } from './handlers/render';
import { expireCredits } from './handlers/expire';
import { publish } from './handlers/publish';
import { purgeWorkspaceMedia } from './handlers/purge';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

async function handle(job: BullJob<MediaJobData>) {
  const d = job.data;
  switch (d.kind) {
    case 'charref':
      return runJob(job, d.jobId, (j) => charref(j, d.characterId));
    case 'keyframe':
      return runJob(job, d.jobId, (j) => keyframes(j, d.shotIds));
    case 'clip':
      return runJob(job, d.jobId, (j) => clips(j, d.shotIds));
    case 'vo':
      return runJob(job, d.jobId, (j) => voiceOver(j, d.episodeId, d.lineIds));
    case 'render':
      return runJob(job, d.jobId, (j) => render(j, d.renderId));
    case 'publish':
      return runJob(job, d.jobId, (j) => publish(j, d.publicationId));
    case 'purge':
      return purgeWorkspaceMedia(d.workspaceId);
    case 'expire':
      return expireCredits();
  }
}

const media = new Worker<MediaJobData>(MEDIA_QUEUE, handle, {
  connection,
  concurrency: env.WORKER_CONCURRENCY,
  // Rate limit global ke provider: maks 20 job media per detik di semua worker.
  limiter: { max: 20, duration: 1000 },
});
const renders = new Worker<MediaJobData>(RENDER_QUEUE, handle, { connection, concurrency: env.RENDER_CONCURRENCY });

for (const w of [media, renders]) {
  w.on('failed', (job, err) => log('bullmq failed', { id: job?.id, name: job?.name, attempts: job?.attemptsMade, error: err.message }));
  w.on('error', (err) => log('worker error', { error: err.message }));
}

// Jadwal harian sapuan kredit hangus (02.00 WIB).
const scheduler = new Queue<MediaJobData>(MEDIA_QUEUE, { connection });
await scheduler.upsertJobScheduler('expire-credits', { pattern: '0 19 * * *', tz: 'UTC' }, { name: 'expire', data: { kind: 'expire', jobId: 'expire', workspaceId: '' } });

log('worker siap', { media: MEDIA_QUEUE, render: RENDER_QUEUE, mock: env.AI_MOCK, storage: env.STORAGE_DRIVER });

async function shutdown(sig: string) {
  log('mematikan worker', { sig });
  await Promise.allSettled([media.close(), renders.close(), scheduler.close()]);
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
