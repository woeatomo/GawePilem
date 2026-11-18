import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { Database, DB } from '@atomo/db';
import { cookies } from 'next/headers';
import { env } from '../env';

/** Client dengan sesi user (RLS aktif). Untuk Server Component, Server Action, Route Handler. */
export async function supabaseServer(): Promise<DB> {
  const store = await cookies();
  const e = env();
  return createServerClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Dipanggil dari Server Component: penyegaran sesi ditangani proxy.ts.
        }
      },
    },
  });
}

let admin: DB | null = null;
/** Client service_role: melewati RLS. HANYA untuk RPC kredit/job dan kolom rahasia. Jangan pernah ke client. */
export function supabaseAdmin(): DB {
  if (!admin) {
    const e = env();
    admin = createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
