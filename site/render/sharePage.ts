/**
 * /s/:id share links: metadata for the shared scene. Shares of exactly one
 * PDB or AlphaFold structure point their canonical at that structure's
 * landing page, so shared links build authority for the real page. Other
 * scenes (several structures, local files, external URLs) match no landing
 * page and are kept out of the index.
 */
import type { ShellMeta } from './shell';
import { escapeHtml } from './html';
import { renderFooter } from '../nav';
import { FEATURED_COLLECTIONS } from '../collections';
import { ogImageUrl } from '../ogImages';
import { sourceRoute, structurePath, type SourceLike, type StructureRoute } from '../routes';

/**
 * What this page needs from a stored ShareableSession. /api/share stores any
 * JSON object, so the stored value is normalized here and never trusted.
 */
export interface ShareSummary {
  structures: { name: string; route: StructureRoute | null }[];
  measurementCount: number;
}

export function summarizeShare(raw: unknown): ShareSummary {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(obj.structures) ? obj.structures : [];
  const structures = list.map((item) => {
    const s = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 80) : 'Structure';
    return { name, route: sourceRoute(s.source as SourceLike | undefined) };
  });
  return { structures, measurementCount: Array.isArray(obj.measurements) ? obj.measurements.length : 0 };
}

/** The share store couldn't be read (KV error): render neutrally, never 404. */
export const UNAVAILABLE = Symbol('share-unavailable');

export function renderShareLanding(
  id: string,
  share: unknown,
  origin: string
): { status: 200 | 404; meta: ShellMeta } {
  if (share === UNAVAILABLE) {
    return {
      status: 200,
      meta: {
        title: 'Shared 3D view | MolViewer',
        description: 'A shared MolViewer scene. Open it in 3D in your browser, no install.',
        canonicalUrl: null,
        robots: 'noindex, follow',
      },
    };
  }
  if (share === null || share === undefined) {
    return {
      status: 404,
      meta: {
        title: 'Share link not found | MolViewer',
        description: 'This share link does not exist or has expired. Shares are kept for one year.',
        canonicalUrl: null,
        robots: 'noindex, follow',
        pageInfoHtml: `<div class="page-info-inner"><h1>Share link not found</h1><p class="lead">This link does not exist or has expired (shares are kept for one year). Ask the person who shared it for a new link, or open a structure from the sidebar.</p></div>`,
      },
    };
  }

  const { structures, measurementCount } = summarizeShare(share);
  const names = structures.map((s) => s.name).slice(0, 4);
  const single = structures.length === 1 ? structures[0] : undefined;
  // Only a lone PDB entry or AlphaFold model matches a landing page closely enough for a canonical.
  const singleRoute = single?.route && (single.route.kind === 'pdb' || single.route.kind === 'af') ? single.route : null;
  const singlePath = singleRoute ? structurePath(singleRoute) : null;

  const shown = names.length ? names.join(', ') : 'an empty scene';
  const title = `Shared 3D view: ${shown}${structures.length > 4 ? ` and ${structures.length - 4} more` : ''} | MolViewer`;
  const description = `A shared MolViewer scene with ${shown}${measurementCount ? ` and ${measurementCount} measurement${measurementCount === 1 ? '' : 's'}` : ''}. Open it in 3D in your browser, no install.`;

  const list = structures
    .map((s) => {
      const path = s.route ? structurePath(s.route) : null;
      const label = escapeHtml(s.name);
      return `<li>${path ? `<a href="${escapeHtml(path)}">${label}</a>` : label}</li>`;
    })
    .join('');

  const ogImage =
    singleRoute?.kind === 'pdb' || singleRoute?.kind === 'af'
      ? ogImageUrl(origin, singleRoute.kind, singleRoute.id)
      : `${origin}/og-image.png`;

  return {
    status: 200,
    meta: {
      title,
      description,
      canonicalUrl: singlePath ? `${origin}${singlePath}` : null,
      robots: singlePath ? 'index, follow' : 'noindex, follow',
      ogImageUrl: ogImage,
      pageInfoHtml: `<div class="page-info-inner">
<h1>Shared 3D view</h1>
<p class="lead">This link restores a MolViewer scene: structures, camera, representations, measurements and labels. It contains:</p>
<ul>${list}</ul>
<p><a href="/s/${escapeHtml(id)}">Permanent link to this scene</a></p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`,
    },
  };
}
