/**
 * GET /pdb/:id: landing page for an RCSB PDB entry.
 * Fetches entry details (site/upstream/pdb.ts), renders the visible text and
 * metadata (site/render/pdbPage.ts) into the SPA shell. The SPA then loads the
 * structure from the pathname. Unknown IDs get 404 + noindex; if RCSB is
 * unreachable the page still renders with defaults and status 200.
 */
import { fetchPdbDetails } from '../../site/upstream/pdb';
import { renderPdbLanding } from '../../site/render/pdbPage';
import { isGetOrHead, shellResponse } from '../../site/render/respond';
import { SITE_ORIGIN } from '../../site/nav';
import { PDB_ID_RE } from '../../site/identifiers';

export const onRequest: PagesFunction = async ({ request, params, next }) => {
  const id = String(params.id ?? '');
  if (!isGetOrHead(request) || !PDB_ID_RE.test(id)) return next();

  // Canonicalize to uppercase via 301 so Search Console doesn't flag the
  // lowercase variant as "Page with redirect" via canonical mismatch.
  const upper = id.toUpperCase();
  if (id !== upper) {
    const url = new URL(request.url);
    url.pathname = `/pdb/${upper}`;
    return Response.redirect(url.toString(), 301);
  }

  const [shell, result] = await Promise.all([next(), fetchPdbDetails(upper)]);
  // Canonical and social URLs always use the production origin, so preview
  // hosts (*.pages.dev) never compete with molviewer.bio.
  const { status, meta } = renderPdbLanding(upper, result, SITE_ORIGIN);
  return shellResponse(request, shell, meta, status);
};
