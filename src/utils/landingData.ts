/**
 * Reads the structure summary that landing pages embed as
 * <script type="application/json" id="landing-data"> (see site/render/shell.ts).
 */
import { LANDING_DATA_ELEMENT_ID, type LandingData } from '../../site/landingData';
import type { StructureSource } from '../types';

export type { LandingData };

let cached: LandingData | null | undefined;

export function getLandingData(): LandingData | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (typeof document === 'undefined') return cached;
  const el = document.getElementById(LANDING_DATA_ELEMENT_ID);
  if (!el?.textContent) return cached;
  try {
    cached = JSON.parse(el.textContent) as LandingData;
  } catch {
    cached = null;
  }
  return cached;
}

/** Test hook: forget the cached value. */
export function resetLandingDataCache(): void {
  cached = undefined;
}

/** True when a loaded structure is the one the landing page describes. */
export function matchesLanding(data: LandingData, source: StructureSource | undefined): boolean {
  if (!source) return false;
  switch (data.kind) {
    case 'pdb':
      return source.type === 'rcsb' && source.id === data.id;
    case 'af':
      return source.type === 'alphafold' && source.id === data.id;
    case 'compound':
      return source.type === 'pubchem' && (source.slug === data.id || source.cid === data.pubchemCid);
  }
}
