import type { Ctx } from '../ctx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hapus semua media workspace di R2 (setelah akun dihapus, UU PDP). Idempotent. */
export async function purgeWorkspaceMedia(ctx: Ctx, workspaceId: string) {
  if (!UUID.test(workspaceId)) throw new Error('workspaceId tidak valid');
  let cursor: string | undefined;
  let n = 0;
  do {
    const page = await ctx.env.MEDIA.list({ prefix: `${workspaceId}/`, limit: 1000, ...(cursor ? { cursor } : {}) });
    if (page.objects.length) await ctx.env.MEDIA.delete(page.objects.map((o) => o.key));
    n += page.objects.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  ctx.log('media workspace dihapus', { workspaceId, objects: n });
}

/** Sapuan harian kredit hangus (12 bulan sejak top-up). */
export async function expireCredits(ctx: Ctx) {
  const { data: users, error } = await ctx.admin.rpc('users_with_due_credits', {});
  if (error) throw new Error(error.message);
  let total = 0;
  for (const u of (users ?? []) as unknown as string[]) {
    const { data } = await ctx.admin.rpc('expire_due_credits', { p_user_id: u });
    total += data ?? 0;
  }
  ctx.log('sapuan kredit hangus selesai', { users: (users as unknown as string[] | null)?.length ?? 0, credits: total });
}
