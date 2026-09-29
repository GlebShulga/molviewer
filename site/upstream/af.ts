/**
 * Data layer for the /af/:id landing page.
 *
 * Sources (fetched in parallel):
 * 1. AlphaFold DB prediction API: existence and model metadata. Required.
 *    Existence is decided ONLY here: many UniProt entries have no AlphaFold model,
 *    and UniProt answers 200 for obsolete accessions.
 * 2. UniProtKB REST: function/location/disease/subunit annotation and PDB cross-references. Optional.
 */
import { getJson, isoDate, num, str, unique } from './http';
import type {
  AfDetails,
  AfPart,
  AfResult,
  PlddtFractions,
  UniProtAnnotation,
  UniProtPdbXref,
  UpstreamOptions,
} from './types';

/** Max experimental PDB structures listed. */
export const MAX_PDB_XREFS = 20;

const UNIPROT_FIELDS = [
  'protein_name',
  'organism_name',
  'gene_names',
  'length',
  'cc_function',
  'cc_subcellular_location',
  'cc_disease',
  'cc_subunit',
  'xref_pdb',
].join(',');

// ---------------------------------------------------------------------------
// Raw upstream shapes (only the fields we read)
// ---------------------------------------------------------------------------

interface RawAfEntry {
  entryId?: string;
  modelEntityId?: string;
  uniprotAccession?: string;
  uniprotDescription?: string;
  gene?: string;
  organismScientificName?: string;
  taxId?: number;
  modelCreatedDate?: string;
  latestVersion?: number;
  uniprotStart?: number;
  uniprotEnd?: number;
  sequenceStart?: number;
  sequenceEnd?: number;
  sequence?: string;
  uniprotSequence?: string;
  globalMetricValue?: number;
  fractionPlddtVeryHigh?: number;
  fractionPlddtConfident?: number;
  fractionPlddtLow?: number;
  fractionPlddtVeryLow?: number;
}

interface RawUniProt {
  entryType?: string;
  proteinDescription?: {
    recommendedName?: { fullName?: { value?: string } };
    submissionNames?: Array<{ fullName?: { value?: string } }>;
  };
  organism?: { scientificName?: string; commonName?: string };
  genes?: Array<{ geneName?: { value?: string } }>;
  sequence?: { length?: number };
  comments?: Array<{
    commentType?: string;
    texts?: Array<{ value?: string }>;
    subcellularLocations?: Array<{ location?: { value?: string } }>;
    disease?: { diseaseId?: string; acronym?: string };
  }>;
  uniProtKBCrossReferences?: Array<{
    database?: string;
    id?: string;
    properties?: Array<{ key?: string; value?: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch and normalize everything the AlphaFold landing page shows.
 * `not-found` only when the AlphaFold API returns 404 or an empty list; any other
 * AlphaFold failure is `error`. UniProt failures only mark `partial: ['uniprot']`.
 */
/**
 * HTTP statuses with which the AlphaFold prediction API says "no model for
 * this accession": 404 (unknown), 400/422 (not an accession it accepts).
 * Shared by the /af/ landing page, the PDB pages' AlphaFold links and the
 * embed/oEmbed checks, so they always agree. A 200 with an empty list also
 * means no model.
 */
export function isAlphaFoldMissing(status: number | undefined): boolean {
  return status === 404 || status === 400 || status === 422;
}

export async function fetchAfDetails(id: string, opts: UpstreamOptions = {}): Promise<AfResult> {
  const upper = id.trim().toUpperCase();
  const [afS, upS] = await Promise.allSettled([
    getJson<RawAfEntry[] | RawAfEntry>(
      `https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(upper)}`,
      opts
    ),
    getJson<RawUniProt>(
      `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(upper)}.json?fields=${UNIPROT_FIELDS}`,
      opts
    ),
  ]);

  if (afS.status === 'rejected') return { status: 'error', message: String(afS.reason) };
  const af = afS.value;
  if (!af.ok) {
    if (isAlphaFoldMissing(af.status)) return { status: 'not-found' };
    return { status: 'error', message: af.message };
  }
  const entry = pickAfEntry(upper, af.data);
  if (!entry) return { status: 'not-found' };

  const partial: AfPart[] = [];
  let uniprot: UniProtAnnotation | undefined;
  let xrefs: UniProtPdbXref[] = [];
  if (upS.status === 'fulfilled' && upS.value.ok) {
    const raw = upS.value.data;
    // Inactive (obsolete/merged) accessions come back as 200 with entryType "Inactive".
    if (raw && raw.entryType !== 'Inactive') {
      uniprot = normalizeUniProt(raw);
      xrefs = normalizePdbXrefs(raw);
    }
  } else if (!(upS.status === 'fulfilled' && upS.value.status === 404)) {
    partial.push('uniprot');
  }

  const data: AfDetails = {
    id: upper,
    ...normalizeAfEntry(entry),
    pdbStructures: xrefs.slice(0, MAX_PDB_XREFS),
    pdbStructureCount: xrefs.length,
    uniprot,
    partial,
  };
  // AlphaFold's own fields win; UniProt fills the gaps.
  data.description ??= uniprot?.proteinName;
  data.gene ??= uniprot?.geneName;
  data.organism ??= uniprot?.organism;
  data.sequenceLength ??= uniprot?.length;

  return { status: 'ok', data };
}

// ---------------------------------------------------------------------------
// AlphaFold
// ---------------------------------------------------------------------------

/**
 * The API returns an array; for accessions with isoforms it also contains
 * models for "P04637-2" etc. Prefer the canonical accession's model.
 */
function pickAfEntry(id: string, raw: RawAfEntry[] | RawAfEntry | null): RawAfEntry | undefined {
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  const valid = list.filter(
    (e) => e && typeof e === 'object' && (e.entryId || e.modelEntityId || e.uniprotAccession)
  );
  return (
    valid.find((e) => e.uniprotAccession?.toUpperCase() === id) ??
    valid.find((e) => (e.modelEntityId ?? e.entryId) === `AF-${id}-F1`) ??
    valid[0]
  );
}

type AfEntryFields = Pick<
  AfDetails,
  | 'modelEntityId'
  | 'description'
  | 'gene'
  | 'organism'
  | 'taxId'
  | 'modelCreatedDate'
  | 'latestVersion'
  | 'sequenceLength'
  | 'meanPlddt'
  | 'plddtFractions'
>;

export function normalizeAfEntry(e: RawAfEntry): AfEntryFields {
  return {
    modelEntityId: str(e.modelEntityId) ?? str(e.entryId),
    description: str(e.uniprotDescription),
    gene: str(e.gene),
    organism: str(e.organismScientificName),
    taxId: num(e.taxId),
    modelCreatedDate: isoDate(e.modelCreatedDate),
    latestVersion: num(e.latestVersion),
    sequenceLength: sequenceLength(e),
    meanPlddt: num(e.globalMetricValue),
    plddtFractions: plddtFractions(e),
  };
}

function sequenceLength(e: RawAfEntry): number | undefined {
  const start = num(e.uniprotStart) ?? num(e.sequenceStart);
  const end = num(e.uniprotEnd) ?? num(e.sequenceEnd);
  if (start !== undefined && end !== undefined && end >= start) return end - start + 1;
  const seq = str(e.sequence) ?? str(e.uniprotSequence);
  return seq?.length;
}

/** All four bands must be present; older API versions did not return them. */
function plddtFractions(e: RawAfEntry): PlddtFractions | undefined {
  const veryHigh = num(e.fractionPlddtVeryHigh);
  const confident = num(e.fractionPlddtConfident);
  const low = num(e.fractionPlddtLow);
  const veryLow = num(e.fractionPlddtVeryLow);
  if (
    veryHigh === undefined ||
    confident === undefined ||
    low === undefined ||
    veryLow === undefined
  ) {
    return undefined;
  }
  return { veryHigh, confident, low, veryLow };
}

// ---------------------------------------------------------------------------
// UniProt
// ---------------------------------------------------------------------------

export function normalizeUniProt(data: RawUniProt): UniProtAnnotation {
  let functionText: string | undefined;
  let subunit: string | undefined;
  const subcellularLocations: string[] = [];
  const diseases: string[] = [];

  for (const c of data.comments ?? []) {
    switch (c.commentType) {
      case 'FUNCTION':
        functionText ??= str(c.texts?.[0]?.value);
        break;
      case 'SUBUNIT':
        subunit ??= str(c.texts?.[0]?.value);
        break;
      case 'SUBCELLULAR LOCATION':
        for (const loc of c.subcellularLocations ?? []) {
          const v = str(loc.location?.value);
          if (v) subcellularLocations.push(v);
        }
        break;
      case 'DISEASE': {
        const name = str(c.disease?.diseaseId);
        const acronym = str(c.disease?.acronym);
        if (name) diseases.push(acronym ? `${name} (${acronym})` : name);
        break;
      }
    }
  }

  return {
    proteinName:
      str(data.proteinDescription?.recommendedName?.fullName?.value) ??
      str(data.proteinDescription?.submissionNames?.[0]?.fullName?.value),
    organism: str(data.organism?.scientificName),
    organismCommonName: str(data.organism?.commonName),
    geneName: str(data.genes?.[0]?.geneName?.value),
    length: num(data.sequence?.length),
    functionText,
    subunit,
    subcellularLocations: unique(subcellularLocations),
    diseases: unique(diseases),
  };
}

/** PDB cross-references, best resolution first (entries without a resolution, e.g. NMR, last). */
export function normalizePdbXrefs(data: RawUniProt): UniProtPdbXref[] {
  const xrefs: UniProtPdbXref[] = [];
  for (const x of data.uniProtKBCrossReferences ?? []) {
    if (x.database !== 'PDB') continue;
    const id = str(x.id)?.toUpperCase();
    if (!id) continue;
    const props = new Map((x.properties ?? []).map((p) => [p.key, p.value]));
    const chains = str(props.get('Chains'));
    xrefs.push({
      id,
      method: str(props.get('Method')),
      resolution: parseResolution(props.get('Resolution')),
      chains,
      chainIds: parseChainIds(chains),
    });
  }
  return xrefs.sort(
    (a, b) =>
      (a.resolution ?? Number.POSITIVE_INFINITY) - (b.resolution ?? Number.POSITIVE_INFINITY) ||
      a.id.localeCompare(b.id)
  );
}

/** "2.00 A" to 2; "-" (NMR) to undefined. */
function parseResolution(value: string | undefined): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(value ?? '');
  return m ? Number(m[1]) : undefined;
}

/** "A/C=2-142, B=1-50" to ["A", "C", "B"]. */
function parseChainIds(chains: string | undefined): string[] {
  if (!chains) return [];
  const ids = chains
    .split(',')
    .flatMap((segment) => (segment.split('=')[0] ?? '').split('/'))
    .map((c) => c.trim())
    .filter(Boolean);
  return unique(ids);
}
