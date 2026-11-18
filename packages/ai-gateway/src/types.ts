import type { Category, BillingMode, Tier } from '@atomo/credits';

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface TextRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Minta output JSON (response_format json_object bila model mendukung). */
  json?: boolean;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TextResult {
  text: string;
  model: string;
  usage: TokenUsage;
  finishReason: string;
}

export interface TextStream extends AsyncIterable<string> {
  /** Selesai setelah stream habis. */
  final(): Promise<TextResult>;
}

export interface CharacterReference {
  characterId: string;
  name: string;
  /** URL reference image multi-sudut yang sudah dikunci. */
  imageUrls: string[];
  voiceId?: string;
}

export interface VoiceRequest {
  text: string;
  voiceId: string;
  model?: string;
  /** 0..1 */
  stability?: number;
  style?: number;
  speed?: number;
  languageCode?: string;
  signal?: AbortSignal;
}

export interface AudioAsset {
  data: Uint8Array;
  mimeType: string;
  durationMs: number | null;
}

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  aspect: '9:16' | '16:9' | '1:1';
  count?: number;
  seed?: number;
  model?: string;
  /** Wajib diisi bila shot memuat karakter terkunci. */
  characters?: CharacterReference[];
  signal?: AbortSignal;
}

export interface ImageAsset {
  url: string;
  width: number;
  height: number;
  seed?: number;
  mimeType: string;
}

export interface VideoRequest {
  imageUrl: string;
  prompt: string;
  durationSec: number;
  aspect: '9:16' | '16:9' | '1:1';
  resolution: '480p' | '720p' | '1080p';
  model?: string;
  seed?: number;
  signal?: AbortSignal;
}

export type VideoJobState = 'queued' | 'running' | 'succeeded' | 'failed';
export interface VideoJobStatus {
  state: VideoJobState;
  progress: number;
  videoUrl?: string;
  error?: string;
}

export interface VideoJobHandle {
  provider: string;
  requestId: string;
  model: string;
  statusUrl?: string;
  responseUrl?: string;
}

// ---------------- interface per kategori ----------------

export interface ScriptAI {
  readonly provider: string;
  generate(req: TextRequest & { stream: true }): TextStream;
  generate(req: TextRequest & { stream?: false }): Promise<TextResult>;
  generate(req: TextRequest): TextStream | Promise<TextResult>;
}

export interface VoiceAI {
  readonly provider: string;
  synthesize(req: VoiceRequest): Promise<AudioAsset>;
}

export interface ImageAI {
  readonly provider: string;
  generate(req: ImageRequest): Promise<ImageAsset[]>;
}

export interface VideoAI {
  readonly provider: string;
  imageToVideo(req: VideoRequest): Promise<VideoJobHandle>;
  status(handle: VideoJobHandle, signal?: AbortSignal): Promise<VideoJobStatus>;
}

export interface CategoryAdapters {
  naskah: ScriptAI;
  vo: VoiceAI;
  image: ImageAI;
  video: VideoAI;
}

/** Pengaturan user per kategori (baris provider_settings tanpa key mentah). */
export interface ProviderSetting {
  category: Category;
  provider: string;
  model: string;
  mode: BillingMode;
  tier: Tier;
  /** Key BYOK terenkripsi; didekripsi di server saja. */
  encryptedKey?: string | null;
}
