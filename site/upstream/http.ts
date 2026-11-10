/**
 * Small fetch helper shared by the upstream fetchers: timeout, Cloudflare edge
 * caching and JSON parsing, returning a discriminated result instead of throwing.
 * An edge-cached request that times out can finish in the background (see
 * `getJson`), so a slow upstream answer is cached for the next request.
 */
import type { UpstreamOptions } from './types';

export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * The hard limit on a request, background included: it is aborted
 * `max(timeoutMs, BACKGROUND_LIMIT_MS)` after it started. Kept under the 30 s
 * Workers allow for `waitUntil`, as long as `timeoutMs` stays under it too
 * (no caller passes more than the default 4 s).
 */
export const BACKGROUND_LIMIT_MS = 25_000;

/**
 * Cloudflare edge cache policy for upstream responses (ignored outside
 * Workers). Successes for a day, "not found" for an hour; anything else is
 * never cached (a negative TTL means "don't cache"; 0 would cache and expire
 * at once), so a transient error or AlphaFold's 422 isn't served for a day.
 */
const DEFAULT_CF = {
  cacheEverything: true,
  cacheTtlByStatus: { '200-299': 86400, '404': 3600, '400-403': -1, '405-499': -1, '500-599': -1 },
};

/** Seconds a successful RCSB GraphQL answer stays in the Workers cache. */
const GRAPHQL_TTL_SECONDS = 86400;

/**
 * Explicit User-Agent: the AlphaFold API answers 403 to requests with no User-Agent
 * (the Workers default) or a generic one such as "node".
 */
export const USER_AGENT = 'MolViewer/1.0 (+https://molviewer.bio)';

export type JsonResponse<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status?: number; message: string };

/**
 * GET a JSON document with a timeout. Never throws.
 * - HTTP errors return `{ ok: false, status }` (callers decide whether 404 means "not found").
 * - A 204 or empty body returns `{ ok: true, data: null }`.
 * - Timeouts, network errors and invalid JSON return `{ ok: false }` without `status`.
 *
 * On a timeout the caller gets the failure at once, and an HTTP error is
 * answered as soon as its status arrives. With `opts.waitUntil` and edge
 * caching on, the request is read to the end in the background (an unfinished
 * one after a timeout, a 404's body) so Cloudflare caches the answer, which it
 * only does for a body that is read. Otherwise a timed-out request is aborted
 * and an error's body cancelled. Either way the request is
 * aborted at the hard limit (see `BACKGROUND_LIMIT_MS`).
 */
export async function getJson<T>(
  url: string,
  opts: UpstreamOptions = {}
): Promise<JsonResponse<T | null>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const cf = opts.cf === undefined ? DEFAULT_CF : opts.cf;
  const host = hostOf(url);
  const init = {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: controller.signal,
    ...(cf ? { cf } : {}),
  } as RequestInit & { cf?: unknown };

  // The one rule for the background: only an edge-cached request has a reason to
  // finish (without `cf` there is nothing to cache), and only `waitUntil` keeps it alive.
  const waitUntil = cf ? opts.waitUntil : undefined;
  // The hard limit covers the whole request, background included. `Math.max`
  // keeps it from ever cutting a request off before its own timeout.
  const hard = setTimeout(() => controller.abort(), Math.max(timeoutMs, BACKGROUND_LIMIT_MS));

  // What the caller gets: for an HTTP error the status alone, without waiting
  // for the body. Never rejects: every failure becomes `{ ok: false }`.
  let resp: Response | undefined;
  const answer = (async (): Promise<JsonResponse<T | null>> => {
    try {
      resp = await fetchImpl(url, init);
      if (!resp.ok) return { ok: false, status: resp.status, message: `HTTP ${resp.status} from ${host}` };
      const text = await resp.text();
      if (!text.trim()) return { ok: true, status: resp.status, data: null };
      return { ok: true, status: resp.status, data: JSON.parse(text) as T };
    } catch (err) {
      const message = controller.signal.aborted
        ? `Timeout after ${timeoutMs} ms from ${host}`
        : `${errorName(err)} from ${host}`;
      return { ok: false, message };
    }
  })();

  // The answer, then whatever of the body is left (only an error's). The edge
  // cache only stores a body that is read, and of the error statuses it only
  // keeps 404 (DEFAULT_CF), so a 404's body is read in the background; any
  // other is cancelled to free the connection. Resolves to the same result as
  // `answer` and never rejects.
  const done = answer
    .then(async (result) => {
      if (resp && !resp.bodyUsed) {
        if (waitUntil && resp.status === 404) await resp.arrayBuffer();
        else await resp.body?.cancel();
      }
      return result;
    })
    .catch(() => answer)
    .finally(() => clearTimeout(hard));
  // Handed over once, whoever wins the race below; a settled promise costs nothing.
  waitUntil?.(done);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = await Promise.race([answer, timeout]);
  if (result) {
    clearTimeout(timer);
    return result;
  }
  if (!waitUntil) controller.abort();
  return { ok: false, message: `Timeout after ${timeoutMs} ms from ${host}` };
}

/** Build a GET URL for an RCSB GraphQL query (GET so the edge cache can store it). */
export function rcsbGraphqlUrl(query: string, variables: Record<string, unknown>): string {
  const q = query.replace(/\s+/g, ' ').trim();
  return `https://data.rcsb.org/graphql?query=${encodeURIComponent(q)}&variables=${encodeURIComponent(
    JSON.stringify(variables)
  )}`;
}

/** The Workers cache, when running in a Worker or Pages Function (browsers have `caches` without `default`). */
function workersCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

/**
 * Run an RCSB GraphQL query. GraphQL reports failures as HTTP 200 with `errors`,
 * so those are turned into `{ ok: false }` too.
 *
 * The edge cache can't tell those failures from answers, so the request
 * goes out without `cf` caching, and only answers without `errors` are
 * kept in the Workers cache (a day).
 */
export async function rcsbGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  opts: UpstreamOptions
): Promise<JsonResponse<T>> {
  const url = rcsbGraphqlUrl(query, variables);
  const cache = workersCache();
  if (cache) {
    const hit = await cache.match(new Request(url)).catch(() => undefined);
    if (hit) {
      const data = (await hit.json().catch(() => null)) as T | null;
      if (data) return { ok: true, status: 200, data };
    }
  }

  const resp = await getJson<{ data?: T | null; errors?: Array<{ message?: string }> }>(url, { ...opts, cf: null });
  if (!resp.ok) return resp;
  const body = resp.data;
  if (!body || body.errors?.length || !body.data) {
    const detail = body?.errors?.[0]?.message ?? 'empty response';
    return {
      ok: false,
      status: resp.status,
      message: `GraphQL error from data.rcsb.org: ${detail}`,
    };
  }
  if (cache) {
    const stored = new Response(JSON.stringify(body.data), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${GRAPHQL_TTL_SECONDS}` },
    });
    await cache.put(new Request(url), stored).catch(() => {});
  }
  return { ok: true, status: resp.status, data: body.data };
}

/** `2024-10-23T00:00:00.000+00:00` to `2024-10-23`. */
export function isoDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const m = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return m ? m[0] : undefined;
}

/** Keep only finite numbers. */
export function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Keep only non-empty strings, trimmed. */
export function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t && t !== '?' ? t : undefined;
}

export function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function errorName(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return 'Network error';
}
