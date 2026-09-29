/**
 * GET /api/og/:source/:id.png: legacy social image URL, still cached by
 * social networks for pages shared before cards were pre-rendered. Redirects
 * to the static card (/og/:source/:id.png) or to the site image.
 */
import { ogImageUrl } from '../../../../site/ogImages';

export const onRequestGet: PagesFunction = async ({ request, params }) => {
  const source = String(params.source ?? '');
  const id = String(params.id ?? '').replace(/\.png$/, '').toUpperCase();
  const origin = new URL(request.url).origin;
  const target = source === 'pdb' || source === 'af' ? ogImageUrl(origin, source, id) : `${origin}/og-image.png`;
  return Response.redirect(target, 301);
};
