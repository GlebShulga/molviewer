import type { RepresentationType, ColorScheme } from '../types';

/**
 * Parsed URL parameters for molecule loading and view state.
 */
export interface UrlMoleculeParams {
  source: 'rcsb' | 'alphafold' | 'url';
  id?: string;
  url?: string;
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
 * Priority: pdb > af > url (first match wins).
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
    if (/^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/.test(trimmed)) {
      return { source: 'alphafold', id: trimmed };
    }
    return null;
  }

  const urlParam = params.get('url');
  if (urlParam) {
    try {
      const parsed = new URL(urlParam);
      if (parsed.protocol !== 'https:') return null; // HTTPS only
      return { source: 'url', url: urlParam };
    } catch {
      return null;
    }
  }

  return null;
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
 * Build a shareable URL from the current app state.
 */
export function buildShareUrl(params: {
  pdbId?: string;
  uniprotId?: string;
  externalUrl?: string;
  repr?: RepresentationType;
  color?: ColorScheme;
}): string {
  const url = new URL(window.location.origin + window.location.pathname);

  if (params.pdbId) {
    url.searchParams.set('pdb', params.pdbId);
  } else if (params.uniprotId) {
    url.searchParams.set('af', params.uniprotId);
  } else if (params.externalUrl) {
    url.searchParams.set('url', params.externalUrl);
  }

  if (params.repr) {
    url.searchParams.set('repr', params.repr);
  }
  if (params.color) {
    url.searchParams.set('color', params.color);
  }

  return url.toString();
}
