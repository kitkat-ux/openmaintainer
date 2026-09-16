import { ProviderError } from '@openmaintainer/shared';

/** Retry-After supports delta seconds and HTTP dates, capped by the overall deadline. */
export function retryDelay(
  value: string | null,
  attempt: number,
  now = Date.now(),
  random = Math.random(),
): number {
  if (value !== null && value.trim() !== '') {
    const seconds = /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
    const date = Date.parse(value);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : date - now;
    if (Number.isFinite(delay) && delay >= 0) return Math.min(delay, 10_000);
  }
  return 100 * 2 ** attempt + Math.floor(random * 50);
}
export async function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ProviderError('AI provider request was aborted.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
export async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new ProviderError('AI provider returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) throw new ProviderError('AI provider response exceeds the size limit.');
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ProviderError('AI provider returned invalid JSON.');
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
