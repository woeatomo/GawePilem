/** Parser Server-Sent Events dari ReadableStream (fetch body). Mengembalikan payload `data:` per event. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event?: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event: string | undefined;
  let data: string[] = [];
  const flush = function* () {
    if (data.length) yield { event, data: data.join('\n') };
    event = undefined;
    data = [];
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r?\n/)) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + (buf[idx] === '\r' ? 2 : 1));
        if (line === '') {
          yield* flush();
        } else if (line.startsWith(':')) {
          continue;
        } else {
          const c = line.indexOf(':');
          const field = c < 0 ? line : line.slice(0, c);
          const val = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '');
          if (field === 'data') data.push(val);
          else if (field === 'event') event = val;
        }
      }
    }
    buf += decoder.decode();
    if (buf.length && buf.startsWith('data:')) data.push(buf.slice(5).trim());
    yield* flush();
  } finally {
    reader.releaseLock();
  }
}
