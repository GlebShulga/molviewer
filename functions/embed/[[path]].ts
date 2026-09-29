/**
 * GET /embed/pdb/:id, /embed/af/:id, /embed/compound/:slug, /embed/compound/cid/:cid
 *
 * Embeddable viewer for <iframe>s: the SPA in embed mode (minimal UI, a
 * permanent "Open in MolViewer" link). The middleware allows any site to
 * frame these pages. Embeds are kept out of the index; the full page is the
 * one to rank. Unknown IDs get 404, like the landing pages; if the upstream
 * database is unreachable the embed still renders with status 200.
 */
import { isGetOrHead, shellResponse } from '../../site/render/respond';
import { embedTarget } from '../../site/embed';
import { embedTargetExists } from '../../site/embedExists';

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  const target = embedTarget(url.pathname);
  // Unknown shapes fall through to the SPA shell, which the middleware 404s.
  if (!isGetOrHead(request) || !target) return next();

  const [shell, exists] = await Promise.all([next(), embedTargetExists(target)]);
  const missing = exists === 'no';
  return shellResponse(
    request,
    shell,
    {
      title: missing ? `${target.label} not found | MolViewer` : `${target.label} in 3D | MolViewer`,
      description: `Interactive 3D view of ${target.label}, embedded with MolViewer.`,
      canonicalUrl: null,
      robots: 'noindex, follow',
      hidePageInfo: true,
    },
    missing ? 404 : 200
  );
};
