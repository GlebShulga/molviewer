/**
 * The three tools, as plain functions of their arguments (server.ts wires
 * them into MCP). Upstream calls go through site/upstream, so tests run on
 * the same recorded fixtures as the landing pages.
 */
import { fetchPdbDetails } from '../../../site/upstream/pdb';
import { fetchAfDetails } from '../../../site/upstream/af';
import { fetchPubchemCompound, resolvePubchemCid } from '../../../site/upstream/pubchem';
import { searchRcsb, searchUniProt } from '../../../site/upstream/search';
import type { UpstreamOptions } from '../../../site/upstream/types';
import { PDB_ID_RE, UNIPROT_RE } from '../../../site/identifiers';
import { slugForCid } from '../../../site/compoundSlugs';
import {
  WIDGET_META_KEY,
  defaultView,
  toViewerColor,
  toViewerRepresentation,
  type AppColor,
  type AppKind,
  type AppStyle,
  type WidgetLoad,
  type WidgetPayload,
} from '../../../site/appContract';
import { compoundNameFrom, findCompound, hasExactCompoundName, queryTokens, searchCatalog, type FoundStructure } from './catalog';
import { REFUSAL_MESSAGE, isDeniedCompound, isDeniedQuery } from './safety';
import {
  afCaption,
  afFacts,
  afPageUrl,
  afSections,
  afSummary,
  compoundCaption,
  compoundFacts,
  compoundPageUrl,
  compoundSummary,
  pdbCaption,
  pdbFacts,
  pdbPageUrl,
  pdbSections,
  pdbSummary,
  type DetailSection,
} from './summaries';

/** What a tool returns, before it becomes an MCP CallToolResult. */
export interface ToolOutcome {
  text: string;
  structuredContent?: Record<string, unknown>;
  /** Widget-only `_meta` (hidden from the model). */
  meta?: Record<string, unknown>;
  isError?: boolean;
  /** False when the answer came from a degraded upstream and shouldn't be cached. */
  cacheable?: boolean;
  /** For analytics: ok, not_found, denied, upstream_error, invalid. */
  status: 'ok' | 'not_found' | 'denied' | 'upstream_error' | 'invalid';
}

function error(text: string, status: ToolOutcome['status']): ToolOutcome {
  return { text, isError: true, status };
}

// ---------------------------------------------------------------------------
// find_structures
// ---------------------------------------------------------------------------

export interface FindArgs {
  query: string;
  kind?: AppKind | 'any';
  limit?: number;
}

const AF_HINT = /\b(alphafold|predicted|prediction)\b/i;


export async function findStructures(args: FindArgs, upstream: UpstreamOptions): Promise<ToolOutcome> {
  const kind = args.kind ?? 'any';
  const limit = Math.min(10, Math.max(1, args.limit ?? 5));
  const deniedQuery = isDeniedQuery(args.query);
  if (deniedQuery && kind === 'compound') return { ...error(REFUSAL_MESSAGE, 'denied') };
  const allowCompounds = !deniedQuery && (kind === 'compound' || kind === 'any');

  const results: FoundStructure[] = searchCatalog(args.query, kind, limit).filter(
    (r) => r.kind !== 'compound' || (allowCompounds && !isDeniedCompound({ cid: findCompound(r.id)?.cid, names: [r.title] }))
  );
  const notes: string[] = [];

  // Full-text searches get the content words; PubChem's exact-name lookup gets the name as written.
  const text = queryTokens(args.query).join(' ');
  const compoundName = compoundNameFrom(args.query);
  const words = compoundName.split(/\s+/).filter(Boolean).length;
  // Compound names are short; skip PubChem for sentence-like queries. Partial catalog
  // matches don't count: "Coenzyme A" must still get PubChem's exact answer.
  const wantCompound = allowCompounds && words > 0 && words <= 4 && !hasExactCompoundName(args.query);
  const needMore = results.length < limit;

  if (needMore || wantCompound) {
    const wantPdb = needMore && (kind === 'pdb' || kind === 'any');
    const wantAf = needMore && (kind === 'alphafold' || (kind === 'any' && (AF_HINT.test(args.query) || results.length === 0)));

    const [pubchem, rcsb, uniprot] = await Promise.all([
      wantCompound ? lookupCompound(compoundName, upstream) : null,
      wantPdb && text ? searchRcsb(text, limit, upstream) : null,
      wantAf && text ? searchUniProt(text, Math.min(limit, 5), upstream) : null,
    ]);

    // An exact PubChem name match beats partial catalog matches: it goes first. In
    // mixed searches only small molecules do: PubChem also names peptides and
    // proteins ("insulin"), and for those the PDB and AlphaFold structures are the answer.
    let largeCompound: FoundStructure | null = null;
    if (pubchem?.hit) {
      const hit = pubchem.hit;
      const at = results.findIndex((x) => x.kind === hit.kind && x.id === hit.id);
      const moved = at >= 0 ? results.splice(at, 1) : [hit];
      if (kind === 'compound' || !pubchem.large) results.splice(0, 0, ...moved);
      else largeCompound = moved[0];
    }
    const fromRcsb: FoundStructure[] =
      rcsb?.status === 'ok'
        ? rcsb.data.map((e) => ({
            kind: 'pdb',
            id: e.id,
            title: e.title ?? `PDB entry ${e.id}`,
            subtitle: e.method ? `${e.method}${e.resolution ? `, ${e.resolution} Å` : ''}` : undefined,
            why: 'RCSB PDB full-text search',
            pageUrl: pdbPageUrl(e.id),
          }))
        : [];
    const fromUniprot: FoundStructure[] =
      uniprot?.status === 'ok'
        ? uniprot.data.map((h) => ({
            kind: 'alphafold',
            id: h.accession,
            title: h.proteinName ?? h.accession,
            subtitle: [h.organism, h.gene, h.length ? `${h.length} residues` : ''].filter(Boolean).join(', ') || undefined,
            why: 'UniProt search, AlphaFold model available',
            pageUrl: afPageUrl(h.accession),
          }))
        : [];
    // Degraded answers are returned but not cached (cacheable: false below).
    if (pubchem?.error) notes.push('PubChem did not answer');
    if (rcsb?.status === 'error') notes.push('RCSB search did not answer');
    if (rcsb?.status === 'ok' && rcsb.data.some((e) => !e.title)) notes.push('RCSB titles are temporarily unavailable');
    if (uniprot?.status === 'error') notes.push('UniProt search did not answer');

    const ordered = [
      ...(AF_HINT.test(args.query) ? [...fromUniprot, ...fromRcsb] : [...fromRcsb, ...fromUniprot]),
      ...(largeCompound ? [largeCompound] : []),
    ];
    for (const r of ordered) {
      if (results.length >= limit) break;
      if (!results.some((x) => x.kind === r.kind && x.id === r.id)) results.push(r);
    }
    results.splice(limit);
  }

  if (!results.length) {
    const text = deniedQuery
      ? REFUSAL_MESSAGE
      : `No structures found for "${args.query}". Try another name, a 4-character PDB ID or a UniProt accession.`;
    return {
      text: notes.length ? `${text} (${notes.join('; ')}.)` : text,
      structuredContent: { query: args.query, results: [] },
      status: deniedQuery ? 'denied' : 'not_found',
      cacheable: notes.length === 0,
    };
  }
  const lines = results.map((r) => `- ${r.kind} ${r.id}: ${r.title}${r.subtitle ? ` (${r.subtitle})` : ''}`);
  return {
    text:
      `Found ${results.length} for "${args.query}", best match first. Unless the user asked for something specific ` +
      `(a state, variant, organism or ligand), show the first one with show_structure.\n${lines.join('\n')}`,
    structuredContent: { query: args.query, results },
    status: 'ok',
    cacheable: notes.length === 0,
  };
}

/** 100+ carbons: a peptide or other macromolecule, not a small molecule. */
const LARGE_FORMULA = /^C(\d{3,})/;

/**
 * Exact PubChem name match: no `hit` when none or denied; `error` when PubChem
 * failed; `large` for macromolecule-sized formulas.
 */
async function lookupCompound(
  name: string,
  upstream: UpstreamOptions
): Promise<{ hit?: FoundStructure; error?: boolean; large?: boolean }> {
  const cid = await resolvePubchemCid(name, upstream);
  if (cid.status === 'error') return { error: true };
  if (cid.status !== 'ok') return {};
  const props = await fetchPubchemCompound(cid.data, upstream);
  const title = props.status === 'ok' ? props.data.title : undefined;
  if (isDeniedCompound({ cid: cid.data, names: [title, name] })) return {};
  const slug = slugForCid(cid.data);
  return {
    hit: {
      kind: 'compound',
      id: slug ?? String(cid.data),
      title: title ?? `PubChem CID ${cid.data}`,
      subtitle: props.status === 'ok' && props.data.formula ? props.data.formula : undefined,
      why: 'PubChem name match',
      pageUrl: compoundPageUrl({ slug, cid: cid.data }),
    },
    error: props.status === 'error',
    large: props.status === 'ok' && LARGE_FORMULA.test(props.data.formula ?? ''),
  };
}

// ---------------------------------------------------------------------------
// Shared: resolve kind + id to facts
// ---------------------------------------------------------------------------

export interface StructureRef {
  kind: AppKind;
  id: string;
}

type Resolved =
  | {
      ok: true;
      load: WidgetLoad;
      title: string;
      pageUrl: string;
      summary: Record<string, unknown>;
      /** The primary source didn't answer: summary is only ids and a note. */
      partial: boolean;
      /** Answered, but some optional sections failed (details.partial): don't cache. */
      degraded?: boolean;
      /** Key facts in a sentence or two, for the tool's text content. */
      facts?: string;
      /** One line of key facts for the viewer (WidgetPayload.caption). */
      caption?: string;
      details?: unknown;
    }
  | { ok: false; outcome: ToolOutcome };

async function resolve(ref: StructureRef, upstream: UpstreamOptions): Promise<Resolved> {
  const id = ref.id.trim();
  switch (ref.kind) {
    case 'pdb': {
      const upper = id.toUpperCase();
      if (!PDB_ID_RE.test(upper) || !/\d/.test(upper)) {
        return {
          ok: false,
          outcome: error(`"${id}" is not a valid PDB ID: PDB IDs have 4 characters and start with a digit, e.g. 4HHB. Use find_structures to search by name.`, 'invalid'),
        };
      }
      const r = await fetchPdbDetails(upper, upstream);
      if (r.status === 'not-found') {
        return { ok: false, outcome: error(`No PDB entry "${upper}". Check the ID or use find_structures to search by name.`, 'not_found') };
      }
      const load: WidgetLoad = { kind: 'pdb', id: upper };
      if (r.status === 'error') {
        // RCSB's API is down, but the file server may still work: show the viewer anyway.
        return {
          ok: true,
          load,
          title: upper,
          pageUrl: pdbPageUrl(upper),
          summary: { kind: 'pdb', id: upper, pageUrl: pdbPageUrl(upper), note: 'Entry details are temporarily unavailable from RCSB.' },
          partial: true,
        };
      }
      const summary = pdbSummary(r.data);
      return {
        ok: true,
        load,
        title: `${upper}: ${summary.name}`,
        pageUrl: summary.pageUrl,
        summary,
        partial: false,
        degraded: r.data.partial.length > 0,
        facts: pdbFacts(r.data),
        caption: pdbCaption(r.data),
        details: r.data,
      };
    }
    case 'alphafold': {
      const upper = id.toUpperCase().replace(/^AF-/, '').replace(/-F\d+$/, '');
      if (!UNIPROT_RE.test(upper)) {
        return {
          ok: false,
          outcome: error(`"${id}" is not a UniProt accession (e.g. P04637). Use find_structures with kind "alphafold" to search by protein or gene name.`, 'invalid'),
        };
      }
      const r = await fetchAfDetails(upper, upstream);
      if (r.status === 'not-found') {
        return { ok: false, outcome: error(`AlphaFold DB has no model for UniProt ${upper}.`, 'not_found') };
      }
      const load: WidgetLoad = { kind: 'alphafold', id: upper };
      if (r.status === 'error') {
        return {
          ok: true,
          load,
          title: `AlphaFold ${upper}`,
          pageUrl: afPageUrl(upper),
          summary: { kind: 'alphafold', id: upper, pageUrl: afPageUrl(upper), note: 'Model details are temporarily unavailable from AlphaFold DB.' },
          partial: true,
        };
      }
      const summary = afSummary(r.data);
      return {
        ok: true,
        load,
        title: `AlphaFold ${upper}${summary.protein ? `: ${summary.protein}` : ''}`,
        pageUrl: summary.pageUrl,
        summary,
        partial: false,
        degraded: r.data.partial.length > 0,
        facts: afFacts(r.data),
        caption: afCaption(r.data),
        details: r.data,
      };
    }
    case 'compound': {
      const curated = findCompound(id);
      if (curated) {
        if (isDeniedCompound({ cid: curated.cid, names: [curated.name, ...curated.synonyms] })) {
          return { ok: false, outcome: error(REFUSAL_MESSAGE, 'denied') };
        }
        const summary = compoundSummary(curated);
        return {
          ok: true,
          load: { kind: 'compound', cid: curated.cid, slug: curated.slug },
          title: curated.name,
          pageUrl: summary.pageUrl,
          summary,
          partial: false,
          facts: compoundFacts(curated),
          caption: compoundCaption(curated),
        };
      }
      if (isDeniedCompound({ names: [id] })) return { ok: false, outcome: error(REFUSAL_MESSAGE, 'denied') };
      const cid = await resolvePubchemCid(id.replace(/^cid[:\s]*/i, ''), upstream);
      if (cid.status === 'not-found') {
        return { ok: false, outcome: error(`PubChem has no compound named "${id}". Try another name or a PubChem CID.`, 'not_found') };
      }
      if (cid.status === 'error') return { ok: false, outcome: error('PubChem did not answer. Try again in a moment.', 'upstream_error') };
      const props = await fetchPubchemCompound(cid.data, upstream);
      if (props.status === 'not-found') return { ok: false, outcome: error(`No PubChem compound with CID ${cid.data}.`, 'not_found') };
      const title = props.status === 'ok' ? props.data.title : undefined;
      if (isDeniedCompound({ cid: cid.data, names: [title] })) return { ok: false, outcome: error(REFUSAL_MESSAGE, 'denied') };
      const slug = slugForCid(cid.data);
      const summary =
        props.status === 'ok'
          ? compoundSummary({ ...props.data, slug })
          : { kind: 'compound', cid: cid.data, pageUrl: compoundPageUrl({ slug, cid: cid.data }), note: 'Compound details are temporarily unavailable.' };
      return {
        ok: true,
        load: { kind: 'compound', cid: cid.data, slug },
        title: title ?? `PubChem CID ${cid.data}`,
        pageUrl: summary.pageUrl as string,
        summary,
        partial: props.status !== 'ok',
        facts: props.status === 'ok' ? compoundFacts(props.data) : undefined,
        caption: props.status === 'ok' ? compoundCaption(props.data) : undefined,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// show_structure
// ---------------------------------------------------------------------------

const COLOR_WORDS: Record<AppColor, string> = {
  secondaryStructure: 'secondary structure',
  chain: 'chain',
  cpk: 'element (CPK)',
  residueType: 'residue type',
  bfactor: 'B-factor',
  confidence: 'AlphaFold confidence (pLDDT)',
  rainbow: 'sequence position (rainbow)',
};

export interface ShowArgs extends StructureRef {
  style?: AppStyle;
  color?: AppColor;
  spin?: boolean;
}

export async function showStructure(args: ShowArgs, upstream: UpstreamOptions): Promise<ToolOutcome> {
  const r = await resolve(args, upstream);
  if (!r.ok) return r.outcome;

  const defaults = defaultView(args.kind);
  let style = args.style ?? defaults.style;
  let color = args.color ?? defaults.color;
  const notes: string[] = [];
  if (args.kind === 'compound' && style === 'cartoon') {
    style = 'ball-and-stick';
    notes.push('Cartoon needs a protein or nucleic-acid backbone, so the compound is shown as ball and stick.');
  }
  if (color === 'confidence' && args.kind !== 'alphafold') {
    color = 'bfactor';
    notes.push('Confidence (pLDDT) coloring is for AlphaFold models; this entry is colored by B-factor instead.');
  }
  // First in the text, where the model reads it before writing its answer.
  const chainsNote = typeof r.summary.chainsNote === 'string' ? r.summary.chainsNote : undefined;
  if (chainsNote) notes.unshift(`Note: ${chainsNote}`);

  const payload: WidgetPayload = {
    load: r.load,
    view: { repr: toViewerRepresentation(style), color: toViewerColor(color), spin: args.spin ?? false },
    title: r.title,
    ...(r.caption ? { caption: r.caption } : {}),
    pageUrl: r.pageUrl,
  };
  const colorWords = COLOR_WORDS[color];
  // ChatGPT often writes nothing after the viewer whatever this text says (three
  // wordings tried in the 2026-10-03 test runs, including a separate first block,
  // which seemed to make it worse). The key facts are in the viewer's caption,
  // so this stays a short, plain request.
  const text = [
    `Showing ${r.title} as ${style}, colored by ${colorWords} in the 3D viewer.`,
    ...notes,
    r.facts && `Facts: ${r.facts}`,
    "Reply with 2-4 sentences in the user's language on what this structure is, using these facts; don't describe the colors.",
    `Full viewer: ${r.pageUrl}`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    text,
    structuredContent: { ...r.summary, shown: { style, color } },
    meta: { [WIDGET_META_KEY]: payload },
    status: 'ok',
    cacheable: !r.partial && !r.degraded,
  };
}

// ---------------------------------------------------------------------------
// get_structure_details
// ---------------------------------------------------------------------------

export interface DetailsArgs extends StructureRef {
  sections?: DetailSection[];
}

export async function getStructureDetails(args: DetailsArgs, upstream: UpstreamOptions): Promise<ToolOutcome> {
  const sections = args.sections?.length ? args.sections : (['secondaryStructure', 'ligands', 'citation'] as DetailSection[]);
  const r = await resolve(args, upstream);
  if (!r.ok) return r.outcome;
  if (r.partial) {
    return error(`Details for ${args.id} are temporarily unavailable from the upstream database. Try again shortly.`, 'upstream_error');
  }

  let extra: Record<string, unknown> = {};
  if (args.kind === 'pdb') extra = pdbSections(r.details as Parameters<typeof pdbSections>[0], sections);
  if (args.kind === 'alphafold') extra = afSections(r.details as Parameters<typeof afSections>[0], sections);

  const structuredContent = { ...r.summary, ...extra };
  return {
    text: `Details for ${r.title}: ${JSON.stringify(structuredContent)}`,
    structuredContent,
    status: 'ok',
    // e.g. PDBe and the RCSB fallback both timed out: answer now, ask again next time.
    cacheable: !r.degraded,
  };
}
