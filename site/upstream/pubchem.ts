/**
 * Minimal PubChem lookup for pages rendered at request time
 * (/compound/cid/:cid, embed and oEmbed existence checks) and the MCP server.
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

/** The facts the MCP server reports for a compound outside the curated catalog. */
export interface PubchemCompound extends PubchemSummary {
  /** Molecular weight in g/mol, as PubChem formats it (e.g. "194.19"). */
  weight?: string;
  iupac?: string;
  smiles?: string;
}

interface FullPropertyResponse {
  PropertyTable?: {
    Properties?: {
      Title?: string;
      MolecularFormula?: string;
      MolecularWeight?: string | number;
      IUPACName?: string;
      SMILES?: string;
    }[];
  };
}

/** Same outcomes as fetchPubchemSummary, with weight, IUPAC name and SMILES. */
export async function fetchPubchemCompound(cid: number, opts: UpstreamOptions = {}): Promise<UpstreamResult<PubchemCompound>> {
  const resp = await getJson<FullPropertyResponse>(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,MolecularFormula,MolecularWeight,IUPACName,SMILES/JSON`,
    opts
  );
  if (!resp.ok) {
    return resp.status === 404 || resp.status === 400 ? { status: 'not-found' } : { status: 'error', message: resp.message };
  }
  const props = resp.data?.PropertyTable?.Properties?.[0];
  if (!props?.Title && !props?.MolecularFormula) return { status: 'not-found' };
  return {
    status: 'ok',
    data: {
      cid,
      title: props.Title,
      formula: props.MolecularFormula,
      weight: props.MolecularWeight === undefined ? undefined : String(props.MolecularWeight),
      iupac: props.IUPACName,
      smiles: props.SMILES,
    },
  };
}

interface CidListResponse {
  IdentifierList?: { CID?: number[] };
}

/**
 * Resolve a compound name (or a numeric CID typed as text) to a PubChem CID.
 * The browser keeps its own copy in src/utils/structureLoader.ts: this one
 * sends a User-Agent header, which would make browser requests preflighted.
 */
export async function resolvePubchemCid(name: string, opts: UpstreamOptions = {}): Promise<UpstreamResult<number>> {
  const trimmed = name.trim();
  if (/^\d+$/.test(trimmed)) return { status: 'ok', data: Number(trimmed) };
  if (!trimmed) return { status: 'not-found' };
  const resp = await getJson<CidListResponse>(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(trimmed)}/cids/JSON`,
    opts
  );
  if (!resp.ok) {
    return resp.status === 404 || resp.status === 400 ? { status: 'not-found' } : { status: 'error', message: resp.message };
  }
  const cid = resp.data?.IdentifierList?.CID?.[0];
  return cid ? { status: 'ok', data: cid } : { status: 'not-found' };
}
