import type { z } from 'zod';
import { ProviderError } from './errors';
import type { ScriptAI, TextRequest, TextResult } from './types';

/** Ambil blok JSON dari output LLM (buang ```json fence dan teks pengantar). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Cari objek/array terluar.
    const start = candidate.search(/[[{]/);
    if (start < 0) throw new SyntaxError('Tidak ada JSON pada output');
    const open = candidate[start]!;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (inStr) {
        if (ch === '\\') i++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) return JSON.parse(candidate.slice(start, i + 1));
    }
    throw new SyntaxError('JSON pada output terpotong');
  }
}

function describeZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

export interface StructuredResult<T> {
  data: T;
  results: TextResult[];
  repaired: boolean;
}

/**
 * Generate output terstruktur dan validasi dengan zod. Kalau gagal parse/validasi,
 * ulangi SEKALI dengan pesan error; kalau masih gagal lempar ProviderError('invalid_output')
 * supaya pemanggil menandai job gagal dan me-refund.
 */
export async function generateStructured<S extends z.ZodType>(
  ai: ScriptAI,
  req: TextRequest,
  schema: S,
): Promise<StructuredResult<z.infer<S>>> {
  const base: TextRequest & { stream: false } = { ...req, json: true, stream: false };
  const results: TextResult[] = [];
  const first = await ai.generate(base);
  results.push(first);
  let error: string;
  try {
    const parsed = schema.safeParse(extractJson(first.text));
    if (parsed.success) return { data: parsed.data, results, repaired: false };
    error = describeZodError(parsed.error);
  } catch (e) {
    error = (e as Error).message;
  }

  const second = await ai.generate({
    ...base,
    messages: [
      ...base.messages,
      { role: 'assistant', content: first.text },
      {
        role: 'user',
        content: `Output sebelumnya tidak valid:\n${error}\n\nKirim ulang HANYA JSON yang valid sesuai skema, tanpa penjelasan dan tanpa code fence.`,
      },
    ],
  });
  results.push(second);
  try {
    const parsed = schema.safeParse(extractJson(second.text));
    if (parsed.success) return { data: parsed.data, results, repaired: true };
    error = describeZodError(parsed.error);
  } catch (e) {
    error = (e as Error).message;
  }
  throw new ProviderError(`Output terstruktur tidak valid setelah 1x perbaikan:\n${error}`, ai.provider, 'invalid_output');
}
