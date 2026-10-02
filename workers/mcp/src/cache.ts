/**
 * 24-hour cache of tool results in the Workers Cache API, keyed by tool and
 * arguments. Upstream fetches are edge-cached too (site/upstream/http.ts);
 * this also skips the normalizing work and the GraphQL fan-out.
 */
import type { ToolOutcome } from './tools';

const TTL_SECONDS = 86400;
/** Bump when the shape of tool results changes. */
const CACHE_VERSION = 'v1';

function cacheStore(): Cache | undefined {
  return typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
}

export async function cachedOutcome(
  tool: string,
  args: unknown,
  fn: () => Promise<ToolOutcome>,
  waitUntil: (p: Promise<unknown>) => void
): Promise<ToolOutcome> {
  const cache = cacheStore();
  if (!cache) return fn();
  const key = new Request(
    `https://mcp-cache.molviewer.bio/${CACHE_VERSION}/${tool}?args=${encodeURIComponent(JSON.stringify(args))}`
  );
  const hit = await cache.match(key);
  if (hit) return (await hit.json()) as ToolOutcome;

  const outcome = await fn();
  if (outcome.status === 'ok' && outcome.cacheable !== false) {
    const resp = new Response(JSON.stringify(outcome), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL_SECONDS}` },
    });
    waitUntil(cache.put(key, resp));
  }
  return outcome;
}
