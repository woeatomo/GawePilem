import { z } from 'zod';
import { compileTimeline, outputSize, type AssetRef, type CompileOptions, type Quality } from './compile';
import type { Timeline } from './schema';

/**
 * Render di layanan FFmpeg cloud (API Rendi: POST /v1/run-ffmpeg-command).
 * Perintah memakai placeholder {{in_x}} / {{out_x}}; layanan mengunduh input dari URL publik,
 * menjalankan FFmpeg, lalu memberi URL hasil.
 */

// ---------- perintah ----------

const SAFE = /^[A-Za-z0-9_./:=+@%{}-]+$/;

/** Gabungkan argumen jadi satu string perintah; argumen tidak aman dikutip ganda. */
export function joinCommand(args: readonly string[]): string {
  return args.map((a) => (a !== '' && SAFE.test(a) ? a : `"${a.replace(/(["\\$`])/g, '\\$1')}"`)).join(' ');
}

/** Pecah string perintah (gaya shell: kutip ganda/tunggal, escape backslash dalam kutip ganda). */
export function splitCommand(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let q: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!;
    if (q === "'") {
      if (c === "'") q = null;
      else cur += c;
    } else if (q === '"') {
      if (c === '\\' && i + 1 < cmd.length && '"\\$`'.includes(cmd[i + 1]!)) cur += cmd[++i];
      else if (c === '"') q = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (q) throw new Error('Tanda kutip tidak tertutup pada perintah');
  if (has || cur) out.push(cur);
  return out;
}

export interface RemoteAsset {
  url: string;
  kind: AssetRef['kind'];
}

export interface RemoteCommand {
  command: string;
  inputFiles: Record<string, string>;
  outputFiles: Record<string, string>;
  duration: number;
}

/** Bentuk perintah FFmpeg remote dari timeline. Alias input stabil: in_v0.., in_a0.., in_sub. */
export function remoteCommand(
  t: Timeline,
  o: Omit<CompileOptions, 'assets' | 'outputPath' | 'subtitlePath'> & { assets: Record<string, RemoteAsset>; subtitleUrl?: string; outputName: string },
): RemoteCommand {
  const inputFiles: Record<string, string> = {};
  const local: Record<string, AssetRef> = {};
  let n = 0;
  for (const [id, a] of Object.entries(o.assets)) {
    const alias = `in_${a.kind === 'audio' ? 'a' : 'v'}${n++}`;
    inputFiles[alias] = a.url;
    local[id] = { path: `{{${alias}}}`, kind: a.kind };
  }
  if (o.subtitleUrl) inputFiles.in_sub = o.subtitleUrl;
  const { assets: _a, subtitleUrl: _s, outputName, ...rest } = o;
  const c = compileTimeline(t, { ...rest, assets: local, outputPath: '{{out_1}}', ...(o.subtitleUrl ? { subtitlePath: '{{in_sub}}' } : {}) });
  // Progres lewat pipe tidak berlaku di layanan remote.
  const args = c.args.filter((a, i, all) => !(a === '-progress' || all[i - 1] === '-progress')).map((a) => a.replace(/;\n/g, ';'));
  return { command: joinCommand(args), inputFiles, outputFiles: { out_1: outputName }, duration: c.duration };
}

/** Klip dari gambar diam dengan slow push-in (gerak kamera tanpa model video AI). */
export function stillToClipCommand(o: { imageUrl: string; durationSec: number; aspect: Timeline['aspect']; quality?: Quality; outputName: string; fps?: number }): RemoteCommand {
  const { width: W, height: H } = outputSize(o.aspect, o.quality ?? '720p');
  const fps = o.fps ?? 24;
  const frames = Math.max(1, Math.round(o.durationSec * fps));
  const vf =
    `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
    `zoompan=z='min(zoom+0.0008,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps},format=yuv420p`;
  const args = ['-hide_banner', '-y', '-loop', '1', '-i', '{{in_img}}', '-vf', vf, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '{{out_1}}'];
  return { command: joinCommand(args), inputFiles: { in_img: o.imageUrl }, outputFiles: { out_1: o.outputName }, duration: o.durationSec };
}

// ---------- client (API Rendi; emulator lokal memakai API yang sama) ----------

export type RemoteState = 'queued' | 'running' | 'succeeded' | 'failed';
export interface RemoteStatus {
  state: RemoteState;
  outputs: Record<string, { url: string; sizeMb?: number; duration?: number }>;
  error?: string;
}

const submitRes = z.object({ command_id: z.string() });
const statusRes = z.object({
  status: z.string(),
  output_files: z.record(z.string(), z.object({ storage_url: z.string(), size_mbytes: z.number().optional(), duration: z.number().optional() }).passthrough()).nullish(),
  error_status: z.string().nullish(),
  error_message: z.string().nullish(),
});

export class RenderClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
  /** 5xx / 429 / jaringan = sementara, layak dicoba ulang. */
  get retryable() {
    return this.status === undefined || this.status === 429 || this.status >= 500;
  }
}

export class RenderClient {
  private readonly f: typeof fetch;
  constructor(
    private readonly opts: { baseUrl?: string; apiKey: string; fetch?: typeof fetch },
  ) {
    this.f = opts.fetch ?? fetch;
  }
  private get base() {
    return (this.opts.baseUrl ?? 'https://api.rendi.dev').replace(/\/$/, '');
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await this.f(`${this.base}${path}`, {
        ...init,
        headers: { 'X-API-KEY': this.opts.apiKey, 'content-type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new RenderClientError(`Layanan render tidak bisa dihubungi: ${(e as Error).message}`);
    }
    if (!res.ok) throw new RenderClientError(`Layanan render menolak (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`, res.status);
    return res.json();
  }

  async submit(c: RemoteCommand, opts: { maxSeconds?: number; vcpu?: number } = {}): Promise<string> {
    const body = {
      input_files: c.inputFiles,
      output_files: c.outputFiles,
      ffmpeg_command: c.command,
      max_command_run_seconds: opts.maxSeconds ?? 900,
      vcpu_count: opts.vcpu ?? 8,
    };
    return submitRes.parse(await this.call('/v1/run-ffmpeg-command', { method: 'POST', body: JSON.stringify(body) })).command_id;
  }

  async status(commandId: string): Promise<RemoteStatus> {
    const r = statusRes.parse(await this.call(`/v1/commands/${encodeURIComponent(commandId)}`));
    const s = r.status.toUpperCase();
    const outputs = Object.fromEntries(
      Object.entries(r.output_files ?? {}).map(([k, v]) => [k, { url: v.storage_url, ...(v.size_mbytes !== undefined ? { sizeMb: v.size_mbytes } : {}), ...(v.duration !== undefined ? { duration: v.duration } : {}) }]),
    );
    if (s === 'SUCCESS') return { state: 'succeeded', outputs };
    if (s === 'FAILED') return { state: 'failed', outputs, error: [r.error_status, r.error_message].filter(Boolean).join(': ') || 'Render gagal' };
    if (s === 'QUEUED' || s === 'PENDING') return { state: 'queued', outputs };
    return { state: 'running', outputs };
  }
}
