/**
 * Structured summary injected into landing pages as
 * `<script type="application/json" id="landing-data">`. The React app reads it
 * to show the "About this structure" panel in the sidebar, so the same facts
 * crawlers see below the viewer are visible to people using the app.
 */
export interface LandingData {
  kind: 'pdb' | 'af' | 'compound';
  /** PDB ID, UniProt accession or compound slug, as used in the URL. */
  id: string;
  /** PubChem CID for compound pages, so the app can load it without a name lookup. */
  pubchemCid?: number;
  /** Display name, e.g. "Deoxyribonuclease I". */
  title: string;
  /** One-line context, e.g. "X-ray diffraction, 2.0 Å" or "AlphaFold prediction". */
  subtitle?: string;
  /** Short plain-text summary paragraph. */
  summary?: string;
  facts: { label: string; value: string }[];
  /** Secondary structure ranges per chain (author numbering), already formatted. */
  secondaryStructure?: { chain: string; helices: string[]; strands: string[] }[];
  links: { label: string; href: string }[];
}

export const LANDING_DATA_ELEMENT_ID = 'landing-data';
export const PAGE_INFO_ELEMENT_ID = 'page-info';
