/**
 * 24-hour cache of tool results in the Workers Cache API, keyed by tool and
 * arguments. Upstream fetches are edge-cached too (site/upstream/http.ts);
 * this also skips the normalizing work and the GraphQL fan-out.
 */
import type { ToolOutcome } from './tools';
import { DENY_LIST_HASH } from './safety';

const TTL_SECONDS = 86400;
/**
 * Bump when the shape of tool results changes. Deny-list changes need no
 * bump: the key also carries DENY_LIST_HASH, so answers cached before an
 * agent was added (a compound hit, a curated slug) become unreachable.
 */
const CACHE_VERSION = 'v10';

/** Cache key for one tool call. `denyHash` is a parameter for tests. */
export function cacheKey(tool: string, args: unknown, denyHash: string = DENY_LIST_HASH): string {
  return `https://mcp-cache.molviewer.bio/${CACHE_VERSION}-${denyHash}/${tool}?args=${encodeURIComponent(JSON.stringify(args))}`;
}

function cacheStore(): Cache | undefined {
  return typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
}

/** `cached` is true when the answer came from the cache (for analytics). */
export async function cachedOutcome(
  tool: string,
  args: unknown,
  fn: () => Promise<ToolOutcome>,
  waitUntil: (p: Promise<unknown>) => void
): Promise<{ outcome: ToolOutcome; cached: boolean }> {
  const cache = cacheStore();
  if (!cache) return { outcome: await fn(), cached: false };
  const key = new Request(cacheKey(tool, args));
  const hit = await cache.match(key);
  if (hit) return { outcome: (await hit.json()) as ToolOutcome, cached: true };

  const outcome = await fn();
  if (outcome.status === 'ok' && outcome.cacheable !== false) {
    const resp = new Response(JSON.stringify(outcome), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL_SECONDS}` },
    });
    waitUntil(cache.put(key, resp));
  }
  return { outcome, cached: false };
}
