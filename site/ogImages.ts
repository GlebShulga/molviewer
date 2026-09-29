/**
 * Which social preview image a page uses. Cards are pre-rendered at build
 * time (site/build/ogCards.ts) for the curated PDB and AlphaFold entries;
 * everything else uses the site image. Compounds use PubChem's 2D drawing.
 */
import pdbData from '../data/popularPdbs.json';
import afData from '../data/alphafold.json';
import type { AfSeed, PdbSeed } from './dataTypes';

export const OG_PDB_IDS = new Set((pdbData as { pdbs: PdbSeed[] }).pdbs.map((p) => p.id));
export const OG_AF_IDS = new Set((afData as { entries: AfSeed[] }).entries.map((a) => a.id));

export function ogImageUrl(origin: string, kind: 'pdb' | 'af', id: string): string {
  const has = kind === 'pdb' ? OG_PDB_IDS.has(id) : OG_AF_IDS.has(id);
  return has ? `${origin}/og/${kind}/${id}.png` : `${origin}/og-image.png`;
}

export function compoundImageUrl(cid: number): string {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=large`;
}
