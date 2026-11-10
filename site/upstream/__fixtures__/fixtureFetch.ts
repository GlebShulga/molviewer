/**
 * Test helper: a fake `fetch` that serves recorded fixtures by URL.
 * Unknown URLs answer 404. `overrides` can force a status, a hang (timeout), a
 * delay (a slow upstream) or a network error for any fixture name.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureNameFor } from './routes';

const dir = dirname(fileURLToPath(import.meta.url));

export type Override =
  | { status: number; body?: string }
  | { hang: true }
  | { delayMs: number }
  | { networkError: true };

export interface FixtureFetch {
  fetchImpl: typeof fetch;
  /** Every URL requested, in order. */
  calls: string[];
  /** The `init` of each call, at the same index as `calls` (e.g. to read its `signal`). */
  inits: (RequestInit | undefined)[];
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

export function fixtureFetch(overrides: Record<string, Override> = {}): FixtureFetch {
  const calls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    inits.push(init);
    const name = fixtureNameFor(url) ?? 'unknown';
    const override = overrides[name];

    if (override && 'hang' in override) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()));
      });
    }
    if (override && 'delayMs' in override) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, override.delayMs);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(abortError());
        });
      });
    } else if (override && 'networkError' in override) {
      throw new TypeError('fetch failed');
    } else if (override) {
      return new Response(override.body ?? '', { status: override.status });
    }

    const path = join(dir, name);
    if (!existsSync(path)) return new Response('{"message":"not found"}', { status: 404 });
    return new Response(readFileSync(path, 'utf8'), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls, inits };
}
