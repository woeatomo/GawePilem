import { z } from 'zod';
import { NextResponse } from 'next/server';
import { DEFAULT_MODEL, findModel } from '@atomo/ai-gateway';
import { AI_PROFILE_META, AI_PROFILES, CATEGORIES } from '@atomo/credits';
import { audit } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Terapkan mode AI satu klik (Hemat / Seimbang / Gacor) ke semua kategori: tier + model default tier itu.
 * Mode tagihan & key BYOK yang sudah ada dipertahankan.
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (await rateLimit(`prov:${s.userId}`, 20, 60)) return jsonError(429, 'rate_limited', 'Terlalu sering. Coba lagi sebentar.');
  const p = z.object({ profile: z.enum(AI_PROFILES) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return jsonError(400, 'bad_request', 'Mode AI tidak dikenal');
  const { data: member } = await s.db.from('workspace_members').select('role').eq('workspace_id', s.workspaceId).eq('user_id', s.userId).single();
  if (!member || !['owner', 'admin'].includes(member.role)) return jsonError(403, 'forbidden', 'Hanya owner/admin yang bisa mengubah mode AI.');

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from('provider_settings').select('category, provider, mode, encrypted_key, key_hint').eq('workspace_id', s.workspaceId);
  const rows = CATEGORIES.map((c) => {
    const tier = AI_PROFILE_META[p.data.profile].tiers[c];
    const model = findModel(DEFAULT_MODEL[c][tier])!;
    const old = existing?.find((e) => e.category === c);
    // Key BYOK hanya berlaku untuk provider yang sama.
    const keep = old && old.provider === model.provider;
    return {
      workspace_id: s.workspaceId, category: c, provider: model.provider, model: model.id, tier,
      mode: keep ? old.mode : ('saldo' as const), encrypted_key: keep ? old.encrypted_key : null, key_hint: keep ? old.key_hint : null,
    };
  });
  const { error } = await admin.from('provider_settings').upsert(rows, { onConflict: 'workspace_id,category' });
  if (error) return jsonError(500, 'db', 'Gagal menyimpan mode AI.');
  await audit(admin, { actorId: s.userId, workspaceId: s.workspaceId, action: 'provider.profile', targetType: 'provider_settings', details: { profile: p.data.profile }, ip: clientIp(req.headers) });
  return NextResponse.json({ ok: true });
}
