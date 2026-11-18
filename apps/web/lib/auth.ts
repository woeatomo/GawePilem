import 'server-only';
import type { DB, Row } from '@atomo/db';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { supabaseServer } from './supabase/server';

export interface Session {
  db: DB;
  userId: string;
  email: string;
  profile: Row<'profiles'>;
  workspaceId: string;
}

/** Ambil sesi + profil + workspace aktif. Dicache per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const [{ data: profile }, { data: member }] = await Promise.all([
    db.from('profiles').select('*').eq('id', auth.user.id).maybeSingle(),
    db.from('workspace_members').select('workspace_id, role').eq('user_id', auth.user.id).order('created_at').limit(1).maybeSingle(),
  ]);
  if (!profile || !member) return null;
  return { db, userId: auth.user.id, email: auth.user.email ?? profile.email, profile, workspaceId: member.workspace_id };
});

/** Untuk halaman: wajib login dan sudah onboarding (18+ & persetujuan data). */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.profile.age_confirmed_at || !s.profile.data_consent_at) redirect('/onboarding');
  return s;
}
