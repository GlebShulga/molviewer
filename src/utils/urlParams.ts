import type { RepresentationType, ColorScheme, StructureSource } from '../types';
import type { CameraSnapshot } from '../types/session';
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
  /** Camera from `?view=px,py,pz,tx,ty,tz[,zoom]` (Copy Link). */
  camera?: CameraSnapshot;
}

/** Coordinates beyond this (in Å) are junk, not a real view. */
const MAX_VIEW_COORD = 1e5;
const MAX_VIEW_ZOOM = 100;

/** `view` value for a camera: 2 decimals, zoom left out when it is 1. */
export function formatViewParam(camera: CameraSnapshot): string {
  const values = [...camera.position, ...camera.target];
  if (camera.zoom !== 1) values.push(camera.zoom);
  return values.map((v) => String(Number(v.toFixed(2)))).join(',');
}

/** Parse a `view` value: 6 or 7 finite numbers within sane bounds, else null. */
export function parseViewParam(value: string | null): CameraSnapshot | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 6 && parts.length !== 7) return null;
  const n = parts.map((p) => (p.trim() === '' ? NaN : Number(p)));
  if (!n.every((v) => Number.isFinite(v))) return null;
  if (n.slice(0, 6).some((v) => Math.abs(v) > MAX_VIEW_COORD)) return null;
  const zoom = parts.length === 7 ? n[6] : 1;
  if (zoom <= 0 || zoom > MAX_VIEW_ZOOM) return null;
  const position: [number, number, number] = [n[0], n[1], n[2]];
  const target: [number, number, number] = [n[3], n[4], n[5]];
  // A camera sitting on its target has no direction to look in.
  if (position.every((v, i) => v === target[i])) return null;
  return { position, target, zoom };
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
 * Parse view state params (repr, color, view) from URL.
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

  const camera = parseViewParam(params.get('view'));
  if (camera) result.camera = camera;

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
  /** Only meaningful for an addressable source (ignored for local files). */
  camera?: CameraSnapshot | null;
}): string {
  const path = sourceToPath(params.source) ?? '/';
  const url = new URL(path, window.location.origin);

  if (params.repr) {
    url.searchParams.set('repr', params.repr);
  }
  if (params.color) {
    url.searchParams.set('color', params.color);
  }
  if (params.camera && path !== '/') {
    url.searchParams.set('view', formatViewParam(params.camera));
  }

  // Keep the commas in ?view= readable (URLSearchParams writes %2C); no other parameter has one.
  return url.toString().replace(/%2C/g, ',');
}
