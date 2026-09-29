/**
 * /compound/:slug landing pages, pre-rendered at build time from
 * data/compounds.json into the SPA shell (the app then loads the 3D SDF from
 * PubChem). No PubChem calls at request time.
 */
import type { Compound } from '../dataTypes';
import { COMPOUND_CATEGORY_LABELS } from '../dataTypes';
import type { LandingData } from '../landingData';
import type { ShellMeta } from '../render/shell';
import { escapeHtml } from '../render/html';
import { renderFooter, SITE_ORIGIN } from '../nav';
import { FEATURED_COLLECTIONS } from '../collections';
import { oembedLink } from '../render/pdbPage';
import { compoundImageUrl } from '../ogImages';

/** "C8H10N4O2" -> "C<sub>8</sub>H<sub>10</sub>N<sub>4</sub>O<sub>2</sub>" */
export function formulaHtml(formula: string): string {
  return escapeHtml(formula).replace(/(\d+)/g, '<sub>$1</sub>');
}

export function compoundTitle(c: Compound): string {
  const t = `${c.name} 3D structure (${c.formula}) | MolViewer`;
  return t.length <= 70 ? t : `${c.name} 3D structure | MolViewer`;
}

export function renderCompoundPage(c: Compound, related: Compound[]): ShellMeta {
  const canonicalUrl = `${SITE_ORIGIN}/compound/${c.slug}`;
  const title = compoundTitle(c);
  let description = `See ${c.name} (${c.formula}, ${c.weight} g/mol) in 3D: rotate the molecule and measure bond lengths and angles. Free in your browser, no install.`;
  if (description.length > 165) description = `See ${c.name} (${c.formula}) in 3D: rotate it and measure bond lengths and angles. Free in your browser, no install.`;
  const category = COMPOUND_CATEGORY_LABELS[c.category];
  const synonyms = c.synonyms.filter((s) => s.toLowerCase() !== c.name.toLowerCase()).slice(0, 5);

  const facts = [
    { label: 'Formula', value: c.formula },
    { label: 'Molar mass', value: `${c.weight} g/mol` },
    { label: 'PubChem CID', value: String(c.cid) },
    { label: 'Heavy atoms', value: String(c.heavyAtoms) },
    { label: 'Category', value: category },
  ];

  const relatedHtml = related.length
    ? `<h2>More ${escapeHtml(category.toLowerCase())}</h2><ul class="link-list">${related
        .map((r) => `<li><a href="/compound/${escapeHtml(r.slug)}">${escapeHtml(r.name)}</a></li>`)
        .join('')}</ul>`
    : '';

  const pageInfoHtml = `<div class="page-info-inner">
<h1>${escapeHtml(c.name)} 3D structure</h1>
<p class="lead">${escapeHtml(c.name)}${synonyms.length ? ` (also called ${escapeHtml(synonyms.slice(0, 2).join(', '))})` : ''} has the formula ${formulaHtml(c.formula)} and a molar mass of ${escapeHtml(c.weight)} g/mol. The model above is PubChem's computed 3D conformer: drag to rotate, scroll to zoom, and use the measurement tools to read bond lengths and angles.</p>
<dl class="facts">${facts.map((f) => `<div><dt>${escapeHtml(f.label)}</dt><dd>${f.label === 'Formula' ? formulaHtml(f.value) : escapeHtml(f.value)}</dd></div>`).join('')}</dl>
<p class="cta-row">
<a class="cta" href="#viewer-main">Explore in 3D</a>
<a class="cta-secondary" href="/compound/${escapeHtml(c.slug)}?repr=spacefill">Space-filling model</a>
<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}" rel="noopener">PubChem</a>
</p>
<h2>Identifiers</h2>
<div class="table-wrap"><table><tbody>
<tr><th>IUPAC name</th><td>${escapeHtml(c.iupac)}</td></tr>
<tr><th>SMILES</th><td><code>${escapeHtml(c.smiles)}</code></td></tr>
<tr><th>PubChem CID</th><td><a href="https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}" rel="noopener">${c.cid}</a></td></tr>
${synonyms.length ? `<tr><th>Other names</th><td>${escapeHtml(synonyms.join(', '))}</td></tr>` : ''}
</tbody></table></div>
<h2>How to read the 3D model</h2>
<p>Atoms use the standard CPK colors: carbon gray, hydrogen white, oxygen red, nitrogen blue, sulfur yellow. Switch to <strong>Spacefill</strong> to see the molecule's overall shape and size, or <strong>Stick</strong> for a clear view of the bonds. Click two atoms in distance mode to measure a bond length in ångströms.</p>
<p class="note">3D coordinates are PubChem's computed conformer, one low-energy shape of the molecule. Flexible molecules can take many other shapes.</p>
${relatedHtml}
<p><a class="more" href="/compounds">Browse all small molecules</a></p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`;

  const landingData: LandingData = {
    kind: 'compound',
    id: c.slug,
    pubchemCid: c.cid,
    title: c.name,
    subtitle: `${c.formula}, ${c.weight} g/mol`,
    facts,
    links: [
      { label: 'Details below the viewer', href: '#page-info' },
      { label: 'PubChem', href: `https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}` },
    ],
  };

  return {
    title,
    description,
    canonicalUrl,
    ogImageUrl: compoundImageUrl(c.cid),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description,
        url: canonicalUrl,
        about: {
          '@type': 'MolecularEntity',
          name: c.name,
          identifier: `CID ${c.cid}`,
          molecularFormula: c.formula,
          molecularWeight: `${c.weight} g/mol`,
          iupacName: c.iupac,
          smiles: c.smiles,
          ...(synonyms.length ? { alternateName: synonyms } : {}),
          url: canonicalUrl,
          sameAs: `https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}`,
        },
      },
    ],
    pageInfoHtml,
    landingData,
    extraHead: oembedLink(SITE_ORIGIN, canonicalUrl, title),
  };
}
