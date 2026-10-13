/**
 * Search over the curated catalogs in data/*.json: 455 PDB entries, 107
 * AlphaFold models, 988 compounds and the collections that label them. Fast
 * (no network) and the best answer for common names ("hemoglobin",
 * "caffeine"), so find_structures asks it first.
 */
import pdbData from '../../../data/popularPdbs.json';
import afData from '../../../data/alphafold.json';
import compoundData from '../../../data/compounds.json';
import { COLLECTIONS } from '../../../site/collections';
import type { AfSeed, Compound, PdbSeed } from '../../../site/dataTypes';
import { toSentenceCase } from '../../../site/render/sentenceCase';
import { formatMethod, formatResolution } from '../../../site/render/format';
import { SITE_ORIGIN } from '../../../site/nav';
import { structurePath } from '../../../site/routes';
import type { AppKind } from '../../../site/appContract';
import { UNIPROT_RE } from '../../../site/identifiers';
import { hasPart } from '../../../site/upstream/text';

export const PDB_SEEDS: PdbSeed[] = (pdbData as { pdbs: PdbSeed[] }).pdbs;
export const AF_SEEDS: AfSeed[] = (afData as { entries: AfSeed[] }).entries;
export const COMPOUNDS: Compound[] = (compoundData as { compounds: Compound[] }).compounds;

export interface FoundStructure {
  kind: AppKind;
  /** PDB id, UniProt accession, or compound slug (catalog) / CID (PubChem). */
  id: string;
  title: string;
  /** Method and resolution, organism and gene, or formula. */
  subtitle?: string;
  /** Why this result matched, e.g. "Curated: Human deoxyhemoglobin". */
  why: string;
  pageUrl: string;
}

/** Words that describe the request rather than the structure. */
const STOPWORDS = new Set(
  (
    'a an the of in on for and or with me show display view render see open find get look looks like what does do is ' +
    'its it 3d structure structures molecule molecules molecular model models protein proteins pdb entry entries ' +
    'alphafold af prediction predicted compound compounds chemical please ' +
    'ball stick sticks spacefill wireframe cartoon style rendering interactive rotating image picture diagram'
  ).split(' ')
);

export function queryTokens(query: string): string[] {
  return normalize(query)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
}

/** What a search query looks like, for analytics (the text itself is never stored). */
export type QueryShape =
  | 'non_latin'
  | 'stopwords_only'
  | 'cid'
  | 'pdb_id'
  | 'uniprot'
  | 'formula'
  | 'smiles'
  | 'w1_2'
  | 'w3_4'
  | 'w5plus';

const ELEMENTS = new Set(
  (
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr ' +
    'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt ' +
    'Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr'
  ).split(' ')
);

/** H2O, C8H10N4O2: element symbols with counts, at least one digit. ATP, EGFR, BRCA1 are not. */
function isFormula(text: string): boolean {
  if (!/^([A-Z][a-z]?\d*)+$/.test(text) || !/\d/.test(text)) return false;
  return [...text.matchAll(/([A-Z][a-z]?)\d*/g)].every((m) => ELEMENTS.has(m[1]));
}

/**
 * The first class that fits, in this order. Mixed text ("белок p53",
 * "γ-secretase") is not non_latin: its Latin part still searches.
 */
export function queryShape(query: string): QueryShape {
  const q = query.trim();
  if (/\p{L}/u.test(q) && !/[a-z]/.test(normalize(q))) return 'non_latin';
  if (!queryTokens(q).length) return 'stopwords_only';
  if (/^(cid[:\s]*)?\d+$/i.test(q)) return 'cid';
  // PDB_ID_RE takes any 4 characters (KRAS, ACE2); real PDB IDs start with a digit.
  if (/^[1-9][A-Za-z0-9]{3}$/.test(q)) return 'pdb_id';
  if (UNIPROT_RE.test(q.toUpperCase())) return 'uniprot';
  if (isFormula(q)) return 'formula';
  if (!/\s/.test(q) && /[=#()[\]@]/.test(q)) return 'smiles';
  const words = compoundNameFrom(q).split(/\s+/).filter(Boolean).length;
  return words <= 2 ? 'w1_2' : words <= 4 ? 'w3_4' : 'w5plus';
}

/**
 * The compound name as the user wrote it, minus request words: "Show me a
 * caffeine molecule in 3D?" -> "caffeine", "show caffeine as a 3D
 * ball-and-stick model" -> "caffeine". Case, digits and punctuation stay
 * ("2,4-dinitrophenol", "Vitamin A"), because PubChem matches names exactly.
 */
export function compoundNameFrom(query: string): string {
  let name = query.trim().replace(/[?!.]+$/, '');
  for (let prev = ''; prev !== name; ) {
    prev = name;
    name = name
      .replace(/^(please\s+|can you\s+|show( me)?\s+|display\s+|draw\s+|view\s+|find\s+|what (does|is)\s+|what's\s+|the\s+|a\s+|an\s+)/i, '')
      .replace(/^(3-?d\s+)?(ball[- ]and[- ]stick\s+|3-?d\s+)?model\s+of\s+/i, '')
      .replace(/\s+(look|looks) like$/i, '')
      .replace(/\s+(in )?3-?d$/i, '')
      .replace(/\s+(molecule|structure|compound|model)$/i, '')
      .replace(
        /\s+(in|as)\s+(a\s+)?(3-?d\s+)?(ball[- ]and[- ]stick|stick|spacefill|space[- ]filling|wireframe)(\s+(model|style|view|representation))?$/i,
        ''
      )
      .trim();
  }
  return name;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // combining accents left by NFKD
    .replace(/β/g, 'beta')
    .replace(/α/g, 'alpha')
    .replace(/haem/g, 'hem')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Entry {
  result: FoundStructure;
  /** Exact-match keys: ids, slug, names, labels, synonyms (normalized). */
  keys: Set<string>;
  /** The entry's own names: id, title, labels, gene, synonyms (normalized). */
  primary: string;
  /** Context: collection titles and notes, organism. */
  secondary: string;
  /** Curated collection items rank above plain catalog entries. */
  curated: boolean;
  /** Position in its first collection (lead items are the canonical examples). */
  rank: number;
}

function pageUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

function buildIndex(): Entry[] {
  const labels = new Map<string, { label: string; note?: string; collection: string; index: number }[]>();
  for (const c of COLLECTIONS) {
    c.items.forEach((item, index) => {
      const key = `${item.type}:${item.id.toUpperCase()}`;
      labels.set(key, [...(labels.get(key) ?? []), { label: item.label, note: item.note, collection: c.title, index }]);
    });
  }

  const entries: Entry[] = [];

  for (const p of PDB_SEEDS) {
    const tags = labels.get(`pdb:${p.id}`) ?? [];
    const title = tags[0]?.label ?? toSentenceCase(p.title);
    const subtitle = p.method
      ? p.resolution
        ? `${formatMethod(p.method)}, ${formatResolution(p.resolution)} Å`
        : formatMethod(p.method)
      : undefined;
    entries.push({
      result: {
        kind: 'pdb',
        id: p.id,
        title,
        subtitle,
        why: tags.length ? `Curated in "${tags[0].collection}"` : 'Popular PDB entry',
        pageUrl: pageUrl(structurePath({ kind: 'pdb', id: p.id })),
      },
      keys: new Set([normalize(p.id), ...tags.map((t) => normalize(t.label))]),
      primary: normalize([p.id, p.title, ...tags.map((t) => t.label)].join(' ')),
      secondary: normalize(tags.flatMap((t) => [t.note ?? '', t.collection]).join(' ')),
      curated: tags.length > 0,
      rank: tags[0]?.index ?? 99,
    });
  }

  for (const a of AF_SEEDS) {
    const tags = labels.get(`af:${a.id}`) ?? [];
    const human = a.organism === 'Homo sapiens' ? 'human' : '';
    const confidence = a.plddt ? `mean pLDDT ${a.plddt.mean.toFixed(1)}` : undefined;
    entries.push({
      result: {
        kind: 'alphafold',
        id: a.id,
        title: tags[0]?.label ?? a.name,
        subtitle: [a.organism, a.gene, confidence].filter(Boolean).join(', ') || undefined,
        why: tags.length ? `Curated in "${tags[0].collection}"` : 'AlphaFold model in the catalog',
        pageUrl: pageUrl(structurePath({ kind: 'af', id: a.id })),
      },
      keys: new Set([normalize(a.id), normalize(a.name), ...(a.gene ? [normalize(a.gene)] : []), ...tags.map((t) => normalize(t.label))]),
      primary: normalize([a.id, a.name, a.gene ?? '', human, ...tags.map((t) => t.label)].join(' ')),
      secondary: normalize([a.organism ?? '', ...tags.map((t) => t.collection)].join(' ')),
      curated: tags.length > 0,
      rank: tags[0]?.index ?? 99,
    });
  }

  for (const c of COMPOUNDS) {
    entries.push({
      result: {
        kind: 'compound',
        id: c.slug,
        title: c.name,
        subtitle: `${c.formula}, ${c.weight} g/mol`,
        why: 'Compound in the catalog',
        pageUrl: pageUrl(structurePath({ kind: 'compound', slug: c.slug })),
      },
      keys: new Set([normalize(c.slug), normalize(c.name), String(c.cid), ...c.synonyms.map(normalize)]),
      primary: normalize([c.slug, c.name, ...c.synonyms].join(' ')),
      secondary: '',
      curated: false,
      rank: 99,
    });
  }
  return entries;
}

let index: Entry[] | null = null;

/**
 * Catalog matches, best first. An exact name, label, synonym or id ranks
 * first; otherwise every query word must appear in the entry.
 */
export function searchCatalog(query: string, kind: AppKind | 'any', limit: number): FoundStructure[] {
  index ??= buildIndex();
  const full = queryTokens(query).join(' ');
  // Exact names also match as written: "Vitamin A" must not lose its "A" to the stopwords.
  const asWritten = normalize(compoundNameFrom(query));
  const tokens = full.split(' ').filter(Boolean);
  if (!tokens.length && !asWritten) return [];

  const scored: { entry: Entry; score: number }[] = [];
  for (const entry of index) {
    if (kind !== 'any' && entry.result.kind !== kind) continue;
    let score = 0;
    if (entry.keys.has(asWritten) || entry.keys.has(full)) score = 100;
    else if (tokens.length && tokens.every((t) => hasPart(entry.primary, t))) score = 60;
    else if (tokens.length && tokens.every((t) => hasPart(`${entry.primary} ${entry.secondary}`, t))) score = 30;
    if (!score) continue;
    // Shorter names are closer matches ("insulin" beats "insulin receptor kinase").
    score -= Math.min(5, entry.primary.length / 80);
    if (entry.curated) score += 8 - Math.min(6, entry.rank * 0.5);
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry.result);
}

/** True when a catalog compound's name, slug or synonym equals the query (as written or without filler). */
export function hasExactCompoundName(query: string): boolean {
  index ??= buildIndex();
  const keys = [normalize(compoundNameFrom(query)), queryTokens(query).join(' ')].filter(Boolean);
  return index.some((e) => e.result.kind === 'compound' && keys.some((k) => e.keys.has(k)));
}

/** Catalog compound by slug, CID or exact name/synonym (case-insensitive). */
export function findCompound(ref: string): Compound | undefined {
  const trimmed = ref.trim();
  if (/^\d+$/.test(trimmed)) return COMPOUNDS.find((c) => c.cid === Number(trimmed));
  const key = normalize(trimmed);
  return (
    COMPOUNDS.find((c) => c.slug === trimmed.toLowerCase()) ??
    COMPOUNDS.find((c) => normalize(c.name) === key) ??
    COMPOUNDS.find((c) => c.synonyms.some((s) => normalize(s) === key))
  );
}

export function findAfSeed(id: string): AfSeed | undefined {
  const upper = id.trim().toUpperCase();
  return AF_SEEDS.find((a) => a.id === upper);
}

export function collectionsFor(kind: 'pdb' | 'af', id: string): string[] {
  return COLLECTIONS.filter((c) => c.items.some((i) => i.type === kind && i.id.toUpperCase() === id.toUpperCase())).map(
    (c) => c.title
  );
}
