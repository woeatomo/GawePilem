import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AIGateway, OpenCodeZenAdapter, ProviderError, decryptSecret, encryptSecret, extractJson, generateStructured,
  keyHint, MockScriptAI, parseSSE, withRetry, FalAdapter, ElevenLabsAdapter, type ProviderSetting, type JobRecorder,
} from './index';

const KEY = randomBytes(32).toString('base64');

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };
function fakeFetch(responder: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {}, body: init?.body ? JSON.parse(String(init.body)) : {} };
    calls.push(call);
    return responder(call, calls.length);
  });
  return { f: f as unknown as typeof fetch, calls };
}
const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
const chatOk = (text: string, model = 'deepseek-v4-flash') =>
  json({ model, choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
function sse(chunks: string[]): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        c.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
const setting = (over: Partial<ProviderSetting> = {}): ProviderSetting => ({
  category: 'naskah', provider: 'opencode', model: 'deepseek-v4-flash', mode: 'saldo', tier: 'standar', ...over,
});
const noSleepRetry = { retries: 2, baseMs: 1, maxMs: 2 };

describe('OpenCode Zen adapter', () => {
  it('POST /chat/completions dengan Bearer key dan response_format JSON', async () => {
    const { f, calls } = fakeFetch(() => chatOk('{"a":1}'));
    const ai = new OpenCodeZenAdapter({ apiKey: 'sk-test', defaultModel: 'deepseek-v4-flash', fetch: f });
    const r = await ai.generate({ messages: [{ role: 'user', content: 'hai' }], json: true });
    expect(calls[0]!.url).toBe('https://opencode.ai/zen/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    expect(calls[0]!.body).toMatchObject({ model: 'deepseek-v4-flash', stream: false, response_format: { type: 'json_object' } });
    expect(r).toMatchObject({ text: '{"a":1}', usage: { inputTokens: 10, outputTokens: 5 } });
  });

  it('streaming SSE walau chunk terpotong di tengah baris', async () => {
    const { f, calls } = fakeFetch(() =>
      sse([
        'data: {"choices":[{"delta":{"content":"Halo"}}]}\n\nda',
        'ta: {"choices":[{"delta":{"content":" dunia"}}]}\n\n',
        ': keep-alive\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const ai = new OpenCodeZenAdapter({ apiKey: 'k', defaultModel: 'glm-5.2', fetch: f });
    const s = ai.generate({ messages: [{ role: 'user', content: 'x' }], stream: true });
    const parts: string[] = [];
    for await (const p of s) parts.push(p);
    expect(parts).toEqual(['Halo', ' dunia']);
    expect(await s.final()).toMatchObject({ text: 'Halo dunia', usage: { inputTokens: 3, outputTokens: 2 } });
    expect(calls[0]!.body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it('model Claude lewat /messages dengan system terpisah', async () => {
    const { f, calls } = fakeFetch(() => json({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 4, output_tokens: 1 } }));
    const ai = new OpenCodeZenAdapter({ apiKey: 'k', defaultModel: 'claude-sonnet-5-5', fetch: f });
    const r = await ai.generate({ messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }] });
    expect(calls[0]!.url).toMatch(/\/messages$/);
    expect(calls[0]!.body).toMatchObject({ system: 'S', messages: [{ role: 'user', content: 'U' }] });
    expect(r.text).toBe('ok');
  });

  it('model GPT lewat /responses', async () => {
    const { f, calls } = fakeFetch(() => json({ output_text: 'hasil', status: 'completed', usage: { input_tokens: 1, output_tokens: 1 } }));
    const ai = new OpenCodeZenAdapter({ apiKey: 'k', defaultModel: 'gpt-5.5', fetch: f });
    expect((await ai.generate({ messages: [{ role: 'user', content: 'U' }] })).text).toBe('hasil');
    expect(calls[0]!.url).toMatch(/\/responses$/);
  });

  it('memetakan status HTTP ke kode error', async () => {
    const { f } = fakeFetch(() => json({ error: 'bad key' }, 401));
    const ai = new OpenCodeZenAdapter({ apiKey: 'k', defaultModel: 'glm-5.2', fetch: f });
    await expect(ai.generate({ messages: [] })).rejects.toMatchObject({ code: 'auth', retryable: false });
  });
});

describe('retry, fallback, rate limit', () => {
  it('retry 429 lalu sukses', async () => {
    const { f, calls } = fakeFetch((_c, n) => (n === 1 ? json({}, 429, { 'retry-after': '0' }) : chatOk('ok')));
    const gw = new AIGateway({ platformKeys: { opencode: 'k' }, fetch: f, retry: noSleepRetry });
    const { result, meta } = await gw.text(setting(), { messages: [{ role: 'user', content: 'x' }] });
    expect(result.text).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(meta).toMatchObject({ model: 'deepseek-v4-flash', attempts: 2, billingMode: 'saldo' });
  });

  it('fallback ke model cadangan saat provider terus 503', async () => {
    const { f, calls } = fakeFetch((c) => (c.body.model === 'deepseek-v4-flash' ? json({}, 503) : chatOk('dari glm', 'glm-5.2')));
    const gw = new AIGateway({ platformKeys: { opencode: 'k' }, fetch: f, retry: noSleepRetry });
    const { result, meta } = await gw.text(setting(), { messages: [] });
    expect(result.text).toBe('dari glm');
    expect(meta).toMatchObject({ model: 'glm-5.2', fallbackFrom: 'deepseek-v4-flash' });
    expect(calls.filter((c) => c.body.model === 'deepseek-v4-flash')).toHaveLength(3);
  });

  it('error non-retryable tidak di-retry dan tidak fallback', async () => {
    const { f, calls } = fakeFetch(() => json({}, 400));
    const gw = new AIGateway({ platformKeys: { opencode: 'k' }, fetch: f, retry: noSleepRetry });
    await expect(gw.text(setting(), { messages: [] })).rejects.toMatchObject({ code: 'bad_request' });
    expect(calls).toHaveLength(1);
  });

  it('withRetry menghormati batas percobaan', async () => {
    let n = 0;
    await expect(
      withRetry(async () => { n++; throw new ProviderError('x', 'p', 'overloaded'); }, { retries: 2, sleep: async () => undefined }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(n).toBe(3);
  });

  it('stream di-retry kalau gagal sebelum token pertama', async () => {
    const { f } = fakeFetch((_c, n) => (n === 1 ? json({}, 502) : sse(['data: {"choices":[{"delta":{"content":"A"}}]}\n\n', 'data: [DONE]\n\n'])));
    const gw = new AIGateway({ platformKeys: { opencode: 'k' }, fetch: f, retry: noSleepRetry });
    const s = gw.textStream(setting(), { messages: [] });
    const out: string[] = [];
    for await (const p of s) out.push(p);
    expect(out).toEqual(['A']);
    expect((await s.final()).text).toBe('A');
    expect((await s.meta).attempts).toBe(2);
  });
});

describe('BYOK & key', () => {
  it('mode BYOK memakai key user yang didekripsi di server', async () => {
    const { f, calls } = fakeFetch(() => chatOk('ok'));
    const enc = encryptSecret('sk-user-123456789', KEY, 'ws1:naskah');
    const gw = new AIGateway({ platformKeys: { opencode: 'platform' }, fetch: f, decrypt: (e, aad) => decryptSecret(e, KEY, aad) });
    const { meta } = await gw.text(setting({ mode: 'byok', encryptedKey: enc, keyAad: 'ws1:naskah' }), { messages: [] });
    // Ciphertext workspace lain tidak bisa dipakai (AAD berbeda).
    expect(() => gw.script(setting({ mode: 'byok', encryptedKey: enc, keyAad: 'ws2:naskah' }))).toThrow();
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-user-123456789');
    expect(meta.billingMode).toBe('byok');
  });

  it('BYOK tanpa key dan saldo tanpa key platform → error auth', () => {
    const gw = new AIGateway({ platformKeys: {} });
    expect(() => gw.script(setting({ mode: 'byok' }))).toThrow(/BYOK/);
    expect(() => gw.script(setting())).toThrow(/Key platform/);
  });

  it('enkripsi AES-GCM round-trip dan menolak ciphertext yang diubah', () => {
    const e = encryptSecret('rahasia', KEY);
    expect(e).toMatch(/^v1\./);
    expect(decryptSecret(e, KEY)).toBe('rahasia');
    const parts = e.split('.');
    parts[3] = Buffer.from('xxxx').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), KEY)).toThrow();
    expect(() => encryptSecret('x', Buffer.alloc(16).toString('base64'))).toThrow(/32 byte/);
  });

  it('keyHint hanya membuka 4 karakter akhir', () => {
    expect(keyHint('sk-abcdefghijklmnop1234')).toBe('sk-…1234');
    expect(keyHint('short')).toBe('…');
  });
});

describe('output terstruktur', () => {
  const schema = z.object({ title: z.string(), shots: z.array(z.object({ dur: z.number().positive() })).min(1) });

  it('extractJson menangani fence dan teks pengantar', () => {
    expect(extractJson('Berikut:\n```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
    expect(extractJson('Tentu! {"a":"kurung } di string"} selesai')).toEqual({ a: 'kurung } di string' });
    expect(() => extractJson('tidak ada')).toThrow();
  });

  it('memperbaiki sekali dengan pesan error', async () => {
    let n = 0;
    const ai = new MockScriptAI(() => (++n === 1 ? '{"title":"x","shots":[]}' : '{"title":"x","shots":[{"dur":3}]}'));
    const spy = vi.spyOn(ai, 'generate');
    const r = await generateStructured(ai, { messages: [{ role: 'user', content: 'buat' }] }, schema);
    expect(r.repaired).toBe(true);
    expect(r.data.shots[0]!.dur).toBe(3);
    const second = spy.mock.calls[1]![0];
    expect(second.messages.at(-1)!.content).toMatch(/shots/);
  });

  it('gagal dua kali → invalid_output (job ditandai gagal & refund)', async () => {
    const ai = new MockScriptAI(() => 'bukan json');
    await expect(generateStructured(ai, { messages: [] }, schema)).rejects.toMatchObject({ code: 'invalid_output' });
  });
});

describe('runJob mencatat & refund', () => {
  it('sukses → succeeded; gagal → failed (refund)', async () => {
    const rec: JobRecorder = { running: vi.fn(async () => undefined), succeeded: vi.fn(async () => undefined), failed: vi.fn(async () => undefined) };
    const gw = new AIGateway({ platformKeys: {}, mock: true });
    await gw.runJob(rec, 'j1', async () => ({ ok: true }));
    expect(rec.succeeded).toHaveBeenCalledWith('j1', { ok: true });
    await expect(gw.runJob(rec, 'j2', async () => { throw new ProviderError('down', 'fal', 'overloaded'); })).rejects.toThrow();
    expect(rec.failed).toHaveBeenCalledWith('j2', expect.objectContaining({ code: 'overloaded' }));
  });
});

describe('adapter gambar, video, VO', () => {
  it('fal: karakter terkunci memaksa model ber-reference', async () => {
    const { f, calls } = fakeFetch(() => json({ images: [{ url: 'https://x/1.jpg', width: 576, height: 1024 }], seed: 7 }));
    const fal = new FalAdapter({ apiKey: 'k', fetch: f });
    const imgs = await fal.generate({
      prompt: 'Laras di lorong', aspect: '9:16', model: 'fal-ai/flux/dev',
      characters: [{ characterId: 'c1', name: 'Laras', imageUrls: ['https://ref/laras-front.jpg'] }],
    });
    expect(calls[0]!.url).toBe('https://fal.run/fal-ai/flux-pulid');
    expect(calls[0]!.body).toMatchObject({ reference_image_url: 'https://ref/laras-front.jpg', image_size: 'portrait_16_9' });
    expect(imgs[0]).toMatchObject({ url: 'https://x/1.jpg', seed: 7 });
  });

  it('fal video: submit antrean lalu status → url', async () => {
    const { f } = fakeFetch((c) => {
      if (c.url.endsWith('/status')) return json({ status: 'COMPLETED' });
      if (c.url.includes('/requests/')) return json({ video: { url: 'https://v/1.mp4' } });
      return json({ request_id: 'r1', status_url: 'https://queue.fal.run/fal-ai/kling-video/requests/r1/status', response_url: 'https://queue.fal.run/fal-ai/kling-video/requests/r1' });
    });
    const fal = new FalAdapter({ apiKey: 'k', fetch: f });
    const h = await fal.imageToVideo({ imageUrl: 'https://i', prompt: 'dolly in', durationSec: 4, aspect: '9:16', resolution: '720p' });
    expect(await fal.status(h)).toEqual({ state: 'succeeded', progress: 100, videoUrl: 'https://v/1.mp4' });
  });

  it('ElevenLabs wajib voice_id dan mengirim xi-api-key', async () => {
    const { f, calls } = fakeFetch(() => new Response(new Uint8Array(16000), { headers: { 'content-type': 'audio/mpeg' } }));
    const el = new ElevenLabsAdapter({ apiKey: 'el', fetch: f });
    const a = await el.synthesize({ text: 'Jangan dijawab.', voiceId: 'v-1' });
    expect(calls[0]!.url).toContain('/v1/text-to-speech/v-1');
    expect((calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('el');
    expect(a.durationMs).toBe(1000);
    await expect(el.synthesize({ text: 'x', voiceId: '' })).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe('SSE parser', () => {
  it('menggabungkan multi-line data dan CRLF', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode('event: x\r\ndata: a\r\ndata: b\r\n\r\n')); c.close(); } });
    const out = [];
    for await (const e of parseSSE(body)) out.push(e);
    expect(out).toEqual([{ event: 'x', data: 'a\nb' }]);
  });
});
