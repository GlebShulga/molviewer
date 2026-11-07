/**
 * GET /api/og/:source/:id.png: social image for structures without a
 * pre-rendered card.
 * - Curated PDB and AlphaFold entries 301 to their static card
 *   (/og/:source/:id.png). Social networks still cache this URL for pages
 *   shared before cards were pre-rendered.
 * - Other PDB entries stream RCSB's prerendered assembly image (500x500 JPEG),
 *   cached at the edge. This is I/O only, far below the Functions CPU limit.
 *   On an RCSB miss or timeout they redirect to SQUARE_FALLBACK, also a
 *   500x500 JPEG, because their pages announce that type and size.
 * - Anything else redirects to the site image.
 * Fallbacks are 302, so a later image can still replace them.
 *
 * The page's og:image:type/width/height come from site/ogImages.ts.
 */
import { OG_AF_IDS, OG_PDB_IDS, rcsbImageUrl, SQUARE_FALLBACK } from '../../../../site/ogImages';
import { PDB_ID_RE } from '../../../../site/identifiers';
import { USER_AGENT } from '../../../../site/upstream/http';

const TIMEOUT_MS = 4000;
const MAX_AGE = 7 * 86400;

export const onRequestGet: PagesFunction = async ({ request, params }) => {
  const source = String(params.source ?? '');
  const id = String(params.id ?? '').replace(/\.png$/, '').toUpperCase();
  const origin = new URL(request.url).origin;

  // Curated IDs are checked here, never through ogImage(): for other PDB IDs
  // that returns this very URL.
  if ((source === 'pdb' && OG_PDB_IDS.has(id)) || (source === 'af' && OG_AF_IDS.has(id))) {
    return Response.redirect(`${origin}/og/${source}/${id}.png`, 301);
  }
  if (source !== 'pdb' || !PDB_ID_RE.test(id)) return Response.redirect(`${origin}/og-image.png`, 302);
  const square = () => Response.redirect(`${origin}${SQUARE_FALLBACK.path}`, 302);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(rcsbImageUrl(id), {
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal,
      cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 30 * 86400, '404': 3600, '500-599': -1 } },
    } as RequestInit & { cf?: unknown });
    if (!upstream.ok || !upstream.body || !(upstream.headers.get('content-type') ?? '').startsWith('image/jpeg')) {
      // Release the connection: the body is never read.
      await upstream.body?.cancel();
      return square();
    }
    return new Response(upstream.body, {
      headers: { 'content-type': 'image/jpeg', 'cache-control': `public, max-age=${MAX_AGE}` },
    });
  } catch {
    return square();
  } finally {
    // Only the wait for the response headers is bounded; the body streams on.
    clearTimeout(timer);
  }
};

// Pages picks the handler by the original method: although functions/_middleware.ts
// passes HEAD on as a GET, without this a HEAD request (crawlers checking the image) 404s.
export const onRequestHead = onRequestGet;
