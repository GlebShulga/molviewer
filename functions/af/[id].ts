/**
 * GET /af/:id: landing page for an AlphaFold prediction by UniProt accession.
 * Existence is decided by AlphaFold DB, not UniProt: many UniProt entries have
 * no model, and UniProt answers obsolete accessions with 200.
 */
import { fetchAfDetails } from '../../site/upstream/af';
import { renderAfLanding } from '../../site/render/afPage';
import { isGetOrHead, shellResponse } from '../../site/render/respond';
import { SITE_ORIGIN } from '../../site/nav';
import { UNIPROT_RE } from '../../site/identifiers';

export const onRequest: PagesFunction = async ({ request, params, next }) => {
  const id = String(params.id ?? '');
  const upper = id.toUpperCase();
  if (!isGetOrHead(request) || !UNIPROT_RE.test(upper)) return next();

  if (id !== upper) {
    const url = new URL(request.url);
    url.pathname = `/af/${upper}`;
    return Response.redirect(url.toString(), 301);
  }

  const [shell, result] = await Promise.all([next(), fetchAfDetails(upper)]);
  // Canonical and social URLs always use the production origin (see pdb/[id].ts).
  const { status, meta } = renderAfLanding(upper, result, SITE_ORIGIN);
  return shellResponse(request, shell, meta, status);
};
