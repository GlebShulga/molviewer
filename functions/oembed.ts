/**
 * GET /oembed?url=https://molviewer.bio/pdb/4HHB[&maxwidth=&maxheight=&format=json]
 *
 * oEmbed provider (https://oembed.com) so WordPress, Notion, Medium and
 * others turn a pasted MolViewer link into an interactive viewer. Landing
 * pages advertise it with <link rel="alternate" type="application/json+oembed">.
 */
import { embedSize, embedSnippet, embedTarget } from '../site/embed';
import { embedTargetExists } from '../site/embedExists';
import { ogImage, siteOgImage } from '../site/ogImages';
import { parseStructureRoute } from '../site/routes';

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

/** A day, except where a later request may get another answer. */
const MAX_AGE = 86400;
/** An ID the upstream doesn't know yet may be released any time (new PDB entries). */
const NOT_FOUND_MAX_AGE = 300;

function json(status: number, body: unknown, maxAge = MAX_AGE): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': `public, max-age=${maxAge}`,
    },
  });
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const reqUrl = new URL(request.url);
  const format = reqUrl.searchParams.get('format') ?? 'json';
  if (format !== 'json') return new Response('Only format=json is supported', { status: 501 });

  let target;
  try {
    const pageUrl = new URL(reqUrl.searchParams.get('url') ?? '');
    const sameSite = pageUrl.host === reqUrl.host || pageUrl.host === 'molviewer.bio';
    target = sameSite ? embedTarget(pageUrl.pathname) : null;
  } catch {
    target = null;
  }
  if (!target) return json(404, { error: 'Not an embeddable MolViewer URL' });
  // Don't hand out an embed for an ID that doesn't exist (unreachable upstream: allow it).
  if ((await embedTargetExists(target)) === 'no') {
    return json(404, { error: `${target.label} not found` }, NOT_FOUND_MAX_AGE);
  }

  const width = Math.min(DEFAULT_WIDTH, embedSize(reqUrl.searchParams.get('maxwidth'), DEFAULT_WIDTH));
  const height = Math.min(Math.round(width * 0.6), embedSize(reqUrl.searchParams.get('maxheight'), DEFAULT_HEIGHT));

  const route = parseStructureRoute(target.pagePath);
  const thumb = route ? ogImage(reqUrl.origin, route) : siteOgImage(reqUrl.origin);

  return json(200, {
    version: '1.0',
    type: 'rich',
    provider_name: 'MolViewer',
    provider_url: 'https://molviewer.bio',
    title: `${target.label} in 3D`,
    width,
    height,
    html: embedSnippet(reqUrl.origin, target, { width, height }),
    thumbnail_url: thumb.url,
    thumbnail_width: thumb.width,
    thumbnail_height: thumb.height,
  });
};
