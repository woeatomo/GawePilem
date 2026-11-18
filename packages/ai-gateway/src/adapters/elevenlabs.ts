import { ProviderError } from '../errors';
import type { AudioAsset, VoiceAI, VoiceRequest } from '../types';
import { request } from './http';

export interface ElevenLabsOptions {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Perkiraan durasi MP3 CBR dari ukuran byte (bitrate 128 kbps). */
export function mp3DurationMs(bytes: number, kbps = 128): number {
  return Math.round((bytes * 8) / kbps);
}

export class ElevenLabsAdapter implements VoiceAI {
  readonly provider = 'elevenlabs';
  private readonly f: typeof fetch;
  constructor(private readonly opts: ElevenLabsOptions) {
    if (!opts.apiKey) throw new ProviderError('API key ElevenLabs kosong', this.provider, 'auth');
    this.f = opts.fetch ?? fetch;
  }

  async synthesize(req: VoiceRequest): Promise<AudioAsset> {
    if (!req.voiceId) throw new ProviderError('voice_id wajib (suara karakter terkunci)', this.provider, 'bad_request');
    const base = (this.opts.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
    const url = `${base}/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=mp3_44100_128`;
    const res = await request(this.provider, this.f, url, {
      method: 'POST',
      headers: { 'xi-api-key': this.opts.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: req.text,
        model_id: req.model ?? this.opts.defaultModel ?? 'eleven_multilingual_v2',
        ...(req.languageCode ? { language_code: req.languageCode } : {}),
        voice_settings: {
          stability: req.stability ?? 0.5,
          similarity_boost: 0.8,
          style: req.style ?? 0,
          speed: req.speed ?? 1,
        },
      }),
      signal: req.signal,
      timeoutMs: 90_000,
    });
    const data = new Uint8Array(await res.arrayBuffer());
    return { data, mimeType: 'audio/mpeg', durationMs: mp3DurationMs(data.byteLength) };
  }
}
