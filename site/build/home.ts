/**
 * Visible, crawlable home-page content below the viewer: hero text, the
 * "Popular structures" grid (real <a href> links grouped by topic) and links
 * to the viewer pages. Injected into index.html at build (and in dev) by
 * site/build/vitePlugin.ts.
 */
import { escapeHtml } from '../render/html';
import { FEATURED_COLLECTIONS, collectionHref, itemHref } from '../collections';
import { TOOL_LINKS, renderFooter } from '../nav';

const ITEMS_PER_TOPIC = 6;

export function renderHomeContent(): string {
  const topics = FEATURED_COLLECTIONS.map((c) => {
    const items = c.items
      .slice(0, ITEMS_PER_TOPIC)
      .map(
        (i) =>
          `<li><a href="${itemHref(i)}">${escapeHtml(i.label)}</a><span class="item-id">${escapeHtml(i.id)}</span></li>`
      )
      .join('');
    return `<section class="topic">
<h3><a href="${collectionHref(c)}">${escapeHtml(c.title)}</a></h3>
<ul>${items}</ul>
<a class="more" href="${collectionHref(c)}">Browse all ${c.items.length}</a>
</section>`;
  }).join('\n');

  const tools = TOOL_LINKS.map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`).join('');

  return `<div class="page-info-inner">
<h1>MolViewer: free online 3D molecule viewer</h1>
<p class="lead">View proteins, DNA, AlphaFold predictions and small molecules in 3D, right in your browser. Enter a PDB ID, a UniProt accession or a compound name, or open your own PDB, mmCIF, SDF, MOL or XYZ file. Free, open source and nothing to install.</p>
<p class="cta-row">
<a class="cta" href="/pdb/4HHB">Open hemoglobin (4HHB)</a>
<a class="cta-secondary" href="/af/P04637">p53 AlphaFold model</a>
<a class="cta-secondary" href="/compound/caffeine">Caffeine in 3D</a>
</p>
<h2>What you can do</h2>
<ul>
<li>Switch between cartoon, ball-and-stick, stick, spacefill and molecular surface views.</li>
<li>Color by element, chain, residue type, secondary structure (helices and β-sheets), B-factor or AlphaFold pLDDT confidence.</li>
<li>Measure distances, angles and dihedrals, label atoms and read the sequence with its secondary structure.</li>
<li>Compare up to 10 structures side by side or overlaid, then share the scene with a short link or embed it in a web page.</li>
<li>Export PNG images, turntable videos and 3D models (GLB, STL) for slides, 3D printing and AR.</li>
</ul>
<h2>Popular structures</h2>
<div class="topic-grid">
${topics}
</div>
<p><a class="more" href="/collections">All collections</a> · <a class="more" href="/compounds">Small molecules</a> · <a class="more" href="/learn">Learn structural biology basics</a></p>
<h2>Viewers for every format</h2>
<ul class="link-list">${tools}</ul>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`;
}
