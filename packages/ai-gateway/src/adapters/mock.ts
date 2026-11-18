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

const DIM = { '9:16': [576, 1024], '16:9': [1024, 576], '1:1': [768, 768] } as const;

export class MockImageAI implements ImageAI {
  readonly provider = 'mock';
  async generate(req: ImageRequest): Promise<ImageAsset[]> {
    const [w, h] = DIM[req.aspect];
    const hue = [...req.prompt].reduce((a, c) => (a + c.charCodeAt(0)) % 360, 0);
    const label = req.prompt.slice(0, 40).replace(/[<&>"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 30% 30%)"/><stop offset="1" stop-color="hsl(${hue} 30% 8%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" fill="#ebe8e2" font-family="sans-serif" font-size="${Math.round(w / 24)}" text-anchor="middle">${label}</text></svg>`;
    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return Array.from({ length: req.count ?? 1 }, (_, i) => ({ url, width: w, height: h, mimeType: 'image/svg+xml', seed: (req.seed ?? 1) + i }));
  }
}

export class MockVideoAI implements VideoAI {
  readonly provider = 'mock';
  private polls = new Map<string, number>();
  async imageToVideo(req: VideoRequest): Promise<VideoJobHandle> {
    const id = `mock-${Buffer.from(req.imageUrl.slice(-24) + req.prompt).toString('base64url').slice(0, 16)}`;
    this.polls.set(id, 0);
    return { provider: this.provider, requestId: id, model: req.model ?? 'mock-video' };
  }
  async status(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const n = (this.polls.get(handle.requestId) ?? 0) + 1;
    this.polls.set(handle.requestId, n);
    // Worker merender klip diam dari keyframe bila videoUrl berawalan "still:".
    if (n >= 3) return { state: 'succeeded', progress: 100, videoUrl: `still:${handle.requestId}` };
    return { state: 'running', progress: n * 33 };
  }
}
