import { gradientPng } from '../png';
import type {
  AudioAsset, ImageAI, ImageAsset, ImageRequest, ScriptAI, TextRequest, TextResult, TextStream,
  VideoAI, VideoJobHandle, VideoJobStatus, VideoRequest, VoiceAI, VoiceRequest,
} from '../types';

/**
 * Adapter tiruan untuk dev lokal tanpa API key (AI_MOCK=1) dan tes. Deterministik.
 * `responder` menerima request dan mengembalikan teks, mis. fixture dari prompt-engine.
 */
export class MockScriptAI implements ScriptAI {
  readonly provider = 'mock';
  constructor(private readonly responder: (req: TextRequest) => string = () => 'OK', private readonly delayMs = 0) {}

  generate(req: TextRequest & { stream: true }): TextStream;
  generate(req: TextRequest & { stream?: false }): Promise<TextResult>;
  generate(req: TextRequest): TextStream | Promise<TextResult>;
  generate(req: TextRequest): TextStream | Promise<TextResult> {
    const text = this.responder(req);
    const result: TextResult = {
      text,
      model: req.model ?? 'mock-text',
      usage: { inputTokens: Math.ceil(req.messages.map((m) => m.content).join('').length / 4), outputTokens: Math.ceil(text.length / 4) },
      finishReason: 'stop',
    };
    if (!req.stream) return Promise.resolve(result);
    const delay = this.delayMs;
    const gen = (async function* () {
      for (const piece of text.split(/(?<=\s)/)) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        yield piece;
      }
    })();
    return {
      [Symbol.asyncIterator]: () => gen,
      final: async () => {
        for await (const _ of gen) void _;
        return result;
      },
    };
  }
}

/** WAV PCM 16-bit mono senyap; durasi ≈ jumlah kata / 2,6 kata per detik. */
export function silentWav(durationMs: number, sampleRate = 22_050): Uint8Array {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples * 2, true);
  return new Uint8Array(buf);
}

export class MockVoiceAI implements VoiceAI {
  readonly provider = 'mock';
  async synthesize(req: VoiceRequest): Promise<AudioAsset> {
    const words = req.text.split(/\s+/).filter(Boolean).length;
    const durationMs = Math.max(800, Math.round((words / 2.6) * 1000));
    return { data: silentWav(durationMs), mimeType: 'audio/wav', durationMs };
  }
}

const DIM = { '9:16': [288, 512], '16:9': [512, 288], '1:1': [384, 384] } as const;

export class MockImageAI implements ImageAI {
  readonly provider = 'mock';
  async generate(req: ImageRequest): Promise<ImageAsset[]> {
    const [w, h] = DIM[req.aspect];
    const hue = [...req.prompt].reduce((a, c) => (a + c.charCodeAt(0)) % 360, 0);
    const url = `data:image/png;base64,${Buffer.from(gradientPng(w, h, hue)).toString('base64')}`;
    return Array.from({ length: req.count ?? 1 }, (_, i) => ({ url, width: w, height: h, mimeType: 'image/png', seed: (req.seed ?? 1) + i }));
  }
}

/**
 * Video mock tanpa state (aman di serverless: pengecekan status bisa jalan di instance berbeda).
 * Selesai ~1,5 detik setelah dibuat; videoUrl "still:" = buat klip gerak kamera dari frame kunci.
 */
export class MockVideoAI implements VideoAI {
  readonly provider = 'mock';
  constructor(private readonly now: () => number = Date.now, private readonly readyAfterMs = 1500) {}
  async imageToVideo(req: VideoRequest): Promise<VideoJobHandle> {
    const tag = Buffer.from(req.imageUrl.slice(-24) + req.prompt).toString('base64url').slice(0, 12);
    return { provider: this.provider, requestId: `mock-${this.now()}-${tag}`, model: req.model ?? 'mock-video' };
  }
  async status(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const started = Number(handle.requestId.split('-')[1] ?? 0);
    const elapsed = this.now() - started;
    if (elapsed >= this.readyAfterMs) return { state: 'succeeded', progress: 100, videoUrl: `still:${handle.requestId}` };
    return { state: 'running', progress: Math.min(90, Math.round((elapsed / this.readyAfterMs) * 100)) };
  }
}
