import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { outputSize, parseProgress } from '@atomo/timeline';
import { env } from '../env';

export function runFfmpeg(args: string[], onProgress?: (chunk: string) => void, timeoutMs = 30 * 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(env.FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (d: Buffer) => onProgress?.(d.toString()));
    p.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg keluar dengan kode ${code}: ${stderr.split('\n').slice(-6).join(' | ')}`));
    });
  });
}

/** Klip dari gambar diam dengan slow push-in (dipakai mode mock dan fallback). */
export async function stillToClip(image: Uint8Array, durationSec: number, aspect: '9:16' | '16:9' | '1:1'): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'still-'));
  try {
    const { width, height } = outputSize(aspect, '480p');
    const inp = join(dir, 'in.png');
    const out = join(dir, 'out.mp4');
    await writeFile(inp, image);
    const frames = Math.max(1, Math.round(durationSec * 24));
    await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', inp,
      '-vf', `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='min(zoom+0.0008,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=24,format=yuv420p`,
      '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', out,
    ]);
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function probeDuration(path: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(env.FFMPEG_PATH.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]);
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('close', () => resolve(Number(out.trim()) || 0));
    p.on('error', () => resolve(0));
  });
}

export { parseProgress };
