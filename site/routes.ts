/**
 * The site's readable routes, in one place. Used by the app (URL params,
 * address-bar sync, watermark), the Pages Functions (share pages, embeds,
 * analytics) and the build (link check), so a route is only defined once.
 *
 *   /pdb/:id              PDB entry             /embed/pdb/:id
 *   /af/:accession        AlphaFold model       /embed/af/:accession
 *   /compound/:slug       curated compound      /embed/compound/:slug
 *   /compound/cid/:cid    any PubChem compound  /embed/compound/cid/:cid
 *   /s/:id                share link
 *
 * Trailing slashes are accepted everywhere; canonical paths have none.
 */
import { COMPOUND_SLUG_RE, UNIPROT_RE } from './identifiers';

export type StructureRoute =
  | { kind: 'pdb'; id: string }
  | { kind: 'af'; id: string }
  | { kind: 'compound'; slug: string }
  | { kind: 'cid'; cid: number };

export type Route =
  | { page: 'home' }
  | { page: 'structure'; structure: StructureRoute; embed: boolean }
  | { page: 'share'; id: string }
  | { page: 'other' };

/** '/pdb/4HHB/' -> '/pdb/4HHB'; '/' stays '/'. */
export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** Parse a structure path (without the /embed prefix). */
export function parseStructureRoute(pathname: string): StructureRoute | null {
  const path = normalizePath(pathname);
  let m = path.match(/^\/pdb\/([A-Za-z0-9]{4})$/);
  if (m) return { kind: 'pdb', id: m[1].toUpperCase() };

  m = path.match(/^\/af\/([A-Za-z0-9]{6,10})$/);
  if (m) {
    const id = m[1].toUpperCase();
    return UNIPROT_RE.test(id) ? { kind: 'af', id } : null;
  }

  // PubChem CIDs start at 1.
  m = path.match(/^\/compound\/cid\/([1-9]\d{0,9})$/);
  if (m) return { kind: 'cid', cid: Number(m[1]) };

  m = path.match(/^\/compound\/([a-z0-9-]{1,80})$/);
  if (m && COMPOUND_SLUG_RE.test(m[1])) return { kind: 'compound', slug: m[1] };

  return null;
}

export function parseRoute(pathname: string): Route {
  const path = normalizePath(pathname);
  if (path === '/') return { page: 'home' };
  if (path.startsWith('/embed/')) {
    const structure = parseStructureRoute(path.slice('/embed'.length));
    return structure ? { page: 'structure', structure, embed: true } : { page: 'other' };
  }
  const share = path.match(/^\/s\/([A-Za-z0-9]{8,16})$/);
  if (share) return { page: 'share', id: share[1] };
  const structure = parseStructureRoute(path);
  return structure ? { page: 'structure', structure, embed: false } : { page: 'other' };
}

/** Canonical path of a structure page, e.g. `/pdb/4HHB`. */
export function structurePath(route: StructureRoute): string {
  switch (route.kind) {
    case 'pdb':
      return `/pdb/${route.id}`;
    case 'af':
      return `/af/${route.id}`;
    case 'compound':
      return `/compound/${route.slug}`;
    case 'cid':
      return `/compound/cid/${route.cid}`;
  }
}

/** A stored structure source, loosely typed: shares and sessions may come from older versions. */
export interface SourceLike {
  type?: unknown;
  id?: unknown;
  cid?: unknown;
  slug?: unknown;
}

/**
 * Route of a structure source, or null when it has no page: local files,
 * and source types this version doesn't know.
 */
export function sourceRoute(source: SourceLike | null | undefined): StructureRoute | null {
  if (!source || typeof source !== 'object') return null;
  if (source.type === 'rcsb' && typeof source.id === 'string') return { kind: 'pdb', id: source.id };
  if (source.type === 'alphafold' && typeof source.id === 'string') return { kind: 'af', id: source.id };
  if (source.type === 'pubchem') {
    if (typeof source.slug === 'string' && source.slug) return { kind: 'compound', slug: source.slug };
    if (typeof source.cid === 'number' && source.cid > 0) return { kind: 'cid', cid: source.cid };
  }
  return null;
}
