import type { Category, Tier } from '@atomo/credits';

export type TextEndpoint = 'chat' | 'responses' | 'messages';

export interface ModelInfo {
  id: string;
  provider: string;
  category: Category;
  label: string;
  /** Hanya untuk teks: endpoint OpenCode Zen yang dipakai model ini. */
  endpoint?: TextEndpoint;
  contextTokens?: number;
  supportsJsonMode?: boolean;
  /** Model cadangan bila model ini gagal sementara. */
  fallback?: string[];
}

/**
 * Registri model. Endpoint per model mengikuti docs OpenCode Zen; verifikasi ulang
 * lewat `GET https://opencode.ai/zen/v1/models` sebelum menambah model baru.
 */
export const MODELS: readonly ModelInfo[] = [
  { id: 'deepseek-v4-flash', provider: 'opencode', category: 'naskah', label: 'DeepSeek V4 Flash', endpoint: 'chat', contextTokens: 128_000, supportsJsonMode: true, fallback: ['glm-5.2'] },
  { id: 'deepseek-v4-pro', provider: 'opencode', category: 'naskah', label: 'DeepSeek V4 Pro', endpoint: 'chat', contextTokens: 128_000, supportsJsonMode: true, fallback: ['deepseek-v4-flash'] },
  { id: 'glm-5.2', provider: 'opencode', category: 'naskah', label: 'GLM 5.2', endpoint: 'chat', contextTokens: 128_000, supportsJsonMode: true, fallback: ['deepseek-v4-flash'] },
  { id: 'minimax-m2.7', provider: 'opencode', category: 'naskah', label: 'MiniMax M2.7', endpoint: 'chat', contextTokens: 192_000, supportsJsonMode: false, fallback: ['deepseek-v4-flash'] },
  { id: 'gpt-5.5', provider: 'opencode', category: 'naskah', label: 'GPT-5.5', endpoint: 'responses', contextTokens: 256_000, supportsJsonMode: true, fallback: ['deepseek-v4-pro'] },
  { id: 'claude-sonnet-5-5', provider: 'opencode', category: 'naskah', label: 'Claude Sonnet 5.5', endpoint: 'messages', contextTokens: 200_000, supportsJsonMode: false, fallback: ['deepseek-v4-pro'] },

  { id: 'eleven_multilingual_v2', provider: 'elevenlabs', category: 'vo', label: 'ElevenLabs Multilingual' },
  { id: 'eleven_flash_v2_5', provider: 'elevenlabs', category: 'vo', label: 'ElevenLabs Flash (latensi rendah)' },

  { id: 'fal-ai/flux/dev', provider: 'fal', category: 'image', label: 'FLUX dev', fallback: ['fal-ai/flux/schnell'] },
  { id: 'fal-ai/flux/schnell', provider: 'fal', category: 'image', label: 'FLUX schnell (cepat)' },
  { id: 'fal-ai/flux-pulid', provider: 'fal', category: 'image', label: 'FLUX + konsistensi wajah' },

  { id: 'fal-ai/kling-video/v2.1/standard/image-to-video', provider: 'fal', category: 'video', label: 'Kling i2v standar' },
  { id: 'fal-ai/kling-video/v2.1/pro/image-to-video', provider: 'fal', category: 'video', label: 'Kling i2v pro' },

  { id: 'mock-text', provider: 'mock', category: 'naskah', label: 'Mock (dev)', endpoint: 'chat', contextTokens: 32_000, supportsJsonMode: true },
  { id: 'mock-voice', provider: 'mock', category: 'vo', label: 'Mock (dev)' },
  { id: 'mock-image', provider: 'mock', category: 'image', label: 'Mock (dev)' },
  { id: 'mock-video', provider: 'mock', category: 'video', label: 'Mock (dev)' },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Model default per kategori × tier saat user belum memilih. */
export const DEFAULT_MODEL: Record<Category, Record<Tier, string>> = {
  naskah: { hemat: 'deepseek-v4-flash', standar: 'deepseek-v4-flash', premium: 'deepseek-v4-pro' },
  vo: { hemat: 'eleven_flash_v2_5', standar: 'eleven_multilingual_v2', premium: 'eleven_multilingual_v2' },
  image: { hemat: 'fal-ai/flux/schnell', standar: 'fal-ai/flux-pulid', premium: 'fal-ai/flux-pulid' },
  video: {
    hemat: 'fal-ai/kling-video/v2.1/standard/image-to-video',
    standar: 'fal-ai/kling-video/v2.1/standard/image-to-video',
    premium: 'fal-ai/kling-video/v2.1/pro/image-to-video',
  },
};

/** Perkiraan kasar token: ~4 karakter per token untuk teks Latin. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
