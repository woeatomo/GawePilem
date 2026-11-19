import { z } from 'zod';

const bool = z.string().optional().transform((v) => v === '1' || v === 'true');
export const env = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    ENCRYPTION_KEY: z.string().min(40),
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    OPENCODE_API_KEY: z.string().optional(),
    ELEVENLABS_API_KEY: z.string().optional(),
    FAL_KEY: z.string().optional(),
    AI_MOCK: bool,
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_MEDIA_DIR: z.string().default('./.media'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.string().optional(),
    APP_URL: z.string().url().default('http://localhost:3000'),
    WORKER_PORT: z.coerce.number().int().default(8787),
    WORKER_TOKEN: z.string().min(24, 'WORKER_TOKEN minimal 24 karakter (openssl rand -hex 24)'),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
    RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
    FFMPEG_PATH: z.string().default('ffmpeg'),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  })
  .parse(process.env);
