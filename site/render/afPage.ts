/**
 * /af/:id landing page content (AlphaFold prediction for a UniProt accession).
 * Rendered by functions/af/[id].ts from site/upstream/af.ts data.
 */
import type { AfDetails, AfResult } from '../upstream/types';
import type { LandingData } from '../landingData';
import { clean, escapeHtml } from './html';
import { formatDate, formatResolution } from './format';
import { collectionHref, collectionsContaining, FEATURED_COLLECTIONS } from '../collections';
import { renderFooter } from '../nav';
import { ogImageUrl } from '../ogImages';
import { oembedLink, type LandingRender } from './pdbPage';

function name(d: AfDetails): string {
  return clean(d.description ?? d.uniprot?.proteinName ?? `UniProt ${d.id}`, 80);
}

function confidenceWord(plddt: number): string {
  if (plddt > 90) return 'very high';
  if (plddt > 70) return 'confident';
  if (plddt > 50) return 'low';
  return 'very low';
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function renderPlddt(d: AfDetails): string {
  if (d.meanPlddt === undefined && !d.plddtFractions) return '';
  const intro =
    d.meanPlddt !== undefined
      ? `<p>The mean pLDDT of this model is <strong>${d.meanPlddt.toFixed(1)}</strong> (${confidenceWord(d.meanPlddt)} overall). pLDDT is AlphaFold's per-residue confidence score from 0 to 100. In MolViewer, choose the <strong>B-factor</strong> color scheme to color the model by pLDDT, because AlphaFold stores it in the B-factor column.</p>`
      : '';
  const f = d.plddtFractions;
  const table = f
    ? `<div class="table-wrap"><table><thead><tr><th>pLDDT band</th><th>Meaning</th><th>Share of residues</th></tr></thead><tbody>
<tr><td>Above 90</td><td>Very high: backbone and side chains are usually accurate</td><td>${pct(f.veryHigh)}</td></tr>
<tr><td>70 to 90</td><td>Confident: backbone generally right</td><td>${pct(f.confident)}</td></tr>
<tr><td>50 to 70</td><td>Low: treat with caution</td><td>${pct(f.low)}</td></tr>
<tr><td>Below 50</td><td>Very low: often disordered regions</td><td>${pct(f.veryLow)}</td></tr>
</tbody></table></div>`
    : '';
  return `<h2 id="confidence">Model confidence (pLDDT)</h2>${intro}${table}<p><a href="/learn/plddt-explained">What pLDDT means and how to read it</a></p>`;
}

function renderAnnotation(d: AfDetails): string {
  const u = d.uniprot;
  if (!u) return '';
  const parts: string[] = [];
  if (u.functionText) parts.push(`<h2 id="function">Function</h2><p>${escapeHtml(clean(u.functionText, 700))}</p>`);
  if (u.subunit) parts.push(`<h3>Subunit structure</h3><p>${escapeHtml(clean(u.subunit, 400))}</p>`);
  if (u.subcellularLocations.length)
    parts.push(`<h3>Subcellular location</h3><p>${escapeHtml(clean(u.subcellularLocations.join(', '), 300))}</p>`);
  if (u.diseases.length)
    parts.push(`<h3>Disease associations</h3><ul>${u.diseases.slice(0, 6).map((x) => `<li>${escapeHtml(clean(x, 120))}</li>`).join('')}</ul>`);
  return parts.join('\n');
}

function renderPdbStructures(d: AfDetails): string {
  if (!d.pdbStructures.length) {
    return `<h2 id="experimental">Experimental structures</h2><p>UniProt lists no experimental PDB structure for this protein, so the AlphaFold prediction is the main 3D model available.</p>`;
  }
  const rows = d.pdbStructures
    .map(
      (p) =>
        `<tr><td><a href="/pdb/${escapeHtml(p.id)}">${escapeHtml(p.id)}</a></td><td>${escapeHtml(p.method ?? '')}</td><td>${p.resolution ? `${formatResolution(p.resolution)} Å` : ''}</td><td>${escapeHtml(p.chains ?? '')}</td></tr>`
    )
    .join('');
  const more =
    d.pdbStructureCount > d.pdbStructures.length
      ? `<p class="note">Showing ${d.pdbStructures.length} of ${d.pdbStructureCount} experimental structures (best resolution first).</p>`
      : '';
  return `<h2 id="experimental">Experimental structures in the PDB</h2>
<p>Compare the prediction with experimentally determined structures of the same protein:</p>
<div class="table-wrap"><table><thead><tr><th>PDB ID</th><th>Method</th><th>Resolution</th><th>Chains and residues</th></tr></thead><tbody>${rows}</tbody></table></div>${more}`;
}

function facts(d: AfDetails): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (d.gene) out.push({ label: 'Gene', value: d.gene });
  if (d.organism) out.push({ label: 'Organism', value: d.organism });
  if (d.sequenceLength) out.push({ label: 'Length', value: `${d.sequenceLength} residues` });
  if (d.meanPlddt !== undefined) out.push({ label: 'Mean pLDDT', value: d.meanPlddt.toFixed(1) });
  if (d.modelEntityId) out.push({ label: 'Model', value: `${d.modelEntityId}${d.latestVersion ? ` v${d.latestVersion}` : ''}` });
  const created = formatDate(d.modelCreatedDate);
  if (created) out.push({ label: 'Model created', value: created });
  if (d.pdbStructureCount) out.push({ label: 'PDB structures', value: String(d.pdbStructureCount) });
  return out;
}

function notFoundPage(id: string, origin: string): LandingRender {
  return {
    status: 404,
    meta: {
      title: `No AlphaFold model for ${id} | MolViewer`,
      description: `AlphaFold DB has no prediction for the UniProt accession ${id}. Check the accession or try another protein.`,
      canonicalUrl: null,
      robots: 'noindex, follow',
      ogImageUrl: `${origin}/og-image.png`,
      pageInfoHtml: `<div class="page-info-inner">
<h1>No AlphaFold model for ${escapeHtml(id)}</h1>
<p class="lead">AlphaFold DB has no prediction for the UniProt accession <code>${escapeHtml(id)}</code>. The accession may be mistyped, obsolete, or a protein AlphaFold DB doesn't cover. Try another accession in the sidebar, or browse <a href="/collections/alphafold-highlights">AlphaFold highlights</a>.</p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`,
    },
  };
}

function fallbackPage(id: string, origin: string): LandingRender {
  return {
    status: 200,
    meta: {
      title: `${id} AlphaFold structure · 3D viewer | MolViewer`,
      description: `View the AlphaFold prediction for UniProt ${id} in 3D in your browser, free with no install. Color by pLDDT confidence and measure distances.`,
      canonicalUrl: `${origin}/af/${id}`,
      ogImageUrl: ogImageUrl(origin, 'af', id),
      pageInfoHtml: `<div class="page-info-inner">
<h1>AlphaFold prediction ${escapeHtml(id)}</h1>
<p class="lead">View the AlphaFold structure prediction for UniProt entry ${escapeHtml(id)} interactively in 3D.</p>
<p><a href="https://alphafold.ebi.ac.uk/entry/${escapeHtml(id)}" rel="noopener">AlphaFold DB</a> · <a href="https://www.uniprot.org/uniprotkb/${escapeHtml(id)}" rel="noopener">UniProt</a></p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`,
    },
  };
}

export function renderAfLanding(id: string, result: AfResult, origin: string): LandingRender {
  if (result.status === 'not-found') return notFoundPage(id, origin);
  if (result.status === 'error') return fallbackPage(id, origin);

  const d = result.data;
  const canonicalUrl = `${origin}/af/${d.id}`;
  const protein = name(d);
  const gene = d.gene ? ` (${d.gene})` : '';
  let title = `${d.id} – ${protein}${gene} AlphaFold model · 3D viewer | MolViewer`;
  if (title.length > 80) title = `${d.id} – ${protein}${gene} AlphaFold | MolViewer`;
  if (title.length > 80) title = `${d.id} – ${clean(protein, 40)} AlphaFold | MolViewer`;

  let description = `AlphaFold 3D structure of ${protein}${gene}${d.organism ? `, ${d.organism}` : ''}. Color by pLDDT confidence, compare with PDB structures. Free in your browser.`;
  if (description.length > 165) description = `AlphaFold 3D structure of ${clean(protein, 60)}${gene}. Color by pLDDT confidence. Free in your browser, no install.`;

  // Built once as plain text (for JSON-LD, which crawlers don't HTML-decode)
  // and once as HTML with the organism in italics.
  const leadParts = (organism: (o: string) => string) =>
    [
      `${protein}${gene} is a ${d.sequenceLength ? `${d.sequenceLength}-residue ` : ''}protein${d.organism ? ` from ${organism(d.organism)}` : ''}.`,
      `This is its AlphaFold structure prediction${d.modelCreatedDate ? `, created ${formatDate(d.modelCreatedDate) ?? ''}` : ''}. UniProt accession: ${d.id}.`,
    ].join(' ');
  const leadText = leadParts((o) => o);
  const ORGANISM_MARK = '\u0000organism\u0000';
  const lead = escapeHtml(leadParts(() => ORGANISM_MARK)).replace(ORGANISM_MARK, () => `<em>${escapeHtml(d.organism ?? '')}</em>`);

  const factList = facts(d);
  const collections = collectionsContaining('af', d.id);
  const collectionsHtml = collections.length
    ? `<h2>Browse more</h2><ul>${collections.map((c) => `<li><a href="${collectionHref(c)}">${escapeHtml(c.title)}</a></li>`).join('')}</ul>`
    : `<p><a class="more" href="/collections/alphafold-highlights">More AlphaFold highlights</a></p>`;

  const pageInfoHtml = `<div class="page-info-inner">
<h1>${escapeHtml(d.id)}: ${escapeHtml(protein)}${escapeHtml(gene)}</h1>
<p class="lead">${lead}</p>
<dl class="facts">${factList.map((f) => `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`).join('')}</dl>
<p class="cta-row">
<a class="cta" href="#viewer-main">Explore in 3D</a>
<a class="cta-secondary" href="/af/${escapeHtml(d.id)}?repr=cartoon&amp;color=bfactor">Color by confidence</a>
<a href="https://alphafold.ebi.ac.uk/entry/${escapeHtml(d.id)}" rel="noopener">AlphaFold DB</a>
<a href="https://www.uniprot.org/uniprotkb/${escapeHtml(d.id)}" rel="noopener">UniProt</a>
</p>
${renderPlddt(d)}
${renderAnnotation(d)}
${renderPdbStructures(d)}
${collectionsHtml}
<h2>About this viewer</h2>
<p>MolViewer loads the AlphaFold model straight from AlphaFold DB into your browser. Show it as a cartoon, color by pLDDT, measure distances and angles, and load a PDB structure next to it to compare.</p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`;

  const landingData: LandingData = {
    kind: 'af',
    id: d.id,
    title: `${protein}${gene}`,
    subtitle: d.meanPlddt !== undefined ? `AlphaFold prediction, mean pLDDT ${d.meanPlddt.toFixed(1)}` : 'AlphaFold prediction',
    summary: d.uniprot?.functionText ? clean(d.uniprot.functionText, 300) : undefined,
    facts: factList,
    links: [
      { label: 'Details below the viewer', href: '#page-info' },
      { label: 'AlphaFold DB', href: `https://alphafold.ebi.ac.uk/entry/${d.id}` },
      { label: 'UniProt', href: `https://www.uniprot.org/uniprotkb/${d.id}` },
    ],
  };

  return {
    status: 200,
    meta: {
      title,
      description,
      canonicalUrl,
      ogImageUrl: ogImageUrl(origin, 'af', d.id),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: canonicalUrl,
          about: {
            '@type': 'Protein',
            name: protein,
            identifier: d.id,
            sameAs: [`https://www.uniprot.org/uniprotkb/${d.id}`, `https://alphafold.ebi.ac.uk/entry/${d.id}`],
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: `AlphaFold structure prediction for ${protein} (${d.id})`,
          description: `${leadText} ${description}`,
          url: canonicalUrl,
          identifier: d.modelEntityId ?? `AF-${d.id}-F1`,
          sameAs: `https://alphafold.ebi.ac.uk/entry/${d.id}`,
          isAccessibleForFree: true,
          license: 'https://creativecommons.org/licenses/by/4.0/',
          creator: { '@type': 'Organization', name: 'AlphaFold DB (Google DeepMind and EMBL-EBI)' },
          ...(d.modelCreatedDate ? { dateCreated: d.modelCreatedDate } : {}),
          includedInDataCatalog: { '@type': 'DataCatalog', name: 'AlphaFold Protein Structure Database', url: 'https://alphafold.ebi.ac.uk/' },
        },
      ],
      pageInfoHtml,
      landingData,
      extraHead: oembedLink(origin, canonicalUrl, title),
    },
  };
}
