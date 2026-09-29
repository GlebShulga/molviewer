/**
 * Fetch and parse a structure from its source reference (RCSB, AlphaFold DB,
 * PubChem, or an inline payload). One code path for URL
 * loads, share links, embeds and the PubChem search box.
 */
import type { Molecule, StructureSource } from '../types';
import { parseByFormat, parseSDF } from '../parsers';

export interface LoadedStructure {
  molecule: Molecule;
  /** Display name for the structure list and the window title. */
  name: string;
  /** Non-fatal notice for the user, e.g. a flat 2D fallback. */
  warning?: string;
}

const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

/** Resolve a compound name (or a numeric CID typed as text) to a PubChem CID. */
export async function resolvePubchemCid(query: string, signal?: AbortSignal): Promise<number> {
  const trimmed = query.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const resp = await fetch(`${PUBCHEM}/compound/name/${encodeURIComponent(trimmed)}/cids/JSON`, { signal });
  if (resp.status === 404) throw new Error(`No PubChem compound found for "${trimmed}"`);
  if (!resp.ok) throw new Error(`PubChem lookup failed (${resp.status})`);
  const data = (await resp.json()) as { IdentifierList?: { CID?: number[] } };
  const cid = data.IdentifierList?.CID?.[0];
  if (!cid) throw new Error(`No PubChem compound found for "${trimmed}"`);
  return cid;
}

/** Fetch a PubChem compound's display title (best effort). */
async function fetchPubchemTitle(cid: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const resp = await fetch(`${PUBCHEM}/compound/cid/${cid}/property/Title/JSON`, { signal });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { PropertyTable?: { Properties?: { Title?: string }[] } };
    return data.PropertyTable?.Properties?.[0]?.Title ?? null;
  } catch {
    return null;
  }
}

/**
 * Load a PubChem compound. Prefers the 3D conformer; many compounds (salts,
 * mixtures, large or very flexible molecules) have none, so fall back to the
 * flat 2D record and say so.
 */
async function loadPubchem(cid: number, signal?: AbortSignal): Promise<LoadedStructure> {
  const titlePromise = fetchPubchemTitle(cid, signal);
  let resp = await fetch(`${PUBCHEM}/compound/cid/${cid}/SDF?record_type=3d`, { signal });
  let warning: string | undefined;
  if (resp.status === 404) {
    resp = await fetch(`${PUBCHEM}/compound/cid/${cid}/SDF?record_type=2d`, { signal });
    if (resp.status === 404) throw new Error(`PubChem compound CID ${cid} not found`);
    warning = 'PubChem has no 3D conformer for this compound, so it is shown as a flat 2D structure.';
  }
  if (!resp.ok) throw new Error(`Failed to fetch compound from PubChem (${resp.status})`);
  const molecule = parseSDF(await resp.text());
  const title = await titlePromise;
  const name = title ?? `CID ${cid}`;
  molecule.name = name;
  return { molecule, name, warning };
}

export async function loadStructureFromSource(
  source: StructureSource,
  signal?: AbortSignal
): Promise<LoadedStructure> {
  switch (source.type) {
    case 'rcsb': {
      // mmCIF: RCSB's preferred format, with better coverage than legacy PDB.
      const resp = await fetch(`https://files.rcsb.org/download/${source.id}.cif`, { signal });
      if (!resp.ok) {
        throw new Error(resp.status === 404 ? `PDB ID "${source.id}" not found` : `Failed to fetch structure: ${resp.statusText || resp.status}`);
      }
      const molecule = parseByFormat(await resp.text(), 'cif');
      molecule.name = source.id;
      return { molecule, name: source.id };
    }
    case 'alphafold': {
      const metaResp = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${source.id}`, { signal });
      if (!metaResp.ok) {
        throw new Error(
          metaResp.status === 404
            ? `UniProt ID "${source.id}" not found in AlphaFold DB`
            : `Failed to fetch AlphaFold metadata: ${metaResp.statusText || metaResp.status}`
        );
      }
      const metadata = (await metaResp.json()) as AlphaFoldEntry[] | AlphaFoldEntry;
      const entries = Array.isArray(metadata) ? metadata : [metadata];
      // Some accessions return several models (isoforms): take the canonical one.
      const entry = entries.find((e) => e?.uniprotAccession === source.id) ?? entries[0];
      const cifUrl = entry?.cifUrl;
      if (!cifUrl) throw new Error('No structure file available for this UniProt ID');
      const cifResp = await fetch(cifUrl, { signal });
      if (!cifResp.ok) throw new Error(`Failed to fetch AlphaFold structure: ${cifResp.statusText || cifResp.status}`);
      const name = `AF-${source.id}`;
      const molecule = parseByFormat(await cifResp.text(), 'cif');
      molecule.name = name;
      return { molecule, name };
    }
    case 'pubchem':
      return loadPubchem(source.cid, signal);
    case 'inline': {
      const molecule = parseByFormat(source.data, source.format);
      return { molecule, name: molecule.name || 'Structure' };
    }
    default: {
      // Sessions and share links saved by older versions may hold source
      // types this version no longer loads (e.g. external URLs).
      const type = (source as { type?: unknown }).type;
      throw new Error(`This structure's source (${String(type)}) is no longer supported`);
    }
  }
}

interface AlphaFoldEntry {
  uniprotAccession?: string;
  cifUrl?: string;
}
