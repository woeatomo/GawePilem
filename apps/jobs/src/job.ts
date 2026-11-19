import { toProviderError, type ProviderError } from '@atomo/ai-gateway';
import type { Job } from '@atomo/db';
import type { Ctx } from './ctx';

async function rpc<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Ambil job & tandai running. null = sudah final (pesan dikirim ulang) → lewati. */
export async function beginJob(ctx: Ctx, jobId: string): Promise<Job | null> {
  const { data: job } = await ctx.admin.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (!job) throw new Error(`Job ${jobId} tidak ada`);
  if (['succeeded', 'refunded', 'canceled', 'failed'].includes(job.status)) {
    ctx.log('job sudah final, dilewati', { jobId, status: job.status });
    return null;
  }
  await rpc(ctx.admin.rpc('job_mark_running', { p_job_id: jobId }));
  return job;
}

export async function loadRunningJob(ctx: Ctx, jobId: string): Promise<Job | null> {
  const { data: job } = await ctx.admin.from('jobs').select('*').eq('id', jobId).maybeSingle();
  return job && (job.status === 'running' || job.status === 'queued') ? job : null;
}

export async function succeedJob(ctx: Ctx, job: Job, output: Record<string, unknown>, refund = 0, reason = 'Sebagian item gagal') {
  if (refund > 0) await rpc(ctx.admin.rpc('job_finish_partial', { p_job_id: job.id, p_output: output as never, p_refund: Math.min(job.cost, refund), p_reason: reason }));
  else await rpc(ctx.admin.rpc('job_succeed', { p_job_id: job.id, p_output: output as never }));
  ctx.log('job sukses', { jobId: job.id, action: job.action, refund });
}

/** Gagal permanen → job_fail me-refund kredit secara atomik. */
export async function failJob(ctx: Ctx, jobId: string, e: unknown): Promise<ProviderError> {
  const err = toProviderError('jobs', e);
  const refunded = await rpc(ctx.admin.rpc('job_fail', { p_job_id: jobId, p_error: `${err.code}: ${err.message}`.slice(0, 2000) }));
  ctx.log('job gagal, kredit dikembalikan', { jobId, refunded, error: err.message });
  return err;
}

export async function progress(ctx: Ctx, jobId: string, pct: number) {
  await ctx.admin.rpc('job_progress', { p_job_id: jobId, p_progress: Math.round(pct) });
}

/** Sisa waktu aman di satu pesan (consumer Queues dibatasi ±15 menit wall time). */
export function deadlineFrom(startMs: number, budgetMs = 8 * 60_000) {
  return () => Date.now() - startMs > budgetMs;
}
