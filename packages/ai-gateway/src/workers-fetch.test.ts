import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsAdapter, FalAdapter, OpenCodeZenAdapter } from './index';
import { RenderClient } from '@atomo/timeline';

/**
 * Regresi: di Cloudflare Workers, fetch global yang dipanggil dengan `this` = objek lain
 * melempar "Illegal invocation". Tiru perilaku itu dan pastikan adapter tanpa opsi fetch aman.
 */
const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});
function strictFetch() {
  const f = vi.fn(function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(Response.json({ status: 'SUCCESS', output_files: {}, choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], images: [{ url: 'https://x/1.png' }] }));
  });
  globalThis.fetch = f as unknown as typeof fetch;
  return f;
}

describe('fetch global aman di Workers', () => {
  it('OpenCode, fal, ElevenLabs, dan client render tidak memanggil fetch sebagai method', async () => {
    const f = strictFetch();
    await new OpenCodeZenAdapter({ apiKey: 'k', defaultModel: 'glm-5.2' }).generate({ messages: [] });
    await new FalAdapter({ apiKey: 'k' }).generate({ prompt: 'x', aspect: '1:1' });
    await new RenderClient({ apiKey: 'k' }).status('c1');
    globalThis.fetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response(new Uint8Array(100)));
    }) as unknown as typeof fetch;
    await new ElevenLabsAdapter({ apiKey: 'k' }).synthesize({ text: 'x', voiceId: 'v' });
    expect(f).toHaveBeenCalledTimes(3);
  });
});
