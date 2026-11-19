import { z } from 'zod';
import { errorFromStatus, ProviderError, toProviderError } from '../errors';
import { findModel, type TextEndpoint } from '../models';
import { parseSSE } from '../sse';
import type { ChatMessage, ScriptAI, TextRequest, TextResult, TextStream, TokenUsage } from '../types';

export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

export interface OpenCodeOptions {
  apiKey: string;
  defaultModel: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Override endpoint per model (dari config/DB). */
  endpoints?: Record<string, TextEndpoint>;
}

const chatResponse = z.object({
  model: z.string().optional(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullable().optional() }))
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).partial().optional(),
});
const chatChunk = z.object({
  model: z.string().optional(),
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullable().optional() }).partial(), finish_reason: z.string().nullable().optional() }))
    .optional(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).partial().nullable().optional(),
});
const responsesResponse = z.object({
  model: z.string().optional(),
  status: z.string().optional(),
  output_text: z.string().optional(),
  output: z
    .array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() }))
    .optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).partial().optional(),
});
const messagesResponse = z.object({
  model: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).partial().optional(),
});

function splitSystem(messages: ChatMessage[]) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  return { system, rest: messages.filter((m) => m.role !== 'system') };
}

/** Adapter teks OpenCode Zen (OpenAI-compatible) dengan dukungan /chat/completions, /responses, /messages. */
export class OpenCodeZenAdapter implements ScriptAI {
  readonly provider = 'opencode';
  private readonly baseUrl: string;
  private readonly f: typeof fetch;

  constructor(private readonly opts: OpenCodeOptions) {
    if (!opts.apiKey) throw new ProviderError('API key OpenCode Zen kosong', 'opencode', 'auth');
    this.baseUrl = (opts.baseUrl ?? OPENCODE_ZEN_BASE_URL).replace(/\/$/, '');
    // Bungkus fetch global: di Cloudflare Workers, fetch yang dipanggil sebagai method objek lain gagal ("Illegal invocation").
    this.f = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  endpointFor(model: string): TextEndpoint {
    return this.opts.endpoints?.[model] ?? findModel(model)?.endpoint ?? 'chat';
  }

  generate(req: TextRequest & { stream: true }): TextStream;
  generate(req: TextRequest & { stream?: false }): Promise<TextResult>;
  generate(req: TextRequest): TextStream | Promise<TextResult>;
  generate(req: TextRequest): TextStream | Promise<TextResult> {
    return req.stream ? this.stream(req) : this.complete(req);
  }

  private buildBody(req: TextRequest, model: string, endpoint: TextEndpoint, stream: boolean): Record<string, unknown> {
    const maxTokens = req.maxTokens ?? 4096;
    if (endpoint === 'messages') {
      const { system, rest } = splitSystem(req.messages);
      return {
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        stream,
      };
    }
    if (endpoint === 'responses') {
      const { system, rest } = splitSystem(req.messages);
      return {
        model,
        ...(system ? { instructions: system } : {}),
        input: rest.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: maxTokens,
        ...(req.json ? { text: { format: { type: 'json_object' } } } : {}),
        stream,
      };
    }
    const info = findModel(model);
    return {
      model,
      messages: req.messages,
      max_tokens: maxTokens,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.json && info?.supportsJsonMode !== false ? { response_format: { type: 'json_object' } } : {}),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    };
  }

  private async post(endpoint: TextEndpoint, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const path = endpoint === 'chat' ? '/chat/completions' : endpoint === 'responses' ? '/responses' : '/messages';
    const timeout = AbortSignal.timeout(this.opts.timeoutMs ?? 120_000);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.opts.apiKey}`,
    };
    if (endpoint === 'messages') {
      headers['x-api-key'] = this.opts.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }
    let res: Response;
    try {
      res = await this.f(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (e) {
      throw toProviderError(this.provider, e);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw errorFromStatus(this.provider, res.status, text, res.headers.get('retry-after'));
    }
    return res;
  }

  private async complete(req: TextRequest): Promise<TextResult> {
    const model = req.model ?? this.opts.defaultModel;
    const endpoint = this.endpointFor(model);
    const res = await this.post(endpoint, this.buildBody(req, model, endpoint, false), req.signal);
    const json: unknown = await res.json().catch(() => {
      throw new ProviderError('Respons bukan JSON', this.provider, 'unknown');
    });
    try {
      if (endpoint === 'messages') {
        const r = messagesResponse.parse(json);
        return {
          text: r.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''),
          model: r.model ?? model,
          usage: { inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 },
          finishReason: r.stop_reason ?? 'stop',
        };
      }
      if (endpoint === 'responses') {
        const r = responsesResponse.parse(json);
        const text =
          r.output_text ??
          (r.output ?? [])
            .flatMap((o) => o.content ?? [])
            .filter((c) => c.type === 'output_text')
            .map((c) => c.text ?? '')
            .join('');
        return {
          text,
          model: r.model ?? model,
          usage: { inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 },
          finishReason: r.status ?? 'completed',
        };
      }
      const r = chatResponse.parse(json);
      const choice = r.choices[0]!;
      if (choice.finish_reason === 'content_filter')
        throw new ProviderError('Output difilter provider', this.provider, 'content_filtered');
      return {
        text: choice.message.content ?? '',
        model: r.model ?? model,
        usage: { inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0 },
        finishReason: choice.finish_reason ?? 'stop',
      };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(`Format respons tak terduga: ${(e as Error).message}`, this.provider, 'unknown');
    }
  }

  private stream(req: TextRequest): TextStream {
    const model = req.model ?? this.opts.defaultModel;
    const endpoint = this.endpointFor(model);
    let resolveFinal!: (r: TextResult) => void;
    let rejectFinal!: (e: unknown) => void;
    const finalP = new Promise<TextResult>((res, rej) => {
      resolveFinal = res;
      rejectFinal = rej;
    });
    finalP.catch(() => undefined); // hindari unhandled rejection bila final() tak dipanggil
    const self = this;

    async function* run(): AsyncGenerator<string> {
      let text = '';
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      let finishReason = 'stop';
      let servedModel = model;
      try {
        const res = await self.post(endpoint, self.buildBody(req, model, endpoint, true), req.signal);
        if (!res.body) throw new ProviderError('Stream kosong', self.provider, 'unknown');
        for await (const ev of parseSSE(res.body)) {
          if (ev.data === '[DONE]') break;
          let payload: unknown;
          try {
            payload = JSON.parse(ev.data);
          } catch {
            continue;
          }
          let delta = '';
          if (endpoint === 'chat') {
            const c = chatChunk.safeParse(payload);
            if (!c.success) continue;
            servedModel = c.data.model ?? servedModel;
            const ch = c.data.choices?.[0];
            delta = ch?.delta?.content ?? '';
            if (ch?.finish_reason) finishReason = ch.finish_reason;
            if (c.data.usage) {
              usage.inputTokens = c.data.usage.prompt_tokens ?? usage.inputTokens;
              usage.outputTokens = c.data.usage.completion_tokens ?? usage.outputTokens;
            }
          } else if (endpoint === 'messages') {
            const p = payload as { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; usage?: { output_tokens?: number }; message?: { usage?: { input_tokens?: number } } };
            if (p.type === 'content_block_delta' && p.delta?.type === 'text_delta') delta = p.delta.text ?? '';
            if (p.type === 'message_start') usage.inputTokens = p.message?.usage?.input_tokens ?? 0;
            if (p.type === 'message_delta') {
              usage.outputTokens = p.usage?.output_tokens ?? usage.outputTokens;
              finishReason = p.delta?.stop_reason ?? finishReason;
            }
          } else {
            const p = payload as { type?: string; delta?: string; response?: { usage?: { input_tokens?: number; output_tokens?: number }; status?: string } };
            if (p.type === 'response.output_text.delta') delta = p.delta ?? '';
            if (p.type === 'response.completed') {
              usage.inputTokens = p.response?.usage?.input_tokens ?? 0;
              usage.outputTokens = p.response?.usage?.output_tokens ?? 0;
              finishReason = p.response?.status ?? 'completed';
            }
          }
          if (delta) {
            text += delta;
            yield delta;
          }
        }
        if (finishReason === 'content_filter') throw new ProviderError('Output difilter provider', self.provider, 'content_filtered');
        resolveFinal({ text, model: servedModel, usage, finishReason });
      } catch (e) {
        const err = toProviderError(self.provider, e);
        rejectFinal(err);
        throw err;
      }
    }

    const gen = run();
    return {
      [Symbol.asyncIterator]: () => gen,
      final: async () => {
        // Kalau konsumen belum mengiterasi, habiskan stream sendiri.
        for await (const _ of gen) void _;
        return finalP;
      },
    };
  }
}
