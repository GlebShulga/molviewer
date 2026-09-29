/**
 * GET /compound/cid/:cid: any PubChem compound by CID (the address the app
 * uses after a free-text PubChem search).
 * - Curated compounds 301 to their /compound/:slug page.
 * - Other CIDs render the viewer with a short summary, kept out of the index
 *   (only the curated pages are meant to rank).
 * - CIDs PubChem doesn't know get 404 + noindex. If PubChem is slow or down
 *   (4 s timeout), the page still renders with status 200.
 */
import { slugForCid } from '../../../site/compoundSlugs';
import { fetchPubchemSummary } from '../../../site/upstream/pubchem';
import { isGetOrHead, shellResponse } from '../../../site/render/respond';
import { escapeHtml } from '../../../site/render/html';
import { renderFooter } from '../../../site/nav';

export const onRequest: PagesFunction = async ({ request, params, next }) => {
  const raw = String(params.cid ?? '');
  if (!isGetOrHead(request) || !/^[1-9]\d{0,9}$/.test(raw)) return next();
  const cid = Number(raw);

  const slug = slugForCid(cid);
  if (slug) {
    const url = new URL(request.url);
    url.pathname = `/compound/${slug}`;
    return Response.redirect(url.toString(), 301);
  }

  const [shell, result] = await Promise.all([next(), fetchPubchemSummary(cid)]);

  if (result.status === 'not-found') {
    return shellResponse(
      request,
      shell,
      {
        title: `PubChem CID ${cid} not found | MolViewer`,
        description: `PubChem has no compound with CID ${cid}.`,
        canonicalUrl: null,
        robots: 'noindex, follow',
        pageInfoHtml: `<div class="page-info-inner"><h1>PubChem CID ${cid} not found</h1><p class="lead">PubChem has no compound with this ID. Search by name in the PubChem box in the sidebar, or browse <a href="/compounds">small molecules</a>.</p></div>${renderFooter()}`,
      },
      404
    );
  }

  const props = result.status === 'ok' ? result.data : undefined;
  const name = props?.title ?? `PubChem CID ${cid}`;
  const formula = props?.formula ? ` (${props.formula})` : '';
  return shellResponse(request, shell, {
    title: `${name}${formula} in 3D | MolViewer`,
    description: `Interactive 3D model of ${name}${formula} from PubChem. Rotate it and measure bond lengths and angles, free in your browser.`,
    canonicalUrl: null,
    robots: 'noindex, follow',
    pageInfoHtml: `<div class="page-info-inner"><h1>${escapeHtml(name)} in 3D</h1><p class="lead">PubChem compound CID ${cid}${escapeHtml(formula)}. <a href="https://pubchem.ncbi.nlm.nih.gov/compound/${cid}" rel="noopener">View on PubChem</a>.</p><p><a class="more" href="/compounds">Browse curated small molecules</a></p></div>${renderFooter()}`,
  });
};
