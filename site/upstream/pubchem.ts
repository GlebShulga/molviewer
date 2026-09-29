/**
 * Minimal PubChem lookup for pages rendered at request time
 * (/compound/cid/:cid, embed and oEmbed existence checks).
 */
import { getJson } from './http';
import type { UpstreamOptions, UpstreamResult } from './types';

export interface PubchemSummary {
  cid: number;
  title?: string;
  formula?: string;
}

interface PropertyResponse {
  PropertyTable?: { Properties?: { Title?: string; MolecularFormula?: string }[] };
}

/**
 * - `not-found`: PubChem answered 404/400, or 200 with an empty record (its
 *   answer for CIDs that don't exist).
 * - `error`: timeout, 5xx or invalid JSON; callers keep status 200.
 */
export async function fetchPubchemSummary(cid: number, opts: UpstreamOptions = {}): Promise<UpstreamResult<PubchemSummary>> {
  const resp = await getJson<PropertyResponse>(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,MolecularFormula/JSON`,
    opts
  );
  if (!resp.ok) {
    return resp.status === 404 || resp.status === 400 ? { status: 'not-found' } : { status: 'error', message: resp.message };
  }
  const props = resp.data?.PropertyTable?.Properties?.[0];
  if (!props?.Title && !props?.MolecularFormula) return { status: 'not-found' };
  return { status: 'ok', data: { cid, title: props.Title, formula: props.MolecularFormula } };
}
