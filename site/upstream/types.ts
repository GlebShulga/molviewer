/**
 * Normalized result types for the upstream data layer used by the SEO landing
 * pages (/pdb/:id and /af/:id). Everything here is raw data: strings are NOT
 * HTML-escaped, the renderer is responsible for escaping.
 *
 * Conventions:
 * - Optional fields are omitted (undefined) when the upstream did not provide them.
 * - List fields are always arrays (possibly empty) so renderers can check `.length`.
 * - Dates are ISO calendar dates `YYYY-MM-DD` (time part stripped).
 */

/** Options accepted by every upstream fetcher. */
export interface UpstreamOptions {
  /** Injected fetch, defaults to the global `fetch`. Tests pass a fixture server here. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds (default 4000). */
  timeoutMs?: number;
}

/**
 * Three-way outcome of a landing-page lookup.
 * - `ok`: the primary source knows the entry; `data` may still be partial (see `partial`).
 * - `not-found`: the primary source says the entry does not exist (page should 404).
 * - `error`: the primary source was unreachable, timed out or returned 5xx
 *   (page should still render with defaults and HTTP 200).
 */
export type UpstreamResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// PDB
// ---------------------------------------------------------------------------

export type PdbResult = UpstreamResult<PdbDetails>;

/**
 * Optional sections of a PDB result that can fail independently of the core entry.
 * - `entities`: RCSB GraphQL polymer/ligand query failed (entities and ligands are empty).
 * - `pdbeSecondaryStructure`: PDBe secondary structure API failed (timeout, 5xx, bad JSON).
 *   The RCSB fallback was attempted; see `secondaryStructure.source`.
 * - `rcsbSecondaryStructure`: the RCSB fallback also failed (secondaryStructure is undefined).
 * - `related`: RCSB Search API failed (related is empty).
 * - `relatedTitles`: related IDs are present but titles/resolutions could not be fetched.
 * - `alphafold`: an AlphaFold DB availability check failed (that accession is left out of `alphafoldIds`).
 */
export type PdbPart =
  | 'entities'
  | 'pdbeSecondaryStructure'
  | 'rcsbSecondaryStructure'
  | 'related'
  | 'relatedTitles'
  | 'alphafold';

/** Primary citation of a PDB entry. */
export interface Citation {
  title?: string;
  /** Author names as deposited, e.g. "Oefner, C.". */
  authors: string[];
  /** Journal abbreviation, e.g. "J Mol Biol" (RCSB normalized form when available). */
  journal?: string;
  year?: number;
  volume?: string;
  pageFirst?: string;
  pageLast?: string;
  pubmedId?: number;
  doi?: string;
}

/** RCSB polymer type, normalized. */
export type PolymerType = 'protein' | 'DNA' | 'RNA' | 'NA-hybrid' | 'other';

/** One polymer entity (a distinct macromolecule, possibly present as several chains). */
export interface PolymerEntity {
  /** Entity id within the entry, e.g. "1". */
  entityId: string;
  /** `rcsb_polymer_entity.pdbx_description`, e.g. "Hemoglobin subunit alpha". */
  description?: string;
  /** AUTHOR chain ids (auth_asym_id), e.g. ["A", "C"]. These match what users see in viewers. */
  chainIds: string[];
  /** Source organism scientific names (deduplicated). */
  organisms: string[];
  /** UniProt accessions mapped to this entity. */
  uniprotIds: string[];
  /** Canonical one-letter sequence (`pdbx_seq_one_letter_code_can`), newlines removed. */
  sequence?: string;
  /** Sample sequence length (number of residues in the entity sequence). */
  length?: number;
  type: PolymerType;
}

/** One non-polymer entity (ligand, cofactor, metal ion). */
export interface Ligand {
  /** Chemical Component Dictionary id, e.g. "HEM", "ZN". */
  id: string;
  /** Component name, e.g. "PROTOPORPHYRIN IX CONTAINING FE". */
  name?: string;
  /** Formula as in the CCD, e.g. "C34 H32 Fe N4 O4". */
  formula?: string;
  /** Formula weight in Daltons (g/mol). */
  formulaWeight?: number;
  /** Number of copies of this ligand in the deposited model. */
  instanceCount: number;
  /** AUTHOR chain ids the ligand copies are assigned to. */
  chainIds: string[];
}

/** A residue position. Which numbering it uses is given by `SecondaryStructure.numbering`. */
export interface ResidueRef {
  /** Residue number (author `auth_seq_id` or label `label_seq_id`). */
  number: number;
  /** PDB insertion code, e.g. "A" in "60A". Only set for author numbering. */
  insertionCode?: string;
}

/** A contiguous helix or strand segment. */
export interface SsSegment {
  start: ResidueRef;
  end: ResidueRef;
  /**
   * 1-based positions in the entity sequence (label_seq_id). Always present, whatever
   * `numbering` says, so the renderer can highlight the segment in `PolymerEntity.sequence`.
   */
  seqStart: number;
  seqEnd: number;
  /** Number of residues in the segment (seqEnd - seqStart + 1). */
  length: number;
}

/** A beta strand, with the sheet it belongs to. */
export interface Strand extends SsSegment {
  /** Sheet identifier as a string, e.g. "1" (PDBe numeric id or the number in RCSB "S1"). */
  sheetId?: string;
}

/** Secondary structure of one chain. Segments are sorted by sequence position. */
export interface ChainSecondaryStructure {
  /** AUTHOR chain id. */
  chainId: string;
  entityId?: string;
  helices: SsSegment[];
  strands: Strand[];
}

/**
 * Secondary structure of the whole entry.
 * - `source: 'pdbe'` comes from the PDBe API and uses AUTHOR numbering (with insertion codes).
 * - `source: 'rcsb'` is the fallback from RCSB `rcsb_polymer_instance_feature` (SHEET, HELIX_P),
 *   which only provides label_seq_id positions, so `numbering` is 'label' there.
 * Chains without any helix or strand are omitted, so `chains` may be empty
 * (e.g. nucleic-acid-only entries).
 */
export interface SecondaryStructure {
  source: 'pdbe' | 'rcsb';
  numbering: 'author' | 'label';
  chains: ChainSecondaryStructure[];
}

/** Another PDB entry that shares the reference UniProt accession. */
export interface RelatedEntry {
  id: string;
  title?: string;
  /** Best resolution in Angstrom, when applicable. */
  resolution?: number;
  /** Experimental method, e.g. "X-RAY DIFFRACTION". */
  method?: string;
}

/**
 * The first biological assembly (RCSB assembly 1): the functional molecule.
 * It can be bigger than the deposited model (1HHO's file has one alpha-beta
 * pair; the assembly is the tetramer) or smaller (several copies in the crystal).
 */
export interface AssemblyInfo {
  /** Polymer chains in the assembly, e.g. 4. */
  chainCount?: number;
  /** e.g. "tetrameric". */
  oligomericDetails?: string;
  /** Global symmetry, e.g. "Hetero 4-mer". */
  oligomericState?: string;
  /** e.g. ["A2", "B2"]. */
  stoichiometry: string[];
}

/** Everything the /pdb/:id landing page needs. */
export interface PdbDetails {
  /** Upper-case PDB id, e.g. "3DNI". */
  id: string;
  /** `struct.title`. */
  title?: string;
  /** `struct.pdbx_descriptor` (absent on most modern entries). */
  descriptor?: string;
  /** `struct_keywords.pdbx_keywords`, e.g. "ENDONUCLEASE". */
  keywords?: string;
  /** First experimental method, e.g. "X-RAY DIFFRACTION", "ELECTRON MICROSCOPY", "SOLUTION NMR". */
  method?: string;
  /** All experimental methods (hybrid entries have several). */
  methods: string[];
  /** Best resolution in Angstrom (`rcsb_entry_info.resolution_combined[0]`). Absent for NMR. */
  resolution?: number;
  depositDate?: string;
  releaseDate?: string;
  /** Date of the latest revision. */
  revisionDate?: string;
  /** Deposited atom count (includes solvent). */
  atomCount?: number;
  /** Number of deposited models (NMR ensembles have many). */
  modelCount?: number;
  polymerEntityCount?: number;
  proteinEntityCount?: number;
  nucleicAcidEntityCount?: number;
  nonpolymerEntityCount?: number;
  /** Number of polymer chains (instances) in the deposited model. */
  polymerChainCount?: number;
  /** Total molecular weight in kDa. */
  molecularWeight?: number;
  citation?: Citation;
  /** Polymer entities in entity-id order. Empty when `partial` includes 'entities'. */
  entities: PolymerEntity[];
  /** Undefined when RCSB lists no assembly or the entities query failed. */
  assembly?: AssemblyInfo;
  /** Ligands, excluding water and common crystallization additives (see `excludedLigandIds`). */
  ligands: Ligand[];
  /** CCD ids that were present but filtered out as water/additives, e.g. ["SO4", "GOL"]. */
  excludedLigandIds: string[];
  /** Undefined when both PDBe and the RCSB fallback failed. */
  secondaryStructure?: SecondaryStructure;
  /** UniProt accession used to find related entries (first protein entity with one). */
  relatedUniprotId?: string;
  /** Up to 12 other entries with the same UniProt accession, best resolution first. */
  related: RelatedEntry[];
  /**
   * UniProt accessions of this entry that AlphaFold DB confirmed it has a
   * model for. Only these get /af/ links: many accessions (viral proteins,
   * very long proteins) have no model, and /af/:id would be a 404.
   */
  alphafoldIds: string[];
  /** Which optional sections failed. Empty on a full success. */
  partial: PdbPart[];
}

// ---------------------------------------------------------------------------
// AlphaFold
// ---------------------------------------------------------------------------

export type AfResult = UpstreamResult<AfDetails>;

/**
 * Optional sections of an AlphaFold result that can fail independently.
 * - `uniprot`: UniProt REST failed (timeout, 5xx); `uniprot` is undefined and `pdbStructures` empty.
 */
export type AfPart = 'uniprot';

/** Fraction of residues in each AlphaFold pLDDT band (0..1). */
export interface PlddtFractions {
  /** pLDDT > 90 */
  veryHigh: number;
  /** 70 < pLDDT <= 90 */
  confident: number;
  /** 50 < pLDDT <= 70 */
  low: number;
  /** pLDDT <= 50 */
  veryLow: number;
}

/** Annotation pulled from UniProtKB. */
export interface UniProtAnnotation {
  /** Recommended full name (or first submission name). */
  proteinName?: string;
  organism?: string;
  organismCommonName?: string;
  /** Primary gene name (first gene). */
  geneName?: string;
  length?: number;
  /** First FUNCTION comment text. */
  functionText?: string;
  /** First SUBUNIT comment text. */
  subunit?: string;
  subcellularLocations: string[];
  /** Disease names, formatted "Name (ACRONYM)" when an acronym exists. */
  diseases: string[];
}

/** An experimental PDB structure cross-referenced from UniProt. */
export interface UniProtPdbXref {
  /** Upper-case PDB id. */
  id: string;
  /** UniProt's short method label, e.g. "X-ray", "EM", "NMR". */
  method?: string;
  /** Resolution in Angstrom, when applicable. */
  resolution?: number;
  /** Raw UniProt chains string, e.g. "A/C=2-142". */
  chains?: string;
  /** Chain ids parsed from `chains`, e.g. ["A", "C"]. */
  chainIds: string[];
}

/** Everything the /af/:id landing page needs. */
export interface AfDetails {
  /** Upper-case UniProt accession, e.g. "P69905". */
  id: string;
  /** e.g. "AF-P69905-F1". */
  modelEntityId?: string;
  /** Protein name: AlphaFold `uniprotDescription`, falling back to UniProt. */
  description?: string;
  /** Gene name: AlphaFold `gene`, falling back to UniProt. */
  gene?: string;
  /** Organism: AlphaFold `organismScientificName`, falling back to UniProt. */
  organism?: string;
  taxId?: number;
  modelCreatedDate?: string;
  latestVersion?: number;
  /** Modelled sequence length. */
  sequenceLength?: number;
  /** Mean pLDDT over the model (0..100). */
  meanPlddt?: number;
  /** Undefined when the API response does not include the band fractions. */
  plddtFractions?: PlddtFractions;
  /** Undefined when UniProt failed, has no entry, or the accession is inactive. */
  uniprot?: UniProtAnnotation;
  /** Up to 20 experimental PDB structures from UniProt, best resolution first. */
  pdbStructures: UniProtPdbXref[];
  /** Total number of PDB cross-references before the cap. */
  pdbStructureCount: number;
  /** Which optional sections failed. Empty on a full success. */
  partial: AfPart[];
}
