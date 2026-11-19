import { errorFromStatus, toProviderError } from '../errors';

export async function request(
  provider: string,
  f: typeof fetch,
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeout = AbortSignal.timeout(init.timeoutMs ?? 60_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await f(url, { ...init, signal });
  } catch (e) {
    throw toProviderError(provider, e);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw errorFromStatus(provider, res.status, text, res.headers.get('retry-after'));
  }
  return res;
}
