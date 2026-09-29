/**
 * Embed routes and snippets, shared by the /embed Function, the /oembed
 * endpoint and the Share dialog's "Embed" tab.
 */
import { parseRoute, structurePath, type StructureRoute } from './routes';

export interface EmbedTarget {
  /** What the embed shows: a PDB entry, an AlphaFold model, a curated compound slug or any PubChem CID. */
  kind: 'pdb' | 'af' | 'compound' | 'cid';
  /** PDB ID, UniProt accession, compound slug or CID (as text). */
  key: string;
  /** Path of the full page, e.g. `/pdb/4HHB`. */
  pagePath: string;
  /** Path of the embed, e.g. `/embed/pdb/4HHB`. */
  embedPath: string;
  /** Human label, e.g. "PDB 4HHB". */
  label: string;
}

function labelFor(route: StructureRoute): string {
  switch (route.kind) {
    case 'pdb':
      return `PDB ${route.id}`;
    case 'af':
      return `AlphaFold ${route.id}`;
    case 'cid':
      return `PubChem CID ${route.cid}`;
    case 'compound': {
      const words = route.slug.replace(/-/g, ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

/** Parse a full-page or embed path into its embed target, or null (routes: site/routes.ts). */
export function embedTarget(pathname: string): EmbedTarget | null {
  const route = parseRoute(pathname);
  if (route.page !== 'structure') return null;
  const s = route.structure;
  const pagePath = structurePath(s);
  const key = s.kind === 'pdb' || s.kind === 'af' ? s.id : s.kind === 'cid' ? String(s.cid) : s.slug;
  return { kind: s.kind, key, pagePath, embedPath: `/embed${pagePath}`, label: labelFor(s) };
}

/**
 * A size from oEmbed's maxwidth/maxheight: a positive integer, or `fallback`
 * when missing or invalid (negative, zero, NaN). Never raised: the oEmbed
 * spec requires responses to respect the consumer's maximum, however small.
 */
export function embedSize(value: string | null, fallback: number): number {
  const n = Math.floor(Number(value));
  return value !== null && Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface EmbedOptions {
  repr?: string;
  color?: string;
  spin?: boolean;
  bg?: 'dark' | 'light';
  width?: number | string;
  height?: number;
}

/** Full embed URL with view parameters. */
export function embedUrl(origin: string, target: EmbedTarget, opts: EmbedOptions = {}): string {
  const url = new URL(target.embedPath, origin);
  if (opts.repr) url.searchParams.set('repr', opts.repr);
  if (opts.color) url.searchParams.set('color', opts.color);
  if (opts.spin) url.searchParams.set('spin', '1');
  if (opts.bg && opts.bg !== 'dark') url.searchParams.set('bg', opts.bg);
  return url.toString();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** The <iframe> snippet people paste into their pages. */
export function embedSnippet(origin: string, target: EmbedTarget, opts: EmbedOptions = {}): string {
  const width = opts.width ?? '100%';
  const height = opts.height ?? 480;
  return `<iframe src="${escapeAttr(embedUrl(origin, target, opts))}" width="${escapeAttr(String(width))}" height="${height}" style="border:0;border-radius:8px" allow="fullscreen" loading="lazy" title="${escapeAttr(`${target.label} in 3D, MolViewer`)}"></iframe>`;
}
