import type { Category } from '@atomo/credits';
import { ElevenLabsAdapter } from './adapters/elevenlabs';
import { FalAdapter } from './adapters/fal';
import { MockImageAI, MockScriptAI, MockVideoAI, MockVoiceAI } from './adapters/mock';
import { OpenCodeZenAdapter } from './adapters/opencode';
import { decryptSecret } from './crypto';
import { ProviderError, toProviderError } from './errors';
import { findModel } from './models';
import { RateLimiter } from './ratelimit';
import { withRetry, type RetryOptions } from './retry';
import { generateStructured, type StructuredResult } from './structured';
import type {
  AudioAsset, ImageAI, ImageAsset, ImageRequest, ProviderSetting, ScriptAI, TextRequest, TextResult,
  TextStream, VideoAI, VideoJobHandle, VideoJobStatus, VideoRequest, VoiceAI, VoiceRequest,
} from './types';
import type { z } from 'zod';

export interface PlatformKeys {
  opencode?: string;
  elevenlabs?: string;
  fal?: string;
}

/** Pencatat job (implementasi DB ada di worker/web: RPC job_mark_running / job_succeed / job_fail). */
export interface JobRecorder {
  running(jobId: string): Promise<void>;
  succeeded(jobId: string, output: Record<string, unknown>): Promise<void>;
  /** Wajib me-refund kredit job (job_fail di DB melakukan keduanya secara atomik). */
  failed(jobId: string, error: ProviderError): Promise<void>;
}

export interface CallMeta {
  provider: string;
  model: string;
  billingMode: 'saldo' | 'byok';
  attempts: number;
  fallbackFrom?: string;
}

export interface GatewayOptions {
  platformKeys: PlatformKeys;
  /** Dekripsi key BYOK. Default: AES-GCM dengan ENCRYPTION_KEY. */
  decrypt?: (encrypted: string, aad: string) => string;
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  retry?: Partial<RetryOptions>;
  /** Paksa semua kategori memakai adapter mock (dev tanpa key / tes). */
  mock?: boolean;
  mockResponder?: (req: TextRequest) => string;
}

const DEFAULT_LIMITS = {
  opencode: { capacity: 20, perSec: 5 },
  elevenlabs: { capacity: 5, perSec: 2 },
  fal: { capacity: 10, perSec: 3 },
  mock: { capacity: 1000, perSec: 1000 },
};

/**
 * Satu-satunya pintu ke provider AI. Memilih adapter dari pengaturan user per kategori,
 * memakai key platform (mode saldo) atau key BYOK (didekripsi di server), menerapkan
 * rate limit, retry + backoff, dan fallback ke model cadangan.
 */
export class AIGateway {
  private readonly limiter: RateLimiter;
  private readonly decrypt: (e: string, aad: string) => string;

  constructor(private readonly opts: GatewayOptions) {
    this.limiter = opts.limiter ?? new RateLimiter(DEFAULT_LIMITS);
    this.decrypt = opts.decrypt ?? ((e, aad) => decryptSecret(e, undefined, aad));
  }

  private keyFor(setting: ProviderSetting): string {
    if (setting.mode === 'byok') {
      if (!setting.encryptedKey) throw new ProviderError('Mode BYOK aktif tapi API key belum diisi', setting.provider, 'auth');
      return this.decrypt(setting.encryptedKey, setting.keyAad ?? '');
    }
    const k = this.opts.platformKeys[setting.provider as keyof PlatformKeys];
    if (!k) throw new ProviderError(`Key platform untuk ${setting.provider} belum dikonfigurasi`, setting.provider, 'auth');
    return k;
  }

  private useMock(setting: ProviderSetting): boolean {
    return this.opts.mock === true || setting.provider === 'mock';
  }

  script(setting: ProviderSetting): ScriptAI {
    this.assertCategory(setting, 'naskah');
    if (this.useMock(setting)) return new MockScriptAI(this.opts.mockResponder);
    if (setting.provider === 'opencode')
      return new OpenCodeZenAdapter({ apiKey: this.keyFor(setting), defaultModel: setting.model, ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}) });
    throw new ProviderError(`Provider teks ${setting.provider} belum didukung`, setting.provider, 'bad_request');
  }

  voice(setting: ProviderSetting): VoiceAI {
    this.assertCategory(setting, 'vo');
    if (this.useMock(setting)) return new MockVoiceAI();
    if (setting.provider === 'elevenlabs')
      return new ElevenLabsAdapter({ apiKey: this.keyFor(setting), defaultModel: setting.model, ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}) });
    throw new ProviderError(`Provider VO ${setting.provider} belum didukung`, setting.provider, 'bad_request');
  }

  image(setting: ProviderSetting): ImageAI {
    this.assertCategory(setting, 'image');
    if (this.useMock(setting)) return new MockImageAI();
    if (setting.provider === 'fal')
      return new FalAdapter({ apiKey: this.keyFor(setting), defaultImageModel: setting.model, ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}) });
    throw new ProviderError(`Provider gambar ${setting.provider} belum didukung`, setting.provider, 'bad_request');
  }

  private mockVideo = new MockVideoAI();
  video(setting: ProviderSetting): VideoAI {
    this.assertCategory(setting, 'video');
    if (this.useMock(setting)) return this.mockVideo;
    if (setting.provider === 'fal')
      return new FalAdapter({ apiKey: this.keyFor(setting), defaultVideoModel: setting.model, ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}) });
    throw new ProviderError(`Provider video ${setting.provider} belum didukung`, setting.provider, 'bad_request');
  }

  private assertCategory(setting: ProviderSetting, c: Category) {
    if (setting.category !== c) throw new ProviderError(`Setting kategori ${setting.category} dipakai untuk ${c}`, setting.provider, 'bad_request');
  }

  private meta(setting: ProviderSetting, model: string, attempts: number, fallbackFrom?: string): CallMeta {
    return { provider: setting.provider, model, billingMode: setting.mode, attempts, ...(fallbackFrom ? { fallbackFrom } : {}) };
  }

  /** Jalankan fn dengan rate limit + retry, lalu coba model cadangan bila error tetap retryable. */
  private async withPolicy<T>(
    setting: ProviderSetting,
    signal: AbortSignal | undefined,
    fn: (model: string) => Promise<T>,
  ): Promise<{ value: T; meta: CallMeta }> {
    const chain = [setting.model, ...(findModel(setting.model)?.fallback ?? [])];
    let lastErr: ProviderError | undefined;
    let attempts = 0;
    for (const model of chain) {
      try {
        const value = await withRetry(
          async () => {
            attempts++;
            await this.limiter.acquire(setting.provider, signal);
            try {
              return await fn(model);
            } catch (e) {
              throw toProviderError(setting.provider, e);
            }
          },
          { ...this.opts.retry, ...(signal ? { signal } : {}) },
        );
        return { value, meta: this.meta(setting, model, attempts, model !== setting.model ? setting.model : undefined) };
      } catch (e) {
        lastErr = toProviderError(setting.provider, e);
        if (!lastErr.retryable) throw lastErr;
      }
    }
    throw lastErr ?? new ProviderError('Semua model gagal', setting.provider, 'unknown');
  }

  async text(setting: ProviderSetting, req: TextRequest): Promise<{ result: TextResult; meta: CallMeta }> {
    const ai = this.script(setting);
    const { value, meta } = await this.withPolicy(setting, req.signal, (model) => ai.generate({ ...req, model, stream: false }));
    return { result: value, meta };
  }

  /**
   * Streaming teks. Retry/fallback hanya berlaku sebelum token pertama keluar;
   * setelah itu error diteruskan ke konsumen.
   */
  textStream(setting: ProviderSetting, req: TextRequest): TextStream & { meta: Promise<CallMeta> } {
    const ai = this.script(setting);
    const self = this;
    let resolveMeta!: (m: CallMeta) => void;
    let rejectMeta!: (e: unknown) => void;
    const meta = new Promise<CallMeta>((res, rej) => ((resolveMeta = res), (rejectMeta = rej)));
    meta.catch(() => undefined);
    let finalResult: Promise<TextResult> | undefined;

    async function* run(): AsyncGenerator<string> {
      try {
        const { value: started, meta: m } = await self.withPolicy(setting, req.signal, async (model) => {
          const s = ai.generate({ ...req, model, stream: true });
          const it = s[Symbol.asyncIterator]();
          const first = await it.next(); // error koneksi/auth muncul di sini → bisa di-retry
          return { s, it, first };
        });
        resolveMeta(m);
        if (!started.first.done) yield started.first.value;
        for (;;) {
          const n = await started.it.next();
          if (n.done) break;
          yield n.value;
        }
        // final() baru dipanggil setelah stream habis: memanggilnya lebih awal membuat dua
        // pembaca berebut iterator yang sama sehingga sebagian potongan teks hilang.
        finalResult = started.s.final();
      } catch (e) {
        const err = toProviderError(setting.provider, e);
        rejectMeta(err);
        throw err;
      }
    }
    const gen = run();
    return {
      [Symbol.asyncIterator]: () => gen,
      meta,
      final: async () => {
        for await (const _ of gen) void _;
        if (!finalResult) throw new ProviderError('Stream belum dimulai', setting.provider, 'unknown');
        return finalResult;
      },
    };
  }

  async structured<S extends z.ZodType>(
    setting: ProviderSetting,
    req: TextRequest,
    schema: S,
  ): Promise<StructuredResult<z.infer<S>> & { meta: CallMeta }> {
    const ai = this.script(setting);
    const { value, meta } = await this.withPolicy(setting, req.signal, (model) => generateStructured(ai, { ...req, model }, schema));
    return { ...value, meta };
  }

  async synthesize(setting: ProviderSetting, req: VoiceRequest): Promise<{ audio: AudioAsset; meta: CallMeta }> {
    const ai = this.voice(setting);
    const { value, meta } = await this.withPolicy(setting, req.signal, (model) => ai.synthesize({ ...req, model }));
    return { audio: value, meta };
  }

  async generateImage(setting: ProviderSetting, req: ImageRequest): Promise<{ images: ImageAsset[]; meta: CallMeta }> {
    const ai = this.image(setting);
    const { value, meta } = await this.withPolicy(setting, req.signal, (model) => ai.generate({ ...req, model }));
    return { images: value, meta };
  }

  async startVideo(setting: ProviderSetting, req: VideoRequest): Promise<{ handle: VideoJobHandle; meta: CallMeta }> {
    const ai = this.video(setting);
    const { value, meta } = await this.withPolicy(setting, req.signal, (model) => ai.imageToVideo({ ...req, model }));
    return { handle: value, meta };
  }

  async videoStatus(setting: ProviderSetting, handle: VideoJobHandle, signal?: AbortSignal): Promise<VideoJobStatus> {
    const ai = this.video(setting);
    const { value } = await this.withPolicy(setting, signal, () => ai.status(handle, signal));
    return value;
  }

  /**
   * Bungkus satu job tercatat: running → succeeded, atau failed + refund otomatis.
   * Error non-provider (bug kode) juga dianggap gagal supaya kredit user kembali.
   */
  async runJob<T extends Record<string, unknown>>(recorder: JobRecorder, jobId: string, fn: () => Promise<T>): Promise<T> {
    await recorder.running(jobId);
    try {
      const out = await fn();
      await recorder.succeeded(jobId, out);
      return out;
    } catch (e) {
      const err = toProviderError('gateway', e);
      await recorder.failed(jobId, err);
      throw err;
    }
  }
}
