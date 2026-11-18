import { z } from 'zod';
import { ProviderError } from '../errors';
import type { ImageAI, ImageAsset, ImageRequest, VideoAI, VideoJobHandle, VideoJobStatus, VideoRequest } from '../types';
import { request } from './http';

export interface FalOptions {
  apiKey: string;
  defaultImageModel?: string;
  defaultVideoModel?: string;
  fetch?: typeof fetch;
}

const IMAGE_SIZE = { '9:16': 'portrait_16_9', '16:9': 'landscape_16_9', '1:1': 'square_hd' } as const;
/** Model yang menerima reference image untuk konsistensi wajah. */
const REFERENCE_MODELS = new Set(['fal-ai/flux-pulid']);

const imageOut = z.object({
  images: z.array(z.object({ url: z.string(), width: z.number().optional(), height: z.number().optional(), content_type: z.string().optional() })),
  seed: z.number().optional(),
});
const queueSubmit = z.object({ request_id: z.string(), status_url: z.string().optional(), response_url: z.string().optional() });
const queueStatus = z.object({ status: z.string(), queue_position: z.number().optional(), logs: z.array(z.unknown()).nullable().optional() });
const videoOut = z.object({ video: z.object({ url: z.string() }) });

/** Bentuk prompt yang mengikat karakter terkunci ke deskripsi visual. */
export function characterPrompt(req: ImageRequest): string {
  if (!req.characters?.length) return req.prompt;
  const names = req.characters.map((c) => c.name).join(', ');
  return `${req.prompt}\nKarakter tetap: ${names}. Pertahankan wajah, rambut, dan pakaian sesuai referensi.`;
}

export class FalAdapter implements ImageAI, VideoAI {
  readonly provider = 'fal';
  private readonly f: typeof fetch;
  constructor(private readonly opts: FalOptions) {
    if (!opts.apiKey) throw new ProviderError('API key fal kosong', this.provider, 'auth');
    this.f = opts.fetch ?? fetch;
  }

  private headers() {
    return { authorization: `Key ${this.opts.apiKey}`, 'content-type': 'application/json' };
  }

  async generate(req: ImageRequest): Promise<ImageAsset[]> {
    let model = req.model ?? this.opts.defaultImageModel ?? 'fal-ai/flux/dev';
    const ref = req.characters?.flatMap((c) => c.imageUrls)[0];
    // Consistency engine: shot berisi karakter terkunci wajib memakai model ber-reference.
    if (ref && !REFERENCE_MODELS.has(model)) model = 'fal-ai/flux-pulid';
    const body: Record<string, unknown> = {
      prompt: characterPrompt(req),
      image_size: IMAGE_SIZE[req.aspect],
      num_images: req.count ?? 1,
      enable_safety_checker: true,
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      ...(ref ? { reference_image_url: ref } : {}),
    };
    const res = await request(this.provider, this.f, `https://fal.run/${model}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: req.signal,
      timeoutMs: 120_000,
    });
    const out = imageOut.safeParse(await res.json());
    if (!out.success) throw new ProviderError('Respons gambar fal tidak valid', this.provider, 'unknown');
    return out.data.images.map((i) => ({
      url: i.url,
      width: i.width ?? 0,
      height: i.height ?? 0,
      mimeType: i.content_type ?? 'image/jpeg',
      ...(out.data.seed !== undefined ? { seed: out.data.seed } : {}),
    }));
  }

  async imageToVideo(req: VideoRequest): Promise<VideoJobHandle> {
    const model = req.model ?? this.opts.defaultVideoModel ?? 'fal-ai/kling-video/v2.1/standard/image-to-video';
    const res = await request(this.provider, this.f, `https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: req.durationSec > 5 ? '10' : '5',
        aspect_ratio: req.aspect,
        negative_prompt: 'blur, distort, low quality, watermark, text',
      }),
      signal: req.signal,
    });
    const sub = queueSubmit.parse(await res.json());
    return {
      provider: this.provider,
      model,
      requestId: sub.request_id,
      ...(sub.status_url ? { statusUrl: sub.status_url } : {}),
      ...(sub.response_url ? { responseUrl: sub.response_url } : {}),
    };
  }

  async status(handle: VideoJobHandle, signal?: AbortSignal): Promise<VideoJobStatus> {
    const appId = handle.model.split('/').slice(0, 2).join('/');
    const statusUrl = handle.statusUrl ?? `https://queue.fal.run/${appId}/requests/${handle.requestId}/status`;
    const responseUrl = handle.responseUrl ?? `https://queue.fal.run/${appId}/requests/${handle.requestId}`;
    const st = queueStatus.parse(await (await request(this.provider, this.f, statusUrl, { headers: this.headers(), signal })).json());
    if (st.status === 'IN_QUEUE') return { state: 'queued', progress: 0 };
    if (st.status === 'IN_PROGRESS') return { state: 'running', progress: 50 };
    if (st.status !== 'COMPLETED') return { state: 'failed', progress: 0, error: `Status fal: ${st.status}` };
    const out = videoOut.safeParse(await (await request(this.provider, this.f, responseUrl, { headers: this.headers(), signal })).json());
    if (!out.success) return { state: 'failed', progress: 100, error: 'Respons video fal tidak valid' };
    return { state: 'succeeded', progress: 100, videoUrl: out.data.video.url };
  }
}
