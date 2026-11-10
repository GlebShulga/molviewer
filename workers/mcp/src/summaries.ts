/**
 * Compact, model-facing summaries of the landing-page data
 * (site/upstream). Kept to a few KB: no coordinates, sequences only on
 * request and capped.
 */
import type { AfDetails, ChainSecondaryStructure, Citation, PdbDetails } from '../../../site/upstream/types';
import type { PubchemCompound } from '../../../site/upstream/pubchem';
import { COMPOUND_CATEGORY_LABELS, type Compound, type CompoundCategory } from '../../../site/dataTypes';
import { shortName } from '../../../site/render/pdbPage';
import { toSentenceCase } from '../../../site/render/sentenceCase';
import { formatMethod, formatRange } from '../../../site/render/format';
import { SITE_ORIGIN } from '../../../site/nav';
import { structurePath } from '../../../site/routes';

// Caps that keep answers small for entries with hundreds of chains (ribosomes,
// virus capsids). Whatever they cut is noted in a `truncated` field.
const MAX_SEQUENCE = 2000;
const MAX_LIGANDS = 20;
const MAX_ENTITIES = 12;
const MAX_ORGANISMS = 10;
/** Chain IDs in one list (an entity's or a ligand's chains). */
const MAX_CHAIN_IDS = 20;
/** The secondaryStructure section: each chain and each helix or strand counts 1. */
const MAX_SS_ITEMS = 600;
const MAX_SECTION_LIGANDS = 50;

/**
 * What the caps cut, keyed by the top-level field each note describes, so a
 * section that replaces a summary field also replaces its note. A Set, because
 * a per-item cap fires once for every item over it.
 */
type Notes = Record<string, Set<string>>;

function addNote(notes: Notes, field: string, text: string): void {
  (notes[field] ??= new Set()).add(text);
}

/** The first `max` items; when there are more, "first 10 of 34" goes under `field`. */
function capped<T>(items: T[], max: number, notes: Notes, field: string): T[] {
  if (items.length <= max) return items;
  addNote(notes, field, `first ${max} of ${items.length}`);
  return items.slice(0, max);
}

/** One item's chain IDs, at most MAX_CHAIN_IDS: "chains: at most 20 per ligand" goes under `field`. */
function cappedChains(ids: string[], notes: Notes, field: string, per: string): string[] {
  if (ids.length <= MAX_CHAIN_IDS) return ids;
  addNote(notes, field, `chains: at most ${MAX_CHAIN_IDS} per ${per}`);
  return ids.slice(0, MAX_CHAIN_IDS);
}

/** One entity's sequence, at most MAX_SEQUENCE residues and then "...". */
function cappedSequence(sequence: string | undefined, notes: Notes): string | undefined {
  if (!sequence || sequence.length <= MAX_SEQUENCE) return sequence;
  addNote(notes, 'sequences', `residues: at most ${MAX_SEQUENCE} per sequence`);
  return `${sequence.slice(0, MAX_SEQUENCE)}...`;
}

/** `truncated`: one sentence per field, e.g. { ligands: "first 50 of 80; chains: at most 20 per ligand" }. */
function truncatedOf(notes: Notes): Record<string, string> | undefined {
  const entries = Object.entries(notes).filter(([, s]) => s.size > 0);
  return entries.length ? Object.fromEntries(entries.map(([field, s]) => [field, [...s].join('; ')])) : undefined;
}

function withTruncated<T extends object>(value: T, notes: Notes): T & { truncated?: Record<string, string> } {
  const truncated = truncatedOf(notes);
  return truncated ? { ...value, truncated } : value;
}

/**
 * get_structure_details: the summary plus its extra sections. A section that
 * replaces a summary field (the full `ligands` list) also replaces that
 * field's note, so a list the section gives in full is not noted as cut.
 */
export function withSections(summary: object, extra: Record<string, unknown>): Record<string, unknown> {
  const { truncated: summaryNotes, ...rest } = summary as { truncated?: Record<string, string> };
  const { truncated: sectionNotes, ...sections } = extra as { truncated?: Record<string, string> };
  const truncated: Record<string, string> = { ...summaryNotes };
  for (const field of Object.keys(sections)) delete truncated[field];
  Object.assign(truncated, sectionNotes);
  return { ...rest, ...sections, ...(Object.keys(truncated).length ? { truncated } : {}) };
}

/** Helices and strands in the whole entry. */
function ssTotals(ss: { chains: ChainSecondaryStructure[] }): { helices: number; strands: number } {
  return {
    helices: ss.chains.reduce((n, c) => n + c.helices.length, 0),
    strands: ss.chains.reduce((n, c) => n + c.strands.length, 0),
  };
}

/**
 * Secondary-structure ranges within MAX_SS_ITEMS, chains in the parser's order
 * (sorted by chain ID): helices, then strands, until the budget runs out. A
 * chain goes in only when at least one of its ranges fits too, since a chain
 * with empty lists would read as "no secondary structure" (the parsers drop
 * chains without ranges, so every chain needs 2 or more). The chain cut
 * partway is noted with counts ("chain X: 39 of 40 helices, 0 of 15 strands"),
 * so a list it cut to empty doesn't read that way either.
 */
function ssChains(chains: ChainSecondaryStructure[], notes: Notes) {
  let left = MAX_SS_ITEMS;
  let partly: string | undefined;
  const out: { chain: string; helices: string[]; strands: string[] }[] = [];
  for (const c of chains) {
    if (left < 2) break;
    left -= 1;
    const helices = c.helices.slice(0, left);
    left -= helices.length;
    const strands = c.strands.slice(0, left);
    left -= strands.length;
    const cut = [
      helices.length < c.helices.length && `${helices.length} of ${c.helices.length} helices`,
      strands.length < c.strands.length && `${strands.length} of ${c.strands.length} strands`,
    ].filter(Boolean);
    if (cut.length) partly = `chain ${c.chainId}: ${cut.join(', ')}`;
    out.push({
      chain: c.chainId,
      helices: helices.map(formatRange),
      strands: strands.map((s) => (s.sheetId ? `${formatRange(s)} (sheet ${s.sheetId})` : formatRange(s))),
    });
  }
  const parts = [out.length < chains.length && `ranges for ${out.length} of ${chains.length} chains`, partly];
  const note = parts.filter(Boolean).join('; ');
  if (note) addNote(notes, 'secondaryStructure', note);
  return out;
}

export function pdbPageUrl(id: string): string {
  return `${SITE_ORIGIN}${structurePath({ kind: 'pdb', id })}`;
}

export function afPageUrl(id: string): string {
  return `${SITE_ORIGIN}${structurePath({ kind: 'af', id })}`;
}

export function compoundPageUrl(c: { slug?: string; cid: number }): string {
  return `${SITE_ORIGIN}${structurePath(c.slug ? { kind: 'compound', slug: c.slug } : { kind: 'cid', cid: c.cid })}`;
}

/** "Oefner C, Suck D (1986) Title. J Mol Biol 192:605-632. doi:..." */
export function formatCitation(c: Citation | undefined): string | undefined {
  if (!c?.title) return undefined;
  const authors = c.authors.length > 3 ? `${c.authors.slice(0, 3).join(', ')} et al.` : c.authors.join(', ');
  const pages = c.pageFirst ? `:${c.pageFirst}${c.pageLast ? `-${c.pageLast}` : ''}` : '';
  const where = [c.journal, c.volume ? `${c.volume}${pages}` : ''].filter(Boolean).join(' ');
  return [
    authors && `${authors}${c.year ? ` (${c.year})` : ''}`,
    c.title.replace(/\.$/, '') + '.',
    where && `${where}.`,
    c.doi && `doi:${c.doi}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * When the deposited model isn't the whole biological molecule, say so
 * plainly: the viewer shows the deposited chains, and the model otherwise
 * describes "a tetramer" over a picture of two chains (1HHO).
 */
export function assemblyNote(d: Pick<PdbDetails, 'assembly' | 'polymerChainCount'>): string | undefined {
  const deposited = d.polymerChainCount;
  const assembled = d.assembly?.chainCount;
  if (!deposited || !assembled || deposited === assembled) return undefined;
  const what = d.assembly?.oligomericDetails ?? `${assembled}-chain`;
  if (deposited < assembled) {
    return (
      `This entry's file contains ${deposited} of the ${assembled} chains of the biological assembly (${what}); ` +
      `the rest is generated by crystallographic symmetry. The viewer shows the ${deposited} deposited chains, so describe ` +
      `the picture as ${deposited} chains, part of a ${what} molecule.`
    );
  }
  return (
    `This entry's file contains ${deposited} chains, more than the biological assembly (${what}, ${assembled} chains): ` +
    `the crystal holds several copies of the molecule, and the viewer shows all ${deposited} chains.`
  );
}

/** "A, B, C" for a few chains; a capsid's hundreds end in "..., and 280 more". */
function chainList(ids: string[]): string {
  if (ids.length <= MAX_CHAIN_IDS) return ids.join(', ');
  return `${ids.slice(0, MAX_CHAIN_IDS).join(', ')}, and ${ids.length - MAX_CHAIN_IDS} more`;
}

/**
 * One-paragraph facts for the tool's text content. Models tend to stay silent
 * after a widget renders unless the text gives them something to say, so the
 * essentials go here too, not only in structuredContent.
 */
export function pdbFacts(d: PdbDetails): string {
  const method = d.method ? formatMethod(d.method) : undefined;
  const parts = [
    `${shortName(d)} (PDB ${d.id})`,
    method && (d.resolution ? `${method} at ${d.resolution} Å` : method),
    d.releaseDate && `released ${d.releaseDate.slice(0, 4)}`,
    [...new Set(d.entities.flatMap((e) => e.organisms))].slice(0, 3).join(', ') || undefined,
  ].filter(Boolean);
  const chains = d.entities
    .slice(0, MAX_ENTITIES)
    .map((e) => `${e.description ? toSentenceCase(e.description) : `entity ${e.entityId}`} (chain${e.chainIds.length > 1 ? 's' : ''} ${chainList(e.chainIds)})`)
    .join('; ');
  const ligands = d.ligands
    .slice(0, 6)
    .map((l) => `${l.id}${l.name ? ` (${toSentenceCase(l.name)})` : ''}${l.instanceCount > 1 ? ` x${l.instanceCount}` : ''}`)
    .join(', ');
  return [
    `${parts.join(', ')}.`,
    d.polymerChainCount ? `${d.polymerChainCount} polymer chain${d.polymerChainCount === 1 ? '' : 's'} in the file: ${chains}.` : chains && `Chains: ${chains}.`,
    ligands && `Ligands: ${ligands}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function afFacts(d: AfDetails): string {
  const f = d.plddtFractions;
  return [
    `AlphaFold model of ${d.description ?? d.uniprot?.proteinName ?? d.id}${d.gene ? ` (${d.gene})` : ''}${d.organism ? `, ${d.organism}` : ''}, UniProt ${d.id}`,
    d.sequenceLength && `${d.sequenceLength} residues`,
    d.meanPlddt !== undefined && `mean pLDDT ${d.meanPlddt.toFixed(1)}`,
    f &&
      `${percent(f.veryHigh)}% very high (>90), ${percent(f.confident)}% confident (70-90), ${percent(f.low)}% low (50-70), ${percent(f.veryLow)}% very low (<50, often disordered)`,
  ]
    .filter(Boolean)
    .join(', ')
    .concat('.');
}

/** Other names worth mentioning: synonyms that differ from the name, at most four. */
function otherNames(c: { name?: string; synonyms?: string[] }): string[] {
  const seen = new Set([c.name?.toLowerCase()]);
  return (c.synonyms ?? []).filter((s) => !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).slice(0, 4);
}

/**
 * Compounds give the model little to say beyond a formula, and ChatGPT tends
 * to stay silent after their viewer, so catalog compounds add their category
 * and other names (caffeine: stimulant, also called theine, guaranine).
 */
export function compoundFacts(c: {
  name?: string;
  title?: string;
  formula?: string;
  weight?: string;
  iupac?: string;
  cid: number;
  category?: CompoundCategory;
  synonyms?: string[];
}): string {
  const name = c.name ?? c.title ?? `PubChem CID ${c.cid}`;
  const aka = otherNames(c);
  return [
    `${name} (PubChem CID ${c.cid})`,
    c.category && `MolViewer catalog category: ${COMPOUND_CATEGORY_LABELS[c.category].toLowerCase()}`,
    aka.length > 0 && `also known as ${aka.join(', ')}`,
    c.formula && `formula ${c.formula}`,
    c.weight && `${c.weight} g/mol`,
    c.iupac && `IUPAC name ${c.iupac}`,
  ]
    .filter(Boolean)
    .join('; ')
    .concat('.');
}

// ---------------------------------------------------------------------------
// Captions: one line of key facts shown in the viewer (WidgetPayload.caption)
// ---------------------------------------------------------------------------

const SEP = ' · ';

/** Non-breaking space: keeps a number with its unit when the caption wraps ("3 chains", "2.8 Å"). */
const NB = String.fromCharCode(0xa0);

/** "X-ray", "cryo-EM", "NMR": short enough for a caption. */
function shortMethod(method: string | undefined): string | undefined {
  if (!method) return undefined;
  const m = method.toUpperCase();
  if (m.includes('X-RAY')) return 'X-ray';
  if (m.includes('ELECTRON MICROSCOPY') || m.includes('CRYO')) return 'cryo-EM';
  if (m.includes('NMR')) return 'NMR';
  if (m.includes('NEUTRON')) return 'neutron';
  return formatMethod(method);
}

export function pdbCaption(d: PdbDetails): string {
  const method = shortMethod(d.method);
  const deposited = d.polymerChainCount;
  const assembled = d.assembly?.chainCount;
  const chains = !deposited
    ? undefined
    : assembled && assembled > deposited
      ? `${deposited}${NB}of${NB}${assembled}${NB}chains (${d.assembly?.oligomericDetails ?? 'assembly'})`
      : `${deposited}${NB}chain${deposited === 1 ? '' : 's'}`;
  return [d.id, shortName(d), method && (d.resolution ? `${method}${NB}${d.resolution}${NB}Å` : method), chains].filter(Boolean).join(SEP);
}

export function afCaption(d: AfDetails): string {
  const protein = d.description ?? d.uniprot?.proteinName;
  // Confidence before organism: if the line is cut, the number survives.
  return [
    `AlphaFold ${d.id}`,
    protein && (d.gene ? `${protein} (${d.gene})` : protein),
    d.meanPlddt !== undefined && `mean${NB}pLDDT${NB}${Math.round(d.meanPlddt)}`,
    d.organism,
  ]
    .filter(Boolean)
    .join(SEP);
}

export function compoundCaption(c: { name?: string; title?: string; formula?: string; weight?: string; cid: number; category?: CompoundCategory }): string {
  return [
    c.name ?? c.title ?? `PubChem CID ${c.cid}`,
    c.formula,
    c.weight && `${c.weight}${NB}g/mol`,
    c.category && COMPOUND_CATEGORY_LABELS[c.category].toLowerCase(),
  ]
    .filter(Boolean)
    .join(SEP);
}

export function pdbSummary(d: PdbDetails) {
  const ss = d.secondaryStructure;
  const notes: Notes = {};
  return withTruncated({
    kind: 'pdb' as const,
    id: d.id,
    name: shortName(d),
    title: d.title ? toSentenceCase(d.title) : undefined,
    method: d.method ? formatMethod(d.method) : undefined,
    resolutionAngstrom: d.resolution,
    releaseYear: d.releaseDate ? Number(d.releaseDate.slice(0, 4)) : undefined,
    organisms: capped([...new Set(d.entities.flatMap((e) => e.organisms))], MAX_ORGANISMS, notes, 'organisms'),
    /** Chains in the file, which is what the viewer shows. */
    polymerChainCount: d.polymerChainCount,
    biologicalAssembly: d.assembly
      ? {
          chains: d.assembly.chainCount,
          description: d.assembly.oligomericDetails,
          symmetry: d.assembly.oligomericState,
          stoichiometry: d.assembly.stoichiometry,
        }
      : undefined,
    chainsNote: assemblyNote(d),
    molecularWeightKda: d.molecularWeight,
    entities: capped(d.entities, MAX_ENTITIES, notes, 'entities').map((e) => ({
      description: e.description ? toSentenceCase(e.description) : undefined,
      type: e.type,
      // The count stays when `chains` is cut: a capsid's 60 coat-protein copies
      chainCount: e.chainIds.length,
      chains: cappedChains(e.chainIds, notes, 'entities', 'entity'),
      length: e.length,
      uniprot: e.uniprotIds,
    })),
    ligands: capped(d.ligands, MAX_LIGANDS, notes, 'ligands').map((l) => ({
      id: l.id,
      name: l.name ? toSentenceCase(l.name) : undefined,
      copies: l.instanceCount,
    })),
    secondaryStructure: ss ? ssTotals(ss) : undefined,
    alphafoldModels: d.alphafoldIds,
    citation: formatCitation(d.citation),
    pageUrl: pdbPageUrl(d.id),
  }, notes);
}

function percent(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

export function afSummary(d: AfDetails) {
  const f = d.plddtFractions;
  return {
    kind: 'alphafold' as const,
    id: d.id,
    protein: d.description ?? d.uniprot?.proteinName,
    gene: d.gene,
    organism: d.organism,
    sequenceLength: d.sequenceLength,
    meanPlddt: d.meanPlddt,
    confidencePercent: f
      ? { veryHighAbove90: percent(f.veryHigh), confident70to90: percent(f.confident), low50to70: percent(f.low), veryLowBelow50: percent(f.veryLow) }
      : undefined,
    colorKey:
      'AlphaFold DB colors: dark blue = very high (pLDDT > 90), light blue = confident (70-90), yellow = low (50-70), orange = very low (< 50, often disordered).',
    experimentalStructures: d.pdbStructures.slice(0, 8).map((x) => x.id),
    experimentalStructureCount: d.pdbStructureCount,
    citation:
      'Jumper J et al. (2021) Highly accurate protein structure prediction with AlphaFold. Nature 596:583-589; Varadi M et al. AlphaFold Protein Structure Database. Nucleic Acids Res.',
    pageUrl: afPageUrl(d.id),
  };
}

export function compoundSummary(c: Compound | (PubchemCompound & { slug?: string })) {
  const curated = 'name' in c;
  return {
    kind: 'compound' as const,
    cid: c.cid,
    slug: c.slug,
    name: curated ? c.name : c.title,
    category: curated ? COMPOUND_CATEGORY_LABELS[c.category] : undefined,
    otherNames: curated ? otherNames(c) : undefined,
    formula: c.formula,
    molecularWeight: c.weight ? `${c.weight} g/mol` : undefined,
    iupacName: c.iupac,
    smiles: c.smiles,
    pageUrl: compoundPageUrl(c),
  };
}

export type DetailSection = 'secondaryStructure' | 'sequence' | 'ligands' | 'citation' | 'related';

/** Extra sections for get_structure_details on a PDB entry. */
export function pdbSections(d: PdbDetails, sections: DetailSection[]) {
  const out: Record<string, unknown> = {};
  const notes: Notes = {};
  if (sections.includes('secondaryStructure')) {
    const ss = d.secondaryStructure;
    out.secondaryStructure = ss
      ? {
          source: ss.source === 'pdbe' ? 'PDBe' : 'RCSB',
          numbering:
            ss.numbering === 'author'
              ? 'Author residue numbers, as shown in the PDB file and viewers'
              : 'Sequence positions (label_seq_id), because only the RCSB fallback was available',
          // This replaces the summary's totals, and `chains` may be cut, so the totals stay here
          ...ssTotals(ss),
          chains: ssChains(ss.chains, notes),
        }
      : 'Not available: both PDBe and RCSB failed to answer.';
  }
  if (sections.includes('sequence')) {
    out.sequences = capped(d.entities, MAX_ENTITIES, notes, 'sequences').map((e) => ({
      description: e.description,
      chainCount: e.chainIds.length,
      chains: cappedChains(e.chainIds, notes, 'sequences', 'sequence'),
      length: e.length,
      sequence: cappedSequence(e.sequence, notes),
    }));
  }
  if (sections.includes('ligands')) {
    out.ligands = capped(d.ligands, MAX_SECTION_LIGANDS, notes, 'ligands').map((l) => ({
      id: l.id,
      name: l.name ? toSentenceCase(l.name) : undefined,
      formula: l.formula,
      copies: l.instanceCount,
      chains: cappedChains(l.chainIds, notes, 'ligands', 'ligand'),
    }));
    out.excludedAdditives = d.excludedLigandIds;
  }
  // `citation` (the formatted string) is already in the summary; this adds the identifiers.
  // It must not reuse the `citation` key: the output schema declares that one as a string.
  if (sections.includes('citation') && d.citation) {
    out.citationIds = { pubmedId: d.citation.pubmedId, doi: d.citation.doi };
  }
  if (sections.includes('related')) {
    out.related = d.related.map((r) => ({
      id: r.id,
      title: r.title ? toSentenceCase(r.title) : undefined,
      method: r.method ? formatMethod(r.method) : undefined,
      resolutionAngstrom: r.resolution,
    }));
  }
  if (d.partial.length) out.unavailableParts = d.partial;
  return withTruncated(out, notes);
}

/** Extra sections for get_structure_details on an AlphaFold model. */
export function afSections(d: AfDetails, sections: DetailSection[]) {
  const out: Record<string, unknown> = {};
  const u = d.uniprot;
  if (u) {
    out.function = u.functionText;
    out.subunit = u.subunit;
    out.subcellularLocations = u.subcellularLocations;
    out.diseases = u.diseases;
  }
  if (sections.includes('related')) {
    out.experimentalStructures = d.pdbStructures.map((x) => ({
      id: x.id,
      method: x.method,
      resolutionAngstrom: x.resolution,
      chains: x.chains,
    }));
  }
  if (sections.includes('secondaryStructure') || sections.includes('ligands')) {
    out.note =
      'AlphaFold models have no deposited secondary structure or ligands. Ask about an experimental PDB entry from experimentalStructures for those.';
  }
  if (d.partial.length) out.unavailableParts = d.partial;
  return out;
}
