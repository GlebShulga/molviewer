/**
 * Small fetch helper shared by the upstream fetchers: timeout, Cloudflare edge
 * caching and JSON parsing, returning a discriminated result instead of throwing.
 */
import type { UpstreamOptions } from './types';

export const DEFAULT_TIMEOUT_MS = 4000;

/** Cloudflare edge cache hint for upstream responses (ignored outside Workers). */
const CF_CACHE = { cacheTtl: 86400, cacheEverything: true };

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
 */
export async function getJson<T>(
  url: string,
  opts: UpstreamOptions = {}
): Promise<JsonResponse<T | null>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const init = {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: controller.signal,
    cf: CF_CACHE,
  } as RequestInit & { cf?: unknown };

  try {
    const resp = await fetchImpl(url, init);
    if (!resp.ok) {
      return { ok: false, status: resp.status, message: `HTTP ${resp.status} from ${hostOf(url)}` };
    }
    const text = await resp.text();
    if (!text.trim()) return { ok: true, status: resp.status, data: null };
    return { ok: true, status: resp.status, data: JSON.parse(text) as T };
  } catch (err) {
    const message = controller.signal.aborted
      ? `Timeout after ${timeoutMs} ms from ${hostOf(url)}`
      : `${errorName(err)} from ${hostOf(url)}`;
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

/** Build a GET URL for an RCSB GraphQL query (GET so the edge cache can store it). */
export function rcsbGraphqlUrl(query: string, variables: Record<string, unknown>): string {
  const q = query.replace(/\s+/g, ' ').trim();
  return `https://data.rcsb.org/graphql?query=${encodeURIComponent(q)}&variables=${encodeURIComponent(
    JSON.stringify(variables)
  )}`;
}

/**
 * Run an RCSB GraphQL query. GraphQL reports failures as HTTP 200 with `errors`,
 * so those are turned into `{ ok: false }` too.
 */
export async function rcsbGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  opts: UpstreamOptions
): Promise<JsonResponse<T>> {
  const resp = await getJson<{ data?: T | null; errors?: Array<{ message?: string }> }>(
    rcsbGraphqlUrl(query, variables),
    opts
  );
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
