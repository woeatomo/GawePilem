import { admin, rpc } from '../db';
import { log } from '../job';

/** Sapuan harian: catat kredit yang hangus (12 bulan sejak top-up) sebagai entri ledger. */
export async function expireCredits(): Promise<void> {
  const users = await rpc(admin.rpc('users_with_due_credits', {}));
  let total = 0;
  for (const u of (users ?? []) as unknown as string[]) {
    total += await rpc(admin.rpc('expire_due_credits', { p_user_id: u }));
  }
  log('sapuan kredit hangus selesai', { users: (users as unknown as string[] | null)?.length ?? 0, credits: total });
}
