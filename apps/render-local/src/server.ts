import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { splitCommand } from '@atomo/timeline';

/**
 * Emulator API Rendi (POST /v1/run-ffmpeg-command, GET /v1/commands/:id) yang menjalankan
 * FFmpeg lokal. Hanya untuk dev & E2E (dan opsi self-host); produksi memakai Rendi.
 */
const submitSchema = z.object({
  input_files: z.record(z.string().regex(/^in_\w+$/), z.string().url()),
  output_files: z.record(z.string().regex(/^out_\w+$/), z.string().regex(/^[\w.-]+$/)),
  ffmpeg_command: z.string().min(1).max(200_000),
  max_command_run_seconds: z.number().positive().optional(),
  vcpu_count: z.number().int().positive().optional(),
});

interface Cmd {
  status: 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  outputs: Record<string, { storage_url: string; size_mbytes: number }>;
  error?: string;
}

export function startRenderLocal(opts: { port: number; dir: string; apiKey?: string; publicBase?: string; ffmpeg?: string }): Server {
  const root = resolve(opts.dir);
  const cmds = new Map<string, Cmd>();
  const base = () => opts.publicBase ?? `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  async function run(id: string, req: z.infer<typeof submitSchema>) {
    const c = cmds.get(id)!;
    c.status = 'PROCESSING';
    const dir = join(root, id);
    await mkdir(dir, { recursive: true });
    try {
      const local: Record<string, string> = {};
      for (const [alias, url] of Object.entries(req.input_files)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`UNREACHABLE_INPUT_FILE: ${alias} (${res.status})`);
        const name = `${alias}-${basename(new URL(url).pathname) || 'file'}`;
        await writeFile(join(dir, name), new Uint8Array(await res.arrayBuffer()));
        local[alias] = join(dir, name);
      }
      for (const [alias, name] of Object.entries(req.output_files)) local[alias] = join(dir, name);
      const args = splitCommand(req.ffmpeg_command).map((a) =>
        a.replace(/\{\{(\w+)\}\}/g, (m, k: string) => {
          if (!local[k]) throw new Error(`Placeholder tidak dikenal: ${m}`);
          return local[k];
        }),
      );
      await new Promise<void>((ok, fail) => {
        const p = spawn(opts.ffmpeg ?? 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-3000)));
        const t = setTimeout(() => p.kill('SIGKILL'), (req.max_command_run_seconds ?? 300) * 1000);
        p.on('close', (code) => {
          clearTimeout(t);
          if (code === 0) ok();
          else fail(new Error(`FFMPEG_ERROR: ${err.split('\n').slice(-5).join(' | ')}`));
        });
        p.on('error', fail);
      });
      for (const [alias, name] of Object.entries(req.output_files)) {
        const s = await stat(local[alias]!);
        c.outputs[alias] = { storage_url: `${base()}/files/${id}/${name}`, size_mbytes: s.size / 1024 / 1024 };
      }
      c.status = 'SUCCESS';
    } catch (e) {
      c.status = 'FAILED';
      c.error = (e as Error).message;
    }
  }

  const server = createServer(async (req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
        const [, , id, name] = url.pathname.split('/');
        if (!id || !name || !/^[\w-]+$/.test(id) || !/^[\w.-]+$/.test(name)) return json(400, { error: 'bad path' });
        const p = join(root, id, name);
        const s = await stat(p).catch(() => null);
        if (!s) return json(404, { error: 'not found' });
        res.writeHead(200, { 'content-type': name.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream', 'content-length': s.size });
        return void createReadStream(p).pipe(res);
      }
      if (opts.apiKey && req.headers['x-api-key'] !== opts.apiKey) return json(401, { error: 'unauthorized' });
      if (req.method === 'POST' && url.pathname === '/v1/run-ffmpeg-command') {
        let body = '';
        for await (const c of req) body += c;
        const p = submitSchema.safeParse(JSON.parse(body || '{}'));
        if (!p.success) return json(422, { error: p.error.issues[0]?.message });
        const id = randomUUID();
        cmds.set(id, { status: 'QUEUED', outputs: {} });
        void run(id, p.data);
        return json(200, { command_id: id });
      }
      const m = /^\/v1\/commands\/([\w-]+)$/.exec(url.pathname);
      if (req.method === 'GET' && m) {
        const c = cmds.get(m[1]!);
        if (!c) return json(404, { error: 'not found' });
        return json(200, { status: c.status, output_files: c.outputs, ...(c.error ? { error_status: c.error.split(':')[0], error_message: c.error } : {}) });
      }
      json(404, { error: 'not found' });
    } catch (e) {
      json(500, { error: (e as Error).message });
    }
  });
  server.listen(opts.port, '0.0.0.0');
  return server;
}
