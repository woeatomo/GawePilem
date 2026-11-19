import 'server-only';
import { PlatformSecrets, type PlatformSecretName } from '@atomo/db';
import { env } from './env';
import { supabaseAdmin } from './supabase/server';

let instance: PlatformSecrets | null = null;

/** Secret platform: diatur superadmin di /admin/secrets (terenkripsi di DB), env sebagai cadangan. */
export function platformSecrets(): PlatformSecrets {
  instance ??= new PlatformSecrets(supabaseAdmin(), env().ENCRYPTION_KEY);
  return instance;
}

export function platformSecret(name: PlatformSecretName): Promise<string | undefined> {
  return platformSecrets().get(name);
}
