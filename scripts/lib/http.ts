/**
 * Small shared HTTP helper for the data scripts in scripts/.
 *
 * - fetchJson / fetchText: GET (or any init) with a polite User-Agent, a timeout,
 *   and retries with exponential backoff on 429, 5xx and network errors.
 *   Other non-2xx responses throw HttpError immediately (check `.status`, e.g. 404).
 * - mapLimit: run an async function over items with at most `limit` in flight,
 *   preserving input order in the result.
 */

export const USER_AGENT = 'MolViewer-data-script (https://molviewer.bio)';

const MAX_RETRIES = 4;
const TIMEOUT_MS = 30_000;

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message?: string) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 1s, 2s, 4s, 8s plus a little jitter
      await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 250);
    }
    try {
      const headers = new Headers(init.headers);
      if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT);
      const res = await fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return res;
      if (isRetryable(res.status) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          await sleep(Math.min(retryAfter, 30) * 1000);
        }
        lastError = new HttpError(res.status, url);
        continue;
      }
      throw new HttpError(res.status, url);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // Network error or timeout: retry
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await request(url, init);
  return (await res.json()) as T;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await request(url, init);
  return res.text();
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
