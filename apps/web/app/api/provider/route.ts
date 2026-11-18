import { z } from 'zod';
import { NextResponse } from 'next/server';
import { encryptSecret, findModel, keyHint } from '@atomo/ai-gateway';
import { categorySchema, tierSchema } from '@atomo/credits';
import { audit } from '@atomo/db';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const body = z.object({
  category: categorySchema,
  provider: z.string().min(2).max(40),
  model: z.string().min(1).max(120),
  mode: z.enum(['saldo', 'byok']),
  tier: tierSchema,
  /** Key baru (BYOK). Kosong = pertahankan key lama. */
  apiKey: z.string().trim().max(400).optional(),
  removeKey: z.boolean().optional(),
});

/** Simpan pengaturan provider per kategori. Key BYOK dienkripsi di server, tidak pernah dikembalikan. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return jsonError(401, 'unauthorized', 'Silakan masuk dulu.');
  if (await rateLimit(`prov:${s.userId}`, 20, 60)) return jsonError(429, 'rate_limited', 'Terlalu sering. Coba lagi sebentar.');
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return jsonError(400, 'bad_request', p.error.issues[0]?.message ?? 'Body tidak valid');
  const d = p.data;
  const m = findModel(d.model);
  if (m && (m.category !== d.category || m.provider !== d.provider)) return jsonError(400, 'bad_model', 'Model tidak cocok dengan provider/kategori.');

  const { data: member } = await s.db.from('workspace_members').select('role').eq('workspace_id', s.workspaceId).eq('user_id', s.userId).single();
  if (!member || !['owner', 'admin'].includes(member.role)) return jsonError(403, 'forbidden', 'Hanya owner/admin yang bisa mengubah provider.');

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from('provider_settings').select('encrypted_key, key_hint').eq('workspace_id', s.workspaceId).eq('category', d.category).maybeSingle();
  let encrypted = d.removeKey ? null : (existing?.encrypted_key ?? null);
  let hint = d.removeKey ? null : (existing?.key_hint ?? null);
  if (d.apiKey) {
    encrypted = encryptSecret(d.apiKey, env().ENCRYPTION_KEY, `${s.workspaceId}:${d.category}`);
    hint = keyHint(d.apiKey);
  }
  if (d.mode === 'byok' && !encrypted) return jsonError(400, 'key_required', 'Masukkan API key untuk mode BYOK.');

  const { error } = await admin.from('provider_settings').upsert(
    { workspace_id: s.workspaceId, category: d.category, provider: d.provider, model: d.model, mode: d.mode, tier: d.tier, encrypted_key: encrypted, key_hint: hint },
    { onConflict: 'workspace_id,category' },
  );
  if (error) return jsonError(500, 'db', 'Gagal menyimpan pengaturan.');
  await audit(admin, {
    actorId: s.userId, workspaceId: s.workspaceId, action: 'provider.update', targetType: 'provider_settings', targetId: d.category,
    details: { provider: d.provider, model: d.model, mode: d.mode, tier: d.tier, keyChanged: Boolean(d.apiKey) || Boolean(d.removeKey) },
    ip: clientIp(req.headers),
  });
  return NextResponse.json({ ok: true, keyHint: hint });
}
