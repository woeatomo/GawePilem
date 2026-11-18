import { UnrecoverableError, type Job as BullJob } from 'bullmq';
import { ProviderError, toProviderError } from '@atomo/ai-gateway';
import type { Job } from '@atomo/db';
import { admin, rpc } from './db';

export interface JobResult {
  output: Record<string, unknown>;
  /** Kredit yang dikembalikan karena sebagian item gagal. */
  refund?: number;
  refundReason?: string;
}

export const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

/**
 * Bungkus eksekusi job agar idempotent dan aman di-retry:
 * - job yang sudah selesai dilewati (BullMQ bisa mengirim ulang),
 * - error sementara dilempar ulang supaya BullMQ retry dengan backoff,
 * - percobaan terakhir / error permanen → job_fail (refund otomatis).
 */
export async function runJob(bull: BullJob, jobId: string, fn: (job: Job) => Promise<JobResult>): Promise<void> {
  const { data: job } = await admin.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (!job) throw new UnrecoverableError(`Job ${jobId} tidak ada`);
  if (['succeeded', 'refunded', 'canceled', 'failed'].includes(job.status)) {
    log('job sudah final, dilewati', { jobId, status: job.status });
    return;
  }
  await rpc(admin.rpc('job_mark_running', { p_job_id: jobId }));
  const started = Date.now();
  try {
    const r = await fn(job);
    if (r.refund && r.refund > 0) {
      await rpc(admin.rpc('job_finish_partial', { p_job_id: jobId, p_output: r.output as never, p_refund: r.refund, p_reason: r.refundReason ?? 'Sebagian item gagal' }));
    } else {
      await rpc(admin.rpc('job_succeed', { p_job_id: jobId, p_output: r.output as never }));
    }
    log('job sukses', { jobId, action: job.action, ms: Date.now() - started, refund: r.refund ?? 0 });
  } catch (e) {
    const err = toProviderError(job.provider ?? 'worker', e);
    const last = bull.attemptsMade + 1 >= (bull.opts.attempts ?? 1);
    if (err.retryable && !last) {
      log('job gagal sementara, akan dicoba ulang', { jobId, attempt: bull.attemptsMade + 1, error: err.message });
      throw err;
    }
    const refunded = await rpc(admin.rpc('job_fail', { p_job_id: jobId, p_error: `${err.code}: ${err.message}`.slice(0, 2000) }));
    log('job gagal permanen, kredit dikembalikan', { jobId, refunded, error: err.message });
    throw new UnrecoverableError(err.message);
  }
}

export async function progress(jobId: string, pct: number) {
  await admin.rpc('job_progress', { p_job_id: jobId, p_progress: Math.round(pct) });
}

export { ProviderError };
