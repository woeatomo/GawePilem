import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '@atomo/credits';
import type { Database, Json } from './database.types';

export type { Database, Json } from './database.types';
export type DB = SupabaseClient<Database>;

type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];
export type Enum<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type Project = Row<'projects'>;
export type Episode = Row<'episodes'>;
export type Character = Row<'characters'>;
export type Shot = Row<'shots'>;
export type Job = Row<'jobs'>;
export type LedgerRow = Row<'credit_ledger'>;
export type ScriptRow = Row<'scripts'>;
export type SeriesBible = Row<'series_bible'>;

/** Kode error RPC kredit (SQLSTATE dari migrasi) → kode aplikasi. */
export const CREDIT_ERRORS = {
  P0002: 'insufficient_credits',
  P0003: 'rate_missing',
  P0005: 'not_found',
  P0006: 'rate_changed',
  P0007: 'budget_cap',
  P0008: 'not_refundable',
  '42501': 'forbidden',
} as const;
export type CreditErrorCode = (typeof CREDIT_ERRORS)[keyof typeof CREDIT_ERRORS] | 'unknown';

export class CreditError extends Error {
  constructor(
    readonly code: CreditErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CreditError';
  }
}

export interface ChargeItem {
  category: Category;
  tier: Enum<'ai_tier'>;
  quantity: number;
}

export interface ChargeArgs {
  userId: string;
  workspaceId: string;
  projectId: string | null;
  episodeId: string | null;
  type: Enum<'job_type'>;
  action: string;
  items: ChargeItem[];
  billing: Partial<Record<Category, 'saldo' | 'byok'>>;
  provider: string;
  model: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  /** Total estimasi yang dilihat & dikonfirmasi user. */
  expectedTotal: number | null;
}

/** Panggil RPC charge_and_enqueue (WAJIB dengan client service_role). */
export async function chargeAndEnqueue(admin: DB, a: ChargeArgs): Promise<Job> {
  const { data, error } = await admin.rpc('charge_and_enqueue', {
    p_user_id: a.userId,
    p_workspace_id: a.workspaceId,
    // Kolom nullable; tipe generate tidak menandai argumen RPC sebagai nullable.
    p_project_id: a.projectId as string,
    p_episode_id: a.episodeId as string,
    p_type: a.type,
    p_action: a.action,
    p_items: a.items as unknown as Json,
    p_billing: a.billing as Json,
    p_provider: a.provider,
    p_model: a.model,
    p_input: a.input as Json,
    p_idempotency_key: a.idempotencyKey,
    ...(a.expectedTotal !== null ? { p_expected_total: a.expectedTotal } : {}),
  });
  if (error) {
    const code = (CREDIT_ERRORS as Record<string, CreditErrorCode>)[error.code ?? ''] ?? 'unknown';
    throw new CreditError(code, error.message);
  }
  return data as Job;
}

export async function jobRunning(admin: DB, jobId: string): Promise<void> {
  const { error } = await admin.rpc('job_mark_running', { p_job_id: jobId });
  if (error) throw new Error(error.message);
}

export async function jobSucceed(admin: DB, jobId: string, output: Record<string, unknown>): Promise<void> {
  const { error } = await admin.rpc('job_succeed', { p_job_id: jobId, p_output: output as Json });
  if (error) throw new Error(error.message);
}

/** Tandai gagal + refund otomatis (atomik di DB). Mengembalikan jumlah kredit yang di-refund. */
export async function jobFail(admin: DB, jobId: string, message: string): Promise<number> {
  const { data, error } = await admin.rpc('job_fail', { p_job_id: jobId, p_error: message.slice(0, 2000) });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export async function getBalance(db: DB, userId: string): Promise<number> {
  const { data, error } = await db.from('credit_balances').select('balance').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.balance ?? 0;
}

export async function audit(
  admin: DB,
  entry: { actorId: string | null; workspaceId: string | null; action: string; targetType?: string; targetId?: string; details?: Record<string, unknown>; ip?: string | null },
): Promise<void> {
  await admin.from('audit_log').insert({
    actor_id: entry.actorId,
    workspace_id: entry.workspaceId,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    details: (entry.details ?? {}) as { [key: string]: Json },
    ip: entry.ip ?? null,
  });
}
export * from './queue';
