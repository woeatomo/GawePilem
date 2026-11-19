import 'server-only';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true');

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(40, 'ENCRYPTION_KEY: 32 byte base64 (openssl rand -base64 32)'),
  /** URL HTTP worker (menerima job) dan token rahasia bersama. */
  WORKER_URL: z.string().url().default('http://127.0.0.1:8787'),
  WORKER_TOKEN: z.string().min(24, 'WORKER_TOKEN minimal 24 karakter (openssl rand -hex 24)'),
  OPENCODE_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  AI_MOCK: bool,
  PAYMENTS_SANDBOX: bool,
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_PRODUCTION: bool,
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOCAL_MEDIA_DIR: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_DAILY_UPLOADS: z.coerce.number().int().positive().default(100),
  YOUTUBE_AUDITED: bool,
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

/** Env server tervalidasi. Dibaca malas supaya `next build` tidak gagal tanpa secret. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Konfigurasi env tidak valid:\n${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}
