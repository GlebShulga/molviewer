/**
 * Data layer for the /pdb/:id landing page.
 *
 * Sources (fetched in parallel where possible):
 * 1. RCSB core entry REST (existence, title, method, dates, counts, citation). Required.
 * 2. RCSB GraphQL: polymer entities and ligands. Optional.
 * 3. PDBe secondary structure (author numbering), falling back to RCSB GraphQL
 *    instance features (label numbering). Optional.
 * 4. RCSB Search: other entries sharing the first protein entity's UniProt accession. Optional.
 */
import { isAlphaFoldMissing } from './af';
import {
  DEFAULT_TIMEOUT_MS,
  getJson,
  isoDate,
  num,
  rcsbGraphql,
  str,
  unique,
  type JsonResponse,
} from './http';
import type {
  ChainSecondaryStructure,
  Citation,
  Ligand,
  PdbDetails,
  PdbPart,
  PdbResult,
  PolymerEntity,
  PolymerType,
  RelatedEntry,
  ResidueRef,
  SecondaryStructure,
  SsSegment,
  Strand,
  UpstreamOptions,
} from './types';

/** Max related entries returned. */
export const MAX_RELATED = 12;

/**
 * Non-polymer components that are skipped as ligands: water plus common
 * crystallization/cryo additives, buffers and simple counter-ions. Metal ions
 * with biological roles (ZN, FE, MG, CA, MN, CU...) and cofactors (HEM...) are kept.
 * Phosphate (PO4) and citrate (CIT) are kept on purpose: they are often functional.
 */
export const LIGAND_DENYLIST: ReadonlySet<string> = new Set([
  // water
  'HOH',
  'DOD',
  // polyols / PEG fragments / cryoprotectants
  'GOL',
  'EDO',
  'PEG',
  'PG4',
  'PGE',
  '1PE',
  'P6G',
  '12P',
  'MPD',
  'DMS',
  // buffers
  'TRS',
  'EPE',
  'MES',
  'IMD',
  'BME',
  // small acids / anions
  'SO4',
  'ACT',
  'ACY',
  'FMT',
  'NO3',
  // simple counter-ions
  'CL',
  'NA',
  'K',
  'BR',
  'IOD',
  'NH4',
  // unknown atoms/ligands
  'UNX',
  'UNL',
]);

// ---------------------------------------------------------------------------
// Raw upstream shapes (only the fields we read)
// ---------------------------------------------------------------------------

interface RawCoreEntry {
  struct?: { title?: string; pdbx_descriptor?: string };
  struct_keywords?: { pdbx_keywords?: string };
  exptl?: Array<{ method?: string }>;
  rcsb_entry_info?: {
    resolution_combined?: number[];
    deposited_atom_count?: number;
    deposited_model_count?: number;
    deposited_polymer_entity_instance_count?: number;
    polymer_entity_count?: number;
    polymer_entity_count_protein?: number;
    polymer_entity_count_nucleic_acid?: number;
    nonpolymer_entity_count?: number;
    molecular_weight?: number;
  };
  rcsb_accession_info?: {
    deposit_date?: string;
    initial_release_date?: string;
    revision_date?: string;
  };
  rcsb_primary_citation?: {
    title?: string;
    rcsb_authors?: string[];
    journal_abbrev?: string;
    rcsb_journal_abbrev?: string;
    year?: number;
    journal_volume?: string;
    page_first?: string;
    page_last?: string;
    pdbx_database_id_PubMed?: number;
    pdbx_database_id_DOI?: string;
  };
}

interface RawEntitiesData {
  entry: {
    polymer_entities?: Array<{
      rcsb_polymer_entity?: { pdbx_description?: string } | null;
      rcsb_polymer_entity_container_identifiers?: {
        entity_id?: string;
        auth_asym_ids?: string[] | null;
        uniprot_ids?: string[] | null;
        reference_sequence_identifiers?: Array<{
          database_name?: string;
          database_accession?: string;
        }> | null;
      } | null;
      rcsb_entity_source_organism?: Array<{ scientific_name?: string | null }> | null;
      entity_poly?: {
        pdbx_seq_one_letter_code_can?: string | null;
        rcsb_sample_sequence_length?: number | null;
        rcsb_entity_polymer_type?: string | null;
      } | null;
    }> | null;
    nonpolymer_entities?: Array<{
      rcsb_nonpolymer_entity_container_identifiers?: {
        auth_asym_ids?: string[] | null;
        nonpolymer_comp_id?: string | null;
      } | null;
      rcsb_nonpolymer_entity?: { pdbx_number_of_molecules?: number | null } | null;
      nonpolymer_comp?: {
        chem_comp?: {
          id?: string;
          name?: string | null;
          formula?: string | null;
          formula_weight?: number | null;
        } | null;
      } | null;
    }> | null;
  } | null;
}

interface RawPdbeResidue {
  residue_number?: number;
  author_residue_number?: number;
  author_insertion_code?: string | null;
}

interface RawPdbeSegment {
  start?: RawPdbeResidue;
  end?: RawPdbeResidue;
  sheet_id?: number | string;
}

type RawPdbeSecondaryStructure = Record<
  string,
  {
    molecules?: Array<{
      entity_id?: number;
      chains?: Array<{
        chain_id?: string;
        struct_asym_id?: string;
        secondary_structure?: { helices?: RawPdbeSegment[]; strands?: RawPdbeSegment[] };
      }>;
    }>;
  }
>;

interface RawRcsbFeaturesData {
  entry: {
    polymer_entities?: Array<{
      rcsb_polymer_entity_container_identifiers?: { entity_id?: string } | null;
      polymer_entity_instances?: Array<{
        rcsb_polymer_entity_instance_container_identifiers?: { auth_asym_id?: string } | null;
        rcsb_polymer_instance_feature?: Array<{
          type?: string;
          feature_id?: string | null;
          feature_positions?: Array<{ beg_seq_id?: number; end_seq_id?: number | null }> | null;
        }> | null;
      }> | null;
    }> | null;
  } | null;
}

interface RawSearchResponse {
  result_set?: Array<{ identifier?: string; score?: number }>;
}

interface RawEntriesData {
  entries?: Array<{
    rcsb_id?: string;
    struct?: { title?: string | null } | null;
    exptl?: Array<{ method?: string | null }> | null;
    rcsb_entry_info?: { resolution_combined?: number[] | null } | null;
  } | null> | null;
}

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

const ENTITIES_QUERY = `query($id: String!) {
  entry(entry_id: $id) {
    polymer_entities {
      rcsb_polymer_entity { pdbx_description }
      rcsb_polymer_entity_container_identifiers {
        entity_id auth_asym_ids uniprot_ids
        reference_sequence_identifiers { database_name database_accession }
      }
      rcsb_entity_source_organism { scientific_name }
      entity_poly { pdbx_seq_one_letter_code_can rcsb_sample_sequence_length rcsb_entity_polymer_type }
    }
    nonpolymer_entities {
      rcsb_nonpolymer_entity_container_identifiers { auth_asym_ids nonpolymer_comp_id }
      rcsb_nonpolymer_entity { pdbx_number_of_molecules }
      nonpolymer_comp { chem_comp { id name formula formula_weight } }
    }
  }
}`;

const SS_FEATURES_QUERY = `query($id: String!) {
  entry(entry_id: $id) {
    polymer_entities {
      rcsb_polymer_entity_container_identifiers { entity_id }
      polymer_entity_instances {
        rcsb_polymer_entity_instance_container_identifiers { auth_asym_id }
        rcsb_polymer_instance_feature { type feature_id feature_positions { beg_seq_id end_seq_id } }
      }
    }
  }
}`;

const ENTRIES_QUERY = `query($ids: [String!]!) {
  entries(entry_ids: $ids) {
    rcsb_id
    struct { title }
    exptl { method }
    rcsb_entry_info { resolution_combined }
  }
}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch and normalize everything the PDB landing page shows.
 * `not-found` only when RCSB's core entry endpoint returns 404; any other core
 * failure is `error`. Optional sections degrade independently (see `data.partial`).
 */
export async function fetchPdbDetails(id: string, opts: UpstreamOptions = {}): Promise<PdbResult> {
  const upper = id.trim().toUpperCase();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Sequential steps (fallback SS, related search then titles) share an overall budget.
  const deadline = Date.now() + timeoutMs * 2;
  const withBudget = (): UpstreamOptions | null => {
    const remaining = deadline - Date.now();
    return remaining > 0 ? { ...opts, timeoutMs: Math.min(timeoutMs, remaining) } : null;
  };

  const coreP = getJson<RawCoreEntry>(
    `https://data.rcsb.org/rest/v1/core/entry/${encodeURIComponent(upper)}`,
    opts
  );
  const entitiesP = fetchEntities(upper, opts);
  const ssP = fetchSecondaryStructure(upper, opts, withBudget);
  const relatedP = entitiesP.then((e) => {
    if (!e.ok) return null;
    const accession = pickUniprotAccession(e.data.entities);
    return accession
      ? fetchRelated(upper, accession, withBudget)
      : { accession, related: [], failed: [] };
  });

  const alphafoldP = entitiesP.then((e) => (e.ok ? checkAlphaFold(e.data.entities, opts) : null));

  const core = await coreP;
  if (!core.ok) {
    if (core.status === 404) return { status: 'not-found' };
    return { status: 'error', message: core.message };
  }
  if (!core.data) return { status: 'error', message: 'Empty response from data.rcsb.org' };

  const [entitiesS, ssS, relatedS, alphafoldS] = await Promise.allSettled([entitiesP, ssP, relatedP, alphafoldP]);
  const partial: PdbPart[] = [];

  const data: PdbDetails = {
    ...normalizeCore(upper, core.data),
    entities: [],
    ligands: [],
    excludedLigandIds: [],
    related: [],
    alphafoldIds: [],
    partial,
  };

  if (alphafoldS.status === 'fulfilled' && alphafoldS.value) {
    data.alphafoldIds = alphafoldS.value.available;
    if (alphafoldS.value.failed) partial.push('alphafold');
  }

  if (entitiesS.status === 'fulfilled' && entitiesS.value.ok) {
    Object.assign(data, entitiesS.value.data);
  } else {
    partial.push('entities');
  }

  if (ssS.status === 'fulfilled') {
    data.secondaryStructure = ssS.value.secondaryStructure;
    partial.push(...ssS.value.failed);
  } else {
    partial.push('pdbeSecondaryStructure', 'rcsbSecondaryStructure');
  }

  if (relatedS.status === 'fulfilled') {
    if (relatedS.value) {
      data.relatedUniprotId = relatedS.value.accession;
      data.related = relatedS.value.related;
      partial.push(...relatedS.value.failed);
    }
    // null: entities failed, so there was no accession to search for (already recorded).
  } else {
    partial.push('related');
  }

  return { status: 'ok', data };
}

// ---------------------------------------------------------------------------
// (1) Core entry
// ---------------------------------------------------------------------------

type CoreFields = Omit<
  PdbDetails,
  | 'entities'
  | 'ligands'
  | 'excludedLigandIds'
  | 'secondaryStructure'
  | 'relatedUniprotId'
  | 'related'
  | 'alphafoldIds'
  | 'partial'
>;

export function normalizeCore(id: string, raw: RawCoreEntry): CoreFields {
  const info = raw.rcsb_entry_info ?? {};
  const acc = raw.rcsb_accession_info ?? {};
  const methods = unique((raw.exptl ?? []).map((e) => str(e.method)).filter(isDefined));
  return {
    id,
    title: str(raw.struct?.title),
    descriptor: str(raw.struct?.pdbx_descriptor),
    keywords: str(raw.struct_keywords?.pdbx_keywords),
    method: methods[0],
    methods,
    resolution: num(info.resolution_combined?.[0]),
    depositDate: isoDate(acc.deposit_date),
    releaseDate: isoDate(acc.initial_release_date),
    revisionDate: isoDate(acc.revision_date),
    atomCount: num(info.deposited_atom_count),
    modelCount: num(info.deposited_model_count),
    polymerEntityCount: num(info.polymer_entity_count),
    proteinEntityCount: num(info.polymer_entity_count_protein),
    nucleicAcidEntityCount: num(info.polymer_entity_count_nucleic_acid),
    nonpolymerEntityCount: num(info.nonpolymer_entity_count),
    polymerChainCount: num(info.deposited_polymer_entity_instance_count),
    molecularWeight: num(info.molecular_weight),
    citation: normalizeCitation(raw.rcsb_primary_citation),
  };
}

function normalizeCitation(raw: RawCoreEntry['rcsb_primary_citation']): Citation | undefined {
  if (!raw) return undefined;
  const citation: Citation = {
    title: str(raw.title),
    authors: (raw.rcsb_authors ?? []).map(str).filter(isDefined),
    journal: str(raw.rcsb_journal_abbrev) ?? str(raw.journal_abbrev),
    year: num(raw.year),
    volume: str(raw.journal_volume),
    pageFirst: str(raw.page_first),
    pageLast: str(raw.page_last),
    pubmedId: num(raw.pdbx_database_id_PubMed),
    doi: str(raw.pdbx_database_id_DOI),
  };
  return citation.title || citation.pubmedId || citation.doi ? citation : undefined;
}

// ---------------------------------------------------------------------------
// (2) Entities and ligands
// ---------------------------------------------------------------------------

type EntitiesFields = Pick<PdbDetails, 'entities' | 'ligands' | 'excludedLigandIds'>;

async function fetchEntities(
  id: string,
  opts: UpstreamOptions
): Promise<JsonResponse<EntitiesFields>> {
  const resp = await rcsbGraphql<RawEntitiesData>(ENTITIES_QUERY, { id }, opts);
  if (!resp.ok) return resp;
  if (!resp.data.entry) return { ok: false, message: `RCSB GraphQL has no entry ${id}` };
  return { ok: true, status: resp.status, data: normalizeEntities(resp.data) };
}

export function normalizeEntities(raw: RawEntitiesData): EntitiesFields {
  const entities: PolymerEntity[] = (raw.entry?.polymer_entities ?? []).map((p) => {
    const ids = p.rcsb_polymer_entity_container_identifiers ?? {};
    const uniprotFromRefs = (ids.reference_sequence_identifiers ?? [])
      .filter((r) => r.database_name === 'UniProt')
      .map((r) => str(r.database_accession));
    const poly = p.entity_poly ?? {};
    const sequence = str(poly.pdbx_seq_one_letter_code_can)?.replace(/\s+/g, '');
    return {
      entityId: ids.entity_id ?? '',
      description: str(p.rcsb_polymer_entity?.pdbx_description),
      chainIds: (ids.auth_asym_ids ?? []).filter(isDefined),
      organisms: unique(
        (p.rcsb_entity_source_organism ?? []).map((o) => str(o.scientific_name)).filter(isDefined)
      ),
      uniprotIds: unique([...(ids.uniprot_ids ?? []), ...uniprotFromRefs].filter(isDefined)),
      sequence,
      length: num(poly.rcsb_sample_sequence_length) ?? sequence?.length,
      type: polymerType(poly.rcsb_entity_polymer_type),
    };
  });
  entities.sort((a, b) => Number(a.entityId) - Number(b.entityId));

  const ligands: Ligand[] = [];
  const excluded: string[] = [];
  for (const n of raw.entry?.nonpolymer_entities ?? []) {
    const comp = n.nonpolymer_comp?.chem_comp;
    const ccd =
      str(comp?.id) ?? str(n.rcsb_nonpolymer_entity_container_identifiers?.nonpolymer_comp_id);
    if (!ccd) continue;
    if (LIGAND_DENYLIST.has(ccd.toUpperCase())) {
      excluded.push(ccd);
      continue;
    }
    const chainIds = (n.rcsb_nonpolymer_entity_container_identifiers?.auth_asym_ids ?? []).filter(
      isDefined
    );
    const existing = ligands.find((l) => l.id === ccd);
    const count =
      num(n.rcsb_nonpolymer_entity?.pdbx_number_of_molecules) ?? Math.max(chainIds.length, 1);
    if (existing) {
      // Same component split across entities: merge.
      existing.instanceCount += count;
      existing.chainIds = unique([...existing.chainIds, ...chainIds]);
      continue;
    }
    ligands.push({
      id: ccd,
      name: str(comp?.name),
      formula: str(comp?.formula),
      formulaWeight: num(comp?.formula_weight),
      instanceCount: count,
      chainIds: unique(chainIds),
    });
  }

  return { entities, ligands, excludedLigandIds: unique(excluded) };
}

function polymerType(raw: string | null | undefined): PolymerType {
  switch (raw) {
    case 'Protein':
      return 'protein';
    case 'DNA':
      return 'DNA';
    case 'RNA':
      return 'RNA';
    case 'NA-hybrid':
      return 'NA-hybrid';
    default:
      return 'other';
  }
}

/** First protein entity with a UniProt accession, falling back to any entity. */
/** At most this many accessions are checked, so a huge complex doesn't fan out. */
export const MAX_ALPHAFOLD_CHECKS = 4;

/**
 * Which of the entry's UniProt accessions have an AlphaFold DB model. The
 * prediction API answers 404 (or an empty list) when there is none.
 */
async function checkAlphaFold(
  entities: PolymerEntity[],
  opts: UpstreamOptions
): Promise<{ available: string[]; failed: boolean }> {
  const accessions = [...new Set(entities.filter((e) => e.type === 'protein').flatMap((e) => e.uniprotIds))].slice(
    0,
    MAX_ALPHAFOLD_CHECKS
  );
  const results = await Promise.all(
    accessions.map((acc) => getJson<unknown[]>(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(acc)}`, opts))
  );
  const available: string[] = [];
  let failed = false;
  results.forEach((r, i) => {
    if (r.ok && Array.isArray(r.data) && r.data.length > 0) available.push(accessions[i]);
    else if (!r.ok && !isAlphaFoldMissing(r.status)) failed = true;
  });
  return { available, failed };
}

function pickUniprotAccession(entities: PolymerEntity[]): string | undefined {
  const protein = entities.find((e) => e.type === 'protein' && e.uniprotIds.length);
  return (protein ?? entities.find((e) => e.uniprotIds.length))?.uniprotIds[0];
}

// ---------------------------------------------------------------------------
// (3) Secondary structure
// ---------------------------------------------------------------------------

interface SsOutcome {
  secondaryStructure?: SecondaryStructure;
  failed: PdbPart[];
}

async function fetchSecondaryStructure(
  id: string,
  opts: UpstreamOptions,
  withBudget: () => UpstreamOptions | null
): Promise<SsOutcome> {
  const failed: PdbPart[] = [];
  const lower = id.toLowerCase();
  const pdbe = await getJson<RawPdbeSecondaryStructure>(
    `https://www.ebi.ac.uk/pdbe/api/pdb/entry/secondary_structure/${encodeURIComponent(lower)}`,
    opts
  );
  if (pdbe.ok && pdbe.data) {
    return { secondaryStructure: normalizePdbeSecondaryStructure(lower, pdbe.data), failed };
  }
  // PDBe 404 means "no data" (nucleic-acid-only or not yet processed): not a failure,
  // but RCSB may still have annotations, so the fallback is tried either way.
  if (!(pdbe.ok || pdbe.status === 404)) failed.push('pdbeSecondaryStructure');

  const budget = withBudget();
  const rcsb = budget
    ? await rcsbGraphql<RawRcsbFeaturesData>(SS_FEATURES_QUERY, { id }, budget)
    : ({ ok: false, message: 'Time budget exhausted' } as const);
  if (!rcsb.ok || !rcsb.data.entry) {
    failed.push('rcsbSecondaryStructure');
    return { failed };
  }
  return { secondaryStructure: normalizeRcsbSecondaryStructure(rcsb.data), failed };
}

export function normalizePdbeSecondaryStructure(
  idLower: string,
  raw: RawPdbeSecondaryStructure
): SecondaryStructure {
  const entry = raw[idLower] ?? Object.values(raw)[0];
  const chains: ChainSecondaryStructure[] = [];
  for (const molecule of entry?.molecules ?? []) {
    for (const chain of molecule.chains ?? []) {
      const chainId = str(chain.chain_id);
      if (!chainId) continue;
      const ss = chain.secondary_structure ?? {};
      const helices = (ss.helices ?? []).map(pdbeSegment).filter(isDefined);
      const strands: Strand[] = (ss.strands ?? [])
        .map((s) => {
          const seg = pdbeSegment(s);
          if (!seg) return undefined;
          const sheetId =
            s.sheet_id === undefined || s.sheet_id === null ? undefined : String(s.sheet_id);
          return sheetId ? { ...seg, sheetId } : seg;
        })
        .filter(isDefined);
      if (!helices.length && !strands.length) continue;
      chains.push({
        chainId,
        entityId: molecule.entity_id === undefined ? undefined : String(molecule.entity_id),
        helices: helices.sort(bySeqStart),
        strands: strands.sort(bySeqStart),
      });
    }
  }
  chains.sort((a, b) => a.chainId.localeCompare(b.chainId));
  return { source: 'pdbe', numbering: 'author', chains };
}

function pdbeSegment(raw: RawPdbeSegment): SsSegment | undefined {
  const seqStart = num(raw.start?.residue_number);
  const seqEnd = num(raw.end?.residue_number);
  const startAuth = num(raw.start?.author_residue_number);
  const endAuth = num(raw.end?.author_residue_number);
  if (
    seqStart === undefined ||
    seqEnd === undefined ||
    startAuth === undefined ||
    endAuth === undefined
  ) {
    return undefined;
  }
  return {
    start: residueRef(startAuth, raw.start?.author_insertion_code),
    end: residueRef(endAuth, raw.end?.author_insertion_code),
    seqStart,
    seqEnd,
    length: seqEnd - seqStart + 1,
  };
}

function residueRef(number: number, insertionCode?: string | null): ResidueRef {
  const ins = str(insertionCode);
  return ins ? { number, insertionCode: ins } : { number };
}

export function normalizeRcsbSecondaryStructure(raw: RawRcsbFeaturesData): SecondaryStructure {
  const chains: ChainSecondaryStructure[] = [];
  for (const entity of raw.entry?.polymer_entities ?? []) {
    const entityId = entity.rcsb_polymer_entity_container_identifiers?.entity_id;
    for (const instance of entity.polymer_entity_instances ?? []) {
      const chainId = str(
        instance.rcsb_polymer_entity_instance_container_identifiers?.auth_asym_id
      );
      if (!chainId) continue;
      const helices: SsSegment[] = [];
      const strands: Strand[] = [];
      for (const feature of instance.rcsb_polymer_instance_feature ?? []) {
        if (feature.type !== 'HELIX_P' && feature.type !== 'SHEET') continue;
        const sheetId =
          feature.type === 'SHEET' ? sheetIdFromFeature(feature.feature_id) : undefined;
        for (const pos of feature.feature_positions ?? []) {
          const seqStart = num(pos.beg_seq_id);
          if (seqStart === undefined) continue;
          const seqEnd = num(pos.end_seq_id) ?? seqStart;
          const seg: SsSegment = {
            start: { number: seqStart },
            end: { number: seqEnd },
            seqStart,
            seqEnd,
            length: seqEnd - seqStart + 1,
          };
          if (feature.type === 'HELIX_P') helices.push(seg);
          else strands.push(sheetId ? { ...seg, sheetId } : seg);
        }
      }
      if (!helices.length && !strands.length) continue;
      chains.push({
        chainId,
        entityId,
        helices: helices.sort(bySeqStart),
        strands: strands.sort(bySeqStart),
      });
    }
  }
  chains.sort((a, b) => a.chainId.localeCompare(b.chainId));
  return { source: 'rcsb', numbering: 'label', chains };
}

/** RCSB sheet feature ids look like "S1"; normalize to "1" to match PDBe. */
function sheetIdFromFeature(featureId: string | null | undefined): string | undefined {
  const id = str(featureId);
  if (!id) return undefined;
  const m = /^S(\d+)$/i.exec(id);
  return m ? m[1] : id;
}

function bySeqStart(a: SsSegment, b: SsSegment): number {
  return a.seqStart - b.seqStart;
}

// ---------------------------------------------------------------------------
// (4) Related entries
// ---------------------------------------------------------------------------

interface RelatedOutcome {
  accession?: string;
  related: RelatedEntry[];
  failed: PdbPart[];
}

/** Search API v2 query: entries whose polymer entities map to a UniProt accession. */
export function relatedSearchUrl(accession: string, rows: number): string {
  const query = {
    query: {
      type: 'group',
      logical_operator: 'and',
      nodes: [
        {
          type: 'terminal',
          service: 'text',
          parameters: {
            attribute:
              'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession',
            operator: 'exact_match',
            value: accession,
          },
        },
        {
          type: 'terminal',
          service: 'text',
          parameters: {
            attribute:
              'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_name',
            operator: 'exact_match',
            value: 'UniProt',
          },
        },
      ],
    },
    return_type: 'entry',
    request_options: {
      paginate: { start: 0, rows },
      sort: [{ sort_by: 'rcsb_entry_info.resolution_combined', direction: 'asc' }],
      results_content_type: ['experimental'],
    },
  };
  return `https://search.rcsb.org/rcsbsearch/v2/query?json=${encodeURIComponent(JSON.stringify(query))}`;
}

async function fetchRelated(
  selfId: string,
  accession: string,
  withBudget: () => UpstreamOptions | null
): Promise<RelatedOutcome> {
  const budget = withBudget();
  if (!budget) return { accession, related: [], failed: ['related'] };

  // Ask for one extra row since the entry itself is usually in the result set.
  const search = await getJson<RawSearchResponse>(
    relatedSearchUrl(accession, MAX_RELATED + 1),
    budget
  );
  if (!search.ok) return { accession, related: [], failed: ['related'] };

  // A 204 (no hits) arrives as data === null.
  const ids = unique(
    (search.data?.result_set ?? [])
      .map((r) => str(r.identifier)?.toUpperCase())
      .filter((r): r is string => !!r && r !== selfId)
  ).slice(0, MAX_RELATED);
  if (!ids.length) return { accession, related: [], failed: [] };

  const related: RelatedEntry[] = ids.map((id) => ({ id }));
  const titleBudget = withBudget();
  const titles = titleBudget
    ? await rcsbGraphql<RawEntriesData>(ENTRIES_QUERY, { ids }, titleBudget)
    : ({ ok: false, message: 'Time budget exhausted' } as const);
  if (!titles.ok) return { accession, related, failed: ['relatedTitles'] };

  const byId = new Map(
    (titles.data.entries ?? []).filter(isDefined).map((e) => [e.rcsb_id?.toUpperCase(), e])
  );
  for (const entry of related) {
    const raw = byId.get(entry.id);
    if (!raw) continue;
    entry.title = str(raw.struct?.title);
    entry.resolution = num(raw.rcsb_entry_info?.resolution_combined?.[0]);
    entry.method = str(raw.exptl?.[0]?.method);
  }
  return { accession, related, failed: [] };
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}
