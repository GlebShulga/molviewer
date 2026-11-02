/**
 * Which social preview image a page uses, with its type and size (written to
 * og:image:type/width/height, and square images switch twitter:card to
 * `summary` so X doesn't crop them to 2:1).
 *
 * - Curated PDB, AlphaFold and compound entries: cards pre-rendered at build
 *   time (site/build/ogCards.ts), 1200x630 PNG with a picture of the molecule.
 * - Other PDB entries: RCSB's prerendered assembly image, proxied by
 *   functions/api/og/[source]/[id].png.ts (500x500 JPEG; when RCSB has none,
 *   SQUARE_FALLBACK, so the announced type and size stay true).
 * - Other PubChem compounds: PubChem's 2D drawing (300x300 PNG).
 * - Everything else (other AlphaFold models): the site image.
 */
import pdbData from '../data/popularPdbs.json';
import afData from '../data/alphafold.json';
import type { AfSeed, PdbSeed } from './dataTypes';
import { cidForSlug, slugForCid } from './compoundSlugs';
import type { StructureRoute } from './routes';

export const OG_PDB_IDS = new Set((pdbData as { pdbs: PdbSeed[] }).pdbs.map((p) => p.id));
export const OG_AF_IDS = new Set((afData as { entries: AfSeed[] }).entries.map((a) => a.id));

export interface OgImage {
  url: string;
  type: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

const CARD = { type: 'image/png', width: 1200, height: 630 } as const;
const RCSB_IMAGE = { type: 'image/jpeg', width: 500, height: 500 } as const;

/** Rendered at build time (site/build/ogCards.ts), same type and size as RCSB's images. */
export const SQUARE_FALLBACK = { path: '/og/square.jpg', ...RCSB_IMAGE } as const;

export function siteOgImage(origin: string): OgImage {
  return { url: `${origin}/og-image.png`, ...CARD };
}

/** RCSB's prerendered image of the first biological assembly (500x500 JPEG). */
export function rcsbImageUrl(id: string): string {
  return `https://cdn.rcsb.org/images/structures/${id.toLowerCase()}_assembly-1.jpeg`;
}

export function compoundImageUrl(cid: number): string {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=large`;
}

export function ogImage(origin: string, target: StructureRoute): OgImage {
  switch (target.kind) {
    case 'pdb':
      return OG_PDB_IDS.has(target.id)
        ? { url: `${origin}/og/pdb/${target.id}.png`, ...CARD }
        : { url: `${origin}/api/og/pdb/${target.id}.png`, ...RCSB_IMAGE };
    case 'af':
      return OG_AF_IDS.has(target.id) ? { url: `${origin}/og/af/${target.id}.png`, ...CARD } : siteOgImage(origin);
    case 'compound':
      return cidForSlug(target.slug) !== undefined ? { url: `${origin}/og/compound/${target.slug}.png`, ...CARD } : siteOgImage(origin);
    case 'cid': {
      // A curated compound reached by CID (an old share, /embed/compound/cid/...) still gets its card.
      const slug = slugForCid(target.cid);
      if (slug) return ogImage(origin, { kind: 'compound', slug });
      return { url: compoundImageUrl(target.cid), type: 'image/png', width: 300, height: 300 };
    }
  }
}
