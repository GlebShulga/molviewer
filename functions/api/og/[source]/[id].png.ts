/**
 * GET /api/og/:source/:id.png — Open Graph preview image for landing pages.
 *
 * v1: returns the static /og-image.png as-is, with long cache headers and
 * a per-source/id cache key. Per-structure text overlays (Photon / SVG)
 * are deferred until Search Console shows traction on long-tail pages —
 * the plan explicitly trades this off to keep bundle size small.
 */

const VALID_SOURCES = new Set(['pdb', 'af']);
const ID_RE = /^[A-Za-z0-9]{1,10}$/;
const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days

export const onRequestGet: PagesFunction = async ({ request, params, env }) => {
  const source = String(params.source ?? '');
  const idWithExt = String(params.id ?? '');
  const id = idWithExt.replace(/\.png$/, '');

  if (!VALID_SOURCES.has(source) || !ID_RE.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/api/og/${source}/${id}.png`, request);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Fetch the static template image bundled with the site.
  const templateResp = await fetch(`${url.origin}/og-image.png`, {
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
  });
  if (!templateResp.ok) {
    return new Response('OG template missing', { status: 502 });
  }

  // Re-emit with explicit cache headers so the browser/Cloudflare cache it
  // under the per-id key. Once Photon overlay is added, the template fetch
  // becomes the input to the rewrite step here instead of the response body.
  const buffer = await templateResp.arrayBuffer();
  const response = new Response(buffer, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
    },
  });

  // Suppress unused-var warning for env (kept for future signature compatibility).
  void env;

  await cache.put(cacheKey, response.clone());
  return response;
};
