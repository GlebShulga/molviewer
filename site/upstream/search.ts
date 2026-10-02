/**
 * Free-text search over the upstream databases, for the MCP server's
 * `find_structures` tool. The curated catalogs are searched first (see
 * workers/mcp); these cover everything else.
 */
import { fetchEntrySummaries } from './pdb';
import { getJson, num, str } from './http';
import type { RelatedEntry, UpstreamOptions, UpstreamResult } from './types';

/** A PDB entry found by full-text search, best match first. */
export type RcsbHit = RelatedEntry;

/** A reviewed UniProtKB entry that has an AlphaFold DB model. */
export interface UniProtHit {
  accession: string;
  proteinName?: string;
  gene?: string;
  organism?: string;
  taxId?: number;
  length?: number;
}

interface RawSearchResponse {
  result_set?: Array<{ identifier?: string }>;
}

/** RCSB Search API v2 full-text query for experimental entries. */
export function rcsbFullTextUrl(text: string, rows: number): string {
  const query = {
    query: { type: 'terminal', service: 'full_text', parameters: { value: text } },
    return_type: 'entry',
    request_options: { paginate: { start: 0, rows }, results_content_type: ['experimental'] },
  };
  return `https://search.rcsb.org/rcsbsearch/v2/query?json=${encodeURIComponent(JSON.stringify(query))}`;
}

/**
 * Full-text search of the PDB. Titles come from one GraphQL call; if that
 * fails the ids are still returned.
 */
export async function searchRcsb(
  text: string,
  rows: number,
  opts: UpstreamOptions = {}
): Promise<UpstreamResult<RcsbHit[]>> {
  const search = await getJson<RawSearchResponse>(rcsbFullTextUrl(text, rows), opts);
  if (!search.ok) return { status: 'error', message: search.message };
  // No hits arrive as a 204, i.e. data === null.
  const ids = [
    ...new Set(
      (search.data?.result_set ?? []).map((r) => str(r.identifier)?.toUpperCase()).filter((id): id is string => !!id)
    ),
  ].slice(0, rows);
  if (!ids.length) return { status: 'not-found' };
  const summaries = await fetchEntrySummaries(ids, opts);
  return { status: 'ok', data: summaries.ok ? summaries.entries : ids.map((id) => ({ id })) };
}

const UNIPROT_SEARCH_FIELDS = 'accession,protein_name,gene_primary,organism_name,organism_id,length';

/**
 * Words that name an organism. When the query has one, searching human
 * proteins first would bury the protein that was asked for.
 */
const ORGANISM_WORDS =
  /\b(mouse|murine|rat|yeast|cerevisiae|pombe|coli|bacteri\w*|zebrafish|danio|drosophila|fly|worm|elegans|arabidopsis|plant|bovine|cow|pig|porcine|chicken|dog|horse|sheep|virus|viral|sars|hiv|influenza|plasmodium|malaria|tuberculosis|bacillus|staphylococcus|xenopus|frog)\b/i;

export function uniprotSearchUrl(text: string, humanOnly: boolean, size: number): string {
  const query = `(${text}) AND (reviewed:true)${humanOnly ? ' AND (organism_id:9606)' : ''}`;
  const params = new URLSearchParams({ query, fields: UNIPROT_SEARCH_FIELDS, size: String(size), format: 'json' });
  return `https://rest.uniprot.org/uniprotkb/search?${params}`;
}

interface RawUniProtSearch {
  results?: Array<{
    primaryAccession?: string;
    proteinDescription?: {
      recommendedName?: { fullName?: { value?: string } };
      submissionNames?: Array<{ fullName?: { value?: string } }>;
    };
    genes?: Array<{ geneName?: { value?: string } }>;
    organism?: { scientificName?: string; taxonId?: number };
    sequence?: { length?: number };
  }>;
}

function normalizeUniProtHits(raw: RawUniProtSearch | null): UniProtHit[] {
  return (raw?.results ?? []).flatMap((r) => {
    const accession = str(r.primaryAccession)?.toUpperCase();
    if (!accession) return [];
    return [
      {
        accession,
        proteinName: str(
          r.proteinDescription?.recommendedName?.fullName?.value ??
            r.proteinDescription?.submissionNames?.[0]?.fullName?.value
        ),
        gene: str(r.genes?.[0]?.geneName?.value),
        organism: str(r.organism?.scientificName),
        taxId: num(r.organism?.taxonId),
        length: num(r.sequence?.length),
      },
    ];
  });
}

/**
 * Reviewed UniProtKB entries for a protein or gene name, human first unless
 * the query names another organism, keeping only those with an AlphaFold DB
 * model (checked for at most `size` hits).
 */
export async function searchUniProt(
  text: string,
  size: number,
  opts: UpstreamOptions = {}
): Promise<UpstreamResult<UniProtHit[]>> {
  const humanFirst = !ORGANISM_WORDS.test(text);
  let resp = await getJson<RawUniProtSearch>(uniprotSearchUrl(text, humanFirst, size), opts);
  let hits = resp.ok ? normalizeUniProtHits(resp.data) : [];
  if (humanFirst && resp.ok && !hits.length) {
    resp = await getJson<RawUniProtSearch>(uniprotSearchUrl(text, false, size), opts);
    hits = resp.ok ? normalizeUniProtHits(resp.data) : [];
  }
  if (!resp.ok) return { status: 'error', message: resp.message };
  if (!hits.length) return { status: 'not-found' };

  const checks = await Promise.all(
    hits.map((h) =>
      getJson<unknown[]>(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(h.accession)}`, opts)
    )
  );
  // A failed check (timeout, 5xx) keeps the hit: the viewer reports a missing model clearly.
  const withModel = hits.filter((_, i) => {
    const c = checks[i];
    return c.ok ? Array.isArray(c.data) && c.data.length > 0 : c.status === undefined || c.status >= 500;
  });
  return withModel.length ? { status: 'ok', data: withModel } : { status: 'not-found' };
}
