import type { RepresentationType, ColorScheme, StructureSource } from '../types';
import { UNIPROT_RE } from '../../site/identifiers';
import { parseRoute, sourceRoute, structurePath, type StructureRoute } from '../../site/routes';

/**
 * Parsed URL parameters for molecule loading and view state.
 */
export interface UrlMoleculeParams {
  source: 'rcsb' | 'alphafold' | 'share' | 'pubchem';
  id?: string;
  /** PubChem: curated compound slug (/compound/caffeine). */
  slug?: string;
  /** PubChem: compound id (/compound/cid/2519). */
  cid?: number;
  /** True for /embed/* pages (minimal UI, no URL sync). */
  embed?: boolean;
}


function toParams(route: StructureRoute): UrlMoleculeParams {
  switch (route.kind) {
    case 'pdb':
      return { source: 'rcsb', id: route.id };
    case 'af':
      return { source: 'alphafold', id: route.id };
    case 'cid':
      return { source: 'pubchem', cid: route.cid };
    case 'compound':
      return { source: 'pubchem', slug: route.slug };
  }
}

/** Pretty-URL pathnames: /pdb/:id, /af/:id, /compound/:slug, /compound/cid/:cid, /s/:id, /embed/... (site/routes.ts) */
export function parsePathnameParams(pathname: string): UrlMoleculeParams | null {
  const route = parseRoute(pathname);
  if (route.page === 'share') return { source: 'share', id: route.id };
  if (route.page !== 'structure') return null;
  const params = toParams(route.structure);
  return route.embed ? { ...params, embed: true } : params;
}

export interface UrlViewParams {
  repr?: RepresentationType;
  color?: ColorScheme;
}

const VALID_REPRESENTATIONS: RepresentationType[] = [
  'ball-and-stick', 'stick', 'spacefill', 'cartoon', 'surface-vdw', 'surface-sas',
];

const VALID_COLOR_SCHEMES: ColorScheme[] = [
  'cpk', 'chain', 'residueType', 'bfactor', 'rainbow', 'secondaryStructure',
];

/**
 * Parse molecule source from URL search params.
 * Priority: pdb > af (first match wins). Loading from arbitrary URLs is not
 * supported: the CSP only allows fetching from the structure databases.
 */
export function parseMoleculeParams(search: string): UrlMoleculeParams | null {
  const params = new URLSearchParams(search);

  const pdb = params.get('pdb');
  if (pdb) {
    const trimmed = pdb.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(trimmed)) {
      return { source: 'rcsb', id: trimmed };
    }
    return null; // invalid PDB ID
  }

  const af = params.get('af');
  if (af) {
    const trimmed = af.trim().toUpperCase();
    // Match classic 6-char and new 10-char UniProt accession formats
    if (UNIPROT_RE.test(trimmed)) {
      return { source: 'alphafold', id: trimmed };
    }
    return null;
  }

  return null;
}

/**
 * The structure the current URL asks to load at startup, or null.
 * Used both by the URL-load effect and to initialise the URL-sync state,
 * so the two can never disagree about whether a load is pending.
 */
export function getInitialUrlLoad(location: { pathname: string; search: string }): UrlMoleculeParams | null {
  return parsePathnameParams(location.pathname) ?? parseMoleculeParams(location.search);
}

/**
 * Parse view state params (repr, color) from URL.
 */
export function parseViewParams(search: string): UrlViewParams {
  const params = new URLSearchParams(search);
  const result: UrlViewParams = {};

  const repr = params.get('repr');
  if (repr && VALID_REPRESENTATIONS.includes(repr as RepresentationType)) {
    result.repr = repr as RepresentationType;
  }

  const color = params.get('color');
  if (color && VALID_COLOR_SCHEMES.includes(color as ColorScheme)) {
    result.color = color as ColorScheme;
  }

  return result;
}

/**
 * Readable address for a structure source, or null when it has none
 * (local files).
 */
export function sourceToPath(source: StructureSource | undefined | null): string | null {
  // Local files, and source types saved by older versions (e.g. external URLs), have no address.
  const route = sourceRoute(source);
  return route ? structurePath(route) : null;
}

/**
 * Build a shareable URL for one structure: its readable address plus the
 * view parameters. Always built from the origin, never from the current
 * path, so a link copied on /pdb/3DNI for an AlphaFold model opens that model.
 */
export function buildShareUrl(params: {
  source?: StructureSource | null;
  repr?: RepresentationType;
  color?: ColorScheme;
}): string {
  const path = sourceToPath(params.source) ?? '/';
  const url = new URL(path, window.location.origin);

  if (params.repr) {
    url.searchParams.set('repr', params.repr);
  }
  if (params.color) {
    url.searchParams.set('color', params.color);
  }

  return url.toString();
}
