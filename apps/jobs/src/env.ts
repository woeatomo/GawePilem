import type { MediaJobData } from '@atomo/db';
import type { JobMessage } from './messages';

export interface Env {
  JOBS: Queue<JobMessage>;
  MEDIA: R2Bucket;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ENCRYPTION_KEY: string;
  WORKER_TOKEN: string;
  /** URL publik bucket R2 (custom domain), atau URL Worker ini + /media untuk dev. */
  MEDIA_PUBLIC_URL: string;
  APP_URL: string;
  AI_MOCK?: string;
  YOUTUBE_DAILY_UPLOADS?: string;
  /** Kosong = Rendi (api.rendi.dev, key dari /admin/secrets). Diisi = emulator lokal. */
  RENDER_BASE_URL?: string;
  RENDER_API_KEY?: string;
  /** Target panjang segmen render (detik, default 120). Episode > 1,5× nilai ini dirender per segmen. */
  RENDER_SEGMENT_SEC?: string;
}

export type { MediaJobData };
