/**
 * /pdb/:id landing page content: title, description, JSON-LD, the visible
 * text below the viewer (#page-info) and the sidebar summary (#landing-data).
 * Rendered by functions/pdb/[id].ts from site/upstream/pdb.ts data.
 */
import type { ChainSecondaryStructure, PdbDetails, PdbResult, PolymerEntity } from '../upstream/types';
import type { LandingData } from '../landingData';
import type { ShellMeta } from './shell';
import { clean, escapeHtml, formatInt } from './html';
import { toSentenceCase } from './sentenceCase';
import { formatDate, formatMethod, formatRange, formatResolution, listJoin, methodNoun, pluralize } from './format';
import { collectionHref, collectionsContaining, FEATURED_COLLECTIONS } from '../collections';
import { renderFooter } from '../nav';
import { ogImageUrl } from '../ogImages';

export interface LandingRender {
  status: 200 | 404;
  meta: ShellMeta;
}

const MAX_SS_GROUPS = 8;
const MAX_ENTITIES = 12;
const MAX_LIGANDS = 20;
const MAX_SEQUENCE_CHARS = 5000;

const TITLE_PREFIXES = [
  /^crystallographic refinement and structure of\s+/i,
  /^(the\s+)?(high[- ]resolution\s+)?(x-ray\s+|crystal\s+|cryo-?em\s+|solution\s+|nmr\s+|refined\s+|three-dimensional\s+|3d\s+)*structures?\s+of\s+(the\s+|an?\s+)?/i,
  /^(the\s+)?structural basis (of|for)\s+/i,
];

const TITLE_SUFFIXES = [
  /\s+(refined\s+)?at\s+[\d.]+\s*(Å|angstroms?|a\b).*$/i,
  /\s+in complex with\b.*$/i,
  /\s+bound (to|with)\b.*$/i,
  /\s+complexed with\b.*$/i,
  /\s+\([^)]*\)$/,
  /[.,;:]+$/,
];

/** Short, human name for titles: "DNase I", "Human deoxyhaemoglobin", "SARS-CoV-2 spike glycoprotein". */
export function shortName(d: Pick<PdbDetails, 'id' | 'title' | 'entities'>): string {
  if (d.title) {
    let t = toSentenceCase(d.title);
    for (const re of TITLE_PREFIXES) t = t.replace(re, '');
    for (const re of TITLE_SUFFIXES) t = t.replace(re, '');
    t = t.trim();
    if (t.length >= 3 && t.length <= 48) return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const entity = d.entities.find((e) => e.type === 'protein' && e.description) ?? d.entities.find((e) => e.description);
  if (entity?.description) {
    const name = toSentenceCase(entity.description).replace(/\s*\([^)]*\)/g, '').trim();
    if (name.length >= 3 && name.length <= 48) return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return `PDB entry ${d.id}`;
}

function methodSummary(d: PdbDetails): string | undefined {
  if (!d.method) return undefined;
  return d.resolution ? `${formatMethod(d.method)}, ${formatResolution(d.resolution)} Å` : formatMethod(d.method);
}

/** "X-ray diffraction at 2.0 Å resolution", "solution NMR". */
function methodPhrase(method: string, resolution: number | undefined): string {
  const m = formatMethod(method);
  const phrase = m.startsWith('X-ray') ? m : m.charAt(0).toLowerCase() + m.slice(1);
  return resolution ? `${phrase} at ${formatResolution(resolution)} Å resolution` : phrase;
}

function organisms(d: PdbDetails): string[] {
  return [...new Set(d.entities.flatMap((e) => e.organisms))];
}

/** Chains whose secondary structure is identical are listed together (hemoglobin A and C). */
function groupSecondaryStructure(chains: ChainSecondaryStructure[]): { chainIds: string[]; ss: ChainSecondaryStructure }[] {
  const groups = new Map<string, { chainIds: string[]; ss: ChainSecondaryStructure }>();
  for (const c of chains) {
    const key = JSON.stringify([c.helices.map(formatRange), c.strands.map(formatRange)]);
    const g = groups.get(key);
    if (g) g.chainIds.push(c.chainId);
    else groups.set(key, { chainIds: [c.chainId], ss: c });
  }
  return [...groups.values()];
}

function chainLabel(ids: string[]): string {
  return ids.length === 1 ? `Chain ${ids[0]}` : `Chains ${listJoin(ids)}`;
}

function renderSsTable(ss: ChainSecondaryStructure): string {
  const rows = [
    ...ss.helices.map((h) => ({ kind: 'helix' as const, seg: h, sheet: '' })),
    ...ss.strands.map((s) => ({ kind: 'strand' as const, seg: s, sheet: s.sheetId ?? '' })),
  ].sort((a, b) => a.seg.seqStart - b.seg.seqStart);
  const body = rows
    .map(
      (r) =>
        `<tr><td class="${r.kind === 'helix' ? 'ss-helix' : 'ss-strand'}">${r.kind === 'helix' ? 'α-helix' : 'β-strand'}</td><td>${escapeHtml(formatRange(r.seg))}</td><td>${r.seg.length}</td><td>${escapeHtml(r.sheet)}</td></tr>`
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Element</th><th>Residues</th><th>Length</th><th>Sheet</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderSecondaryStructure(d: PdbDetails): string {
  const ss = d.secondaryStructure;
  if (!ss || ss.chains.length === 0) return '';
  const groups = groupSecondaryStructure(ss.chains);
  const numbering =
    ss.numbering === 'author'
      ? 'author residue numbering, as in the PDB file, from PDBe'
      : 'sequence positions (label_seq_id) from RCSB, which can differ from the residue numbers in the file';
  const totals = ss.chains.reduce((acc, c) => ({ h: acc.h + c.helices.length, s: acc.s + c.strands.length }), { h: 0, s: 0 });
  const parts = groups.slice(0, MAX_SS_GROUPS).map((g, i) => {
    const summary = `${chainLabel(g.chainIds)}: ${pluralize(g.ss.helices.length, 'helix', 'helices')}, ${pluralize(g.ss.strands.length, 'β-strand')}`;
    const table = renderSsTable(g.ss);
    return i === 0
      ? `<h3>${escapeHtml(summary)}</h3>${table}`
      : `<details><summary>${escapeHtml(summary)}</summary>${table}</details>`;
  });
  const more =
    groups.length > MAX_SS_GROUPS
      ? `<p class="note">${groups.length - MAX_SS_GROUPS} more chain groups are not listed. Open the entry in the viewer and use the sequence panel to see them.</p>`
      : '';
  return `<h2 id="secondary-structure">Secondary structure: helices and β-sheets</h2>
<p>${escapeHtml(d.id)} contains ${pluralize(totals.h, 'α-helix', 'α-helices')} and ${pluralize(totals.s, 'β-strand')} across ${pluralize(ss.chains.length, 'chain')}. Residue ranges use ${escapeHtml(numbering)}. To see them in 3D, choose the <strong>Cartoon</strong> representation with <strong>Secondary structure</strong> coloring: helices, sheets and coils get different colors.</p>
${parts.join('\n')}${more}`;
}

function fasta(d: PdbDetails, e: PolymerEntity): string {
  const seq = (e.sequence ?? '').slice(0, MAX_SEQUENCE_CHARS);
  const lines = seq.match(/.{1,60}/g)?.join('\n') ?? '';
  const header = `>${d.id}_${e.entityId} ${e.description ?? ''} (chains ${e.chainIds.join(', ')})`;
  return `${header}\n${lines}`;
}

/**
 * UniProt accession link: our AlphaFold page when AlphaFold DB confirmed a
 * model (otherwise /af/:id would be a 404), else the UniProt entry.
 */
function uniprotLink(d: PdbDetails, accession: string): string {
  const a = escapeHtml(accession);
  return d.alphafoldIds.includes(accession)
    ? `<a href="/af/${a}">${a}</a> <span class="note">(AlphaFold model)</span>`
    : `<a href="https://www.uniprot.org/uniprotkb/${a}" rel="noopener">${a}</a>`;
}

function renderEntities(d: PdbDetails): string {
  if (d.entities.length === 0) return '';
  const rows = d.entities
    .slice(0, MAX_ENTITIES)
    .map((e) => {
      const uniprot = e.uniprotIds
        .map((u) => uniprotLink(d, u))
        .join(', ');
      return `<tr><td>${escapeHtml(toSentenceCase(clean(e.description ?? `Entity ${e.entityId}`, 100)))}</td><td>${escapeHtml(e.chainIds.join(', '))}</td><td>${escapeHtml(e.type)}</td><td>${e.length ?? ''}</td><td><em>${escapeHtml(e.organisms.join(', '))}</em></td><td>${uniprot}</td></tr>`;
    })
    .join('');
  const sequences = d.entities
    .slice(0, MAX_ENTITIES)
    .filter((e) => e.sequence)
    .map(
      (e) =>
        `<details><summary>Sequence of entity ${escapeHtml(e.entityId)} (${escapeHtml(e.chainIds.join(', '))}), FASTA</summary><pre class="sequence">${escapeHtml(fasta(d, e))}</pre></details>`
    )
    .join('');
  const more = d.entities.length > MAX_ENTITIES ? `<p class="note">${d.entities.length - MAX_ENTITIES} more molecules are not listed.</p>` : '';
  return `<h2 id="molecules">Molecules and chains</h2>
<div class="table-wrap"><table><thead><tr><th>Molecule</th><th>Chains</th><th>Type</th><th>Length</th><th>Organism</th><th>UniProt</th></tr></thead><tbody>${rows}</tbody></table></div>${more}
${sequences}`;
}

function renderLigands(d: PdbDetails): string {
  if (d.ligands.length === 0) return '';
  const rows = d.ligands
    .slice(0, MAX_LIGANDS)
    .map(
      (l) =>
        `<tr><td><a href="https://www.rcsb.org/ligand/${escapeHtml(l.id)}" rel="noopener">${escapeHtml(l.id)}</a></td><td>${escapeHtml(toSentenceCase(clean(l.name ?? '', 80)))}</td><td>${escapeHtml(l.formula ?? '')}</td><td>${l.instanceCount}</td></tr>`
    )
    .join('');
  const excluded = d.excludedLigandIds.length
    ? `<p class="note">Water and common crystallization additives (${escapeHtml(d.excludedLigandIds.join(', '))}) are not listed.</p>`
    : '';
  return `<h2 id="ligands">Ligands and cofactors</h2>
<div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Formula</th><th>Copies</th></tr></thead><tbody>${rows}</tbody></table></div>${excluded}`;
}

/** Append a full stop unless the text already ends with punctuation ("Suck, D."). */
function withStop(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function renderCitation(d: PdbDetails): string {
  const c = d.citation;
  if (!c?.title) return '';
  let cite = withStop(escapeHtml(clean(c.title, 300)));
  if (c.authors.length) {
    const authors = c.authors.slice(0, 3).map((a) => escapeHtml(clean(a, 60))).join(', ');
    cite += ` ${withStop(`${authors}${c.authors.length > 3 ? ' et al.' : ''}`)}`;
  }
  if (c.journal) cite += ` <em>${escapeHtml(clean(c.journal, 80))}</em>`;
  if (c.year) cite += ` (${c.year})`;
  if (c.volume) cite += ` ${escapeHtml(c.volume)}`;
  if (c.pageFirst) cite += `:${escapeHtml(c.pageFirst)}${c.pageLast ? `-${escapeHtml(c.pageLast)}` : ''}`;
  cite = withStop(cite);
  const links: string[] = [];
  if (c.doi) links.push(`<a href="https://doi.org/${escapeHtml(c.doi)}" rel="noopener">DOI ${escapeHtml(c.doi)}</a>`);
  if (c.pubmedId) links.push(`<a href="https://pubmed.ncbi.nlm.nih.gov/${c.pubmedId}/" rel="noopener">PubMed</a>`);
  return `<h2 id="citation">Primary citation</h2>
<p>${cite}${links.length ? ` ${links.join(' · ')}` : ''}</p>`;
}

function renderRelated(d: PdbDetails): string {
  const collections = collectionsContaining('pdb', d.id);
  const parts: string[] = [];
  if (d.related.length) {
    const items = d.related
      .map((r) => {
        const extra = [r.resolution ? `${formatResolution(r.resolution)} Å` : '', r.title ? clean(toSentenceCase(r.title), 90) : '']
          .filter(Boolean)
          .join(', ');
        return `<li><a href="/pdb/${escapeHtml(r.id)}">${escapeHtml(r.id)}</a>${extra ? ` <span class="note">${escapeHtml(extra)}</span>` : ''}</li>`;
      })
      .join('');
    parts.push(
      `<h2 id="related">Related structures</h2>
<p>Other PDB entries of the same protein${d.relatedUniprotId ? ` (UniProt ${uniprotLink(d, d.relatedUniprotId)}${d.alphafoldIds.includes(d.relatedUniprotId) ? ', which also has an AlphaFold model' : ''})` : ''}, best resolution first:</p>
<ul>${items}</ul>`
    );
  }
  if (collections.length) {
    const links = collections
      .map((c) => `<li><a href="${collectionHref(c)}">${escapeHtml(c.title)}</a></li>`)
      .join('');
    parts.push(`<h2 id="collections">Browse more</h2><p>${escapeHtml(d.id)} is part of these collections:</p><ul>${links}</ul>`);
  } else {
    parts.push(`<p><a class="more" href="/collections">Browse structure collections</a></p>`);
  }
  return parts.join('\n');
}

function facts(d: PdbDetails): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (d.method) out.push({ label: 'Method', value: formatMethod(d.method) });
  if (d.resolution) out.push({ label: 'Resolution', value: `${formatResolution(d.resolution)} Å` });
  const orgs = organisms(d);
  if (orgs.length) out.push({ label: orgs.length === 1 ? 'Organism' : 'Organisms', value: orgs.slice(0, 3).join(', ') });
  if (d.polymerChainCount) out.push({ label: 'Chains', value: String(d.polymerChainCount) });
  if (d.atomCount) out.push({ label: 'Atoms', value: formatInt(d.atomCount) });
  if (d.molecularWeight) out.push({ label: 'Mol. weight', value: `${d.molecularWeight} kDa` });
  if (d.ligands.length) out.push({ label: 'Ligands', value: d.ligands.slice(0, 4).map((l) => l.id).join(', ') });
  const released = formatDate(d.releaseDate);
  if (released) out.push({ label: 'Released', value: released });
  return out;
}

function renderFacts(items: { label: string; value: string }[]): string {
  if (!items.length) return '';
  return `<dl class="facts">${items
    .map((f) => `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`)
    .join('')}</dl>`;
}

function landingSecondaryStructure(d: PdbDetails): LandingData['secondaryStructure'] {
  const ss = d.secondaryStructure;
  if (!ss || ss.chains.length === 0) return undefined;
  return groupSecondaryStructure(ss.chains)
    .slice(0, 4)
    .map((g) => ({
      chain: g.chainIds.join(', '),
      helices: g.ss.helices.map(formatRange),
      strands: g.ss.strands.map(formatRange),
    }));
}

function datasetJsonLd(d: PdbDetails, name: string, description: string, canonicalUrl: string): object {
  const creators = (d.citation?.authors ?? []).slice(0, 10).map((a) => ({ '@type': 'Person', name: a }));
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `PDB ${d.id}: ${d.title ? clean(toSentenceCase(d.title), 200) : name}`,
    description,
    url: canonicalUrl,
    identifier: [d.id, ...(d.citation?.doi ? [`https://doi.org/${d.citation.doi}`] : [])],
    sameAs: `https://www.rcsb.org/structure/${d.id}`,
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    ...(creators.length ? { creator: creators } : {}),
    ...(d.releaseDate ? { datePublished: d.releaseDate } : {}),
    ...(d.revisionDate ? { dateModified: d.revisionDate } : {}),
    ...(d.keywords ? { keywords: d.keywords.toLowerCase() } : {}),
    includedInDataCatalog: { '@type': 'DataCatalog', name: 'Protein Data Bank', url: 'https://www.rcsb.org/' },
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'chemical/x-mmcif',
      contentUrl: `https://files.rcsb.org/download/${d.id}.cif`,
    },
  };
}

function notFoundPage(id: string, origin: string): LandingRender {
  const popular = FEATURED_COLLECTIONS.slice(0, 4)
    .map((c) => `<li><a href="${collectionHref(c)}">${escapeHtml(c.title)}</a></li>`)
    .join('');
  return {
    status: 404,
    meta: {
      title: `PDB entry ${id} not found | MolViewer`,
      description: `There is no PDB entry with the ID ${id}. Check the ID or browse popular structures.`,
      canonicalUrl: null,
      robots: 'noindex, follow',
      ogImageUrl: `${origin}/og-image.png`,
      pageInfoHtml: `<div class="page-info-inner">
<h1>PDB entry ${escapeHtml(id)} not found</h1>
<p class="lead">The Protein Data Bank has no entry with the ID <code>${escapeHtml(id)}</code>. It may be mistyped, or the entry may have been removed or superseded. You can enter another PDB ID in the sidebar, or start from a collection:</p>
<ul>${popular}</ul>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`,
    },
  };
}

/** Defaults when RCSB is unreachable: keep 200 and render a minimal page. */
function fallbackPage(id: string, origin: string): LandingRender {
  const canonicalUrl = `${origin}/pdb/${id}`;
  return {
    status: 200,
    meta: {
      title: `${id} 3D structure · free 3D viewer | MolViewer`,
      description: `View PDB structure ${id} in 3D in your browser, free with no install. Explore helices and sheets, chains, ligands and measure distances.`,
      canonicalUrl,
      ogImageUrl: ogImageUrl(origin, 'pdb', id),
      pageInfoHtml: `<div class="page-info-inner">
<h1>PDB entry ${escapeHtml(id)}</h1>
<p class="lead">View Protein Data Bank entry ${escapeHtml(id)} interactively in 3D. Rotate, zoom, measure distances and angles, and explore secondary structure directly in your browser.</p>
<p><a href="https://www.rcsb.org/structure/${escapeHtml(id)}" rel="noopener">${escapeHtml(id)} on RCSB PDB</a></p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`,
    },
  };
}

export function renderPdbLanding(id: string, result: PdbResult, origin: string): LandingRender {
  if (result.status === 'not-found') return notFoundPage(id, origin);
  if (result.status === 'error') return fallbackPage(id, origin);

  const d = result.data;
  const canonicalUrl = `${origin}/pdb/${d.id}`;
  const name = shortName(d);
  const noun = methodNoun(d.method);
  const res = d.resolution ? ` (${formatResolution(d.resolution)} Å)` : '';
  let title = `${d.id} – ${name} ${noun}${res} · 3D viewer | MolViewer`;
  if (title.length > 75) title = `${d.id} – ${name} ${noun}${res} | MolViewer`;

  const ss = d.secondaryStructure;
  const hasSs = !!ss && ss.chains.some((c) => c.helices.length || c.strands.length);
  const orgs = organisms(d);
  const descParts = [
    `3D ${noun} of ${name}${orgs.length === 1 ? ` (${orgs[0]})` : ''}, PDB ${d.id}${d.resolution ? `, ${formatResolution(d.resolution)} Å` : ''}.`,
    hasSs ? 'Helix and β-sheet residue ranges, chains and ligands.' : 'Chains, ligands and citation.',
    'View free in your browser, no install.',
  ];
  let description = descParts.join(' ');
  if (description.length > 165) description = `${descParts[0]} ${descParts[2]}`;

  const fullTitle = d.title ? toSentenceCase(d.title) : undefined;
  const methodLine = methodSummary(d);
  // Plain text for JSON-LD (not HTML-decoded by crawlers), escaped for the page.
  const leadText = [
    fullTitle ? withStop(clean(fullTitle, 300)) : `Protein Data Bank entry ${d.id}.`,
    d.method ? `Determined by ${methodPhrase(d.method, d.resolution)}.` : '',
    d.releaseDate ? `Released ${formatDate(d.releaseDate) ?? d.releaseDate}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const lead = escapeHtml(leadText);

  const factList = facts(d);
  const viewLinks = `<p class="cta-row">
<a class="cta" href="#viewer-main">Explore ${escapeHtml(d.id)} in 3D</a>
<a class="cta-secondary" href="/pdb/${escapeHtml(d.id)}?repr=cartoon&amp;color=secondaryStructure">Show helices and sheets</a>
<a href="https://www.rcsb.org/structure/${escapeHtml(d.id)}" rel="noopener">RCSB PDB</a>
<a href="https://www.ebi.ac.uk/pdbe/entry/pdb/${escapeHtml(d.id.toLowerCase())}" rel="noopener">PDBe</a>
</p>`;

  const pageInfoHtml = `<div class="page-info-inner">
<h1>${escapeHtml(d.id)}: ${escapeHtml(name)}</h1>
<p class="lead">${lead}</p>
${renderFacts(factList)}
${viewLinks}
${renderSecondaryStructure(d)}
${renderEntities(d)}
${renderLigands(d)}
${renderCitation(d)}
${renderRelated(d)}
<h2>About this viewer</h2>
<p>MolViewer shows ${escapeHtml(d.id)} directly in your browser with nothing to install. Switch between cartoon, ball-and-stick, spacefill and surface views, color by chain, secondary structure or B-factor, measure distances, angles and dihedrals, and share or embed the view.</p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`;

  const landingData: LandingData = {
    kind: 'pdb',
    id: d.id,
    title: name,
    subtitle: methodLine,
    summary: fullTitle ? clean(fullTitle, 300) : undefined,
    facts: factList,
    secondaryStructure: landingSecondaryStructure(d),
    links: [
      { label: 'Details below the viewer', href: '#page-info' },
      { label: 'RCSB PDB', href: `https://www.rcsb.org/structure/${d.id}` },
      ...(d.citation?.doi ? [{ label: 'Paper (DOI)', href: `https://doi.org/${d.citation.doi}` }] : []),
    ],
  };

  return {
    status: 200,
    meta: {
      title,
      description,
      canonicalUrl,
      ogImageUrl: ogImageUrl(origin, 'pdb', d.id),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: canonicalUrl,
          ...(d.revisionDate ? { dateModified: d.revisionDate } : {}),
          about: { '@type': 'Dataset', name: `PDB ${d.id}`, url: `https://www.rcsb.org/structure/${d.id}` },
        },
        datasetJsonLd(d, name, `${leadText} ${description}`.slice(0, 4900), canonicalUrl),
      ],
      pageInfoHtml,
      landingData,
      extraHead: oembedLink(origin, canonicalUrl, title),
    },
  };
}

export function oembedLink(origin: string, pageUrl: string, title: string): string {
  return `<link rel="alternate" type="application/json+oembed" href="${escapeHtml(`${origin}/oembed?url=${encodeURIComponent(pageUrl)}&format=json`)}" title="${escapeHtml(title)}">`;
}
