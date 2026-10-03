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
    'alphafold af prediction predicted compound compounds chemical please'
  ).split(' ')
);

export function queryTokens(query: string): string[] {
  return normalize(query)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
}

/**
 * The compound name as the user wrote it, minus request words: "Show me a
 * caffeine molecule in 3D?" -> "caffeine". Case, digits and punctuation stay
 * ("2,4-dinitrophenol", "Vitamin A"), because PubChem matches names exactly.
 */
export function compoundNameFrom(query: string): string {
  let name = query.trim().replace(/[?!.]+$/, '');
  for (let prev = ''; prev !== name; ) {
    prev = name;
    name = name
      .replace(/^(please\s+|can you\s+|show( me)?\s+|display\s+|draw\s+|view\s+|find\s+|what (does|is)\s+|what's\s+|the\s+|a\s+|an\s+)/i, '')
      .replace(/\s+(look|looks) like$/i, '')
      .replace(/\s+(in )?3-?d$/i, '')
      .replace(/\s+(molecule|structure|compound|model)$/i, '')
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

/** Whole-word match, or a prefix for words of 4+ letters ("hemoglobin" finds "hemoglobins"). */
function hasWord(haystack: string, token: string): boolean {
  const padded = ` ${haystack} `;
  if (padded.includes(` ${token} `)) return true;
  return token.length >= 4 && padded.includes(` ${token}`);
}

/** hasWord, or inside a longer word for 5+ letters ("hemoglobin" finds "deoxyhemoglobin"). */
function hasPart(haystack: string, token: string): boolean {
  return hasWord(haystack, token) || (token.length >= 5 && haystack.includes(token));
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
