/**
 * Site-wide navigation shared by the SPA shell (index.html), landing pages
 * rendered by Pages Functions and the static pages generated at build time.
 */
import { escapeHtml } from './render/html';

export const SITE_ORIGIN = 'https://molviewer.bio';
export const SITE_NAME = 'MolViewer';
export const GITHUB_URL = 'https://github.com/GlebShulga/molviewer';
/** The MolViewer app's page in ChatGPT's plugin directory. */
export const CHATGPT_APP_URL = 'https://chatgpt.com/plugins/plugin_asdk_app_6ac11a7d87588191b586f23b757df123';

export interface NavLink {
  label: string;
  href: string;
}

export const TOOL_LINKS: NavLink[] = [
  { label: 'Online PDB viewer', href: '/pdb-viewer' },
  { label: 'AlphaFold viewer', href: '/alphafold-viewer' },
  { label: 'mmCIF viewer', href: '/mmcif-viewer' },
  { label: 'SDF / MOL viewer', href: '/sdf-viewer' },
  { label: 'XYZ viewer', href: '/xyz-viewer' },
  { label: 'PyMOL online alternative', href: '/pymol-online-alternative' },
  { label: 'Compare viewers', href: '/compare' },
];

export const EXPLORE_LINKS: NavLink[] = [
  { label: 'All collections', href: '/collections' },
  { label: 'Small molecules', href: '/compounds' },
  { label: 'Learn', href: '/learn' },
  { label: 'ChatGPT app ↗', href: CHATGPT_APP_URL },
];

export const ABOUT_LINKS: NavLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Support', href: '/support' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'GitHub', href: GITHUB_URL },
];

function linkList(links: NavLink[]): string {
  return links
    .map((l) => {
      const external = /^https?:/.test(l.href);
      const rel = external ? ' rel="noopener"' : '';
      return `<li><a href="${escapeHtml(l.href)}"${rel}>${escapeHtml(l.label)}</a></li>`;
    })
    .join('');
}

const CHEVRON =
  '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';

/**
 * One footer group. Ships open, so crawlers and browsers without JavaScript
 * see every link; public/footer.js collapses the groups on phones.
 */
function group(title: string, links: NavLink[]): string {
  if (!links.length) return '';
  return `<details open><summary><h2>${title}</h2>${CHEVRON}</summary><ul>${linkList(links)}</ul></details>`;
}

/**
 * Footer with crawlable links to tool pages, collections and the project.
 * `collections` are the featured collection hubs (slug + title). Every page
 * passes them, so the footer keeps its four columns; a caller with none gets no
 * Topics group rather than an empty column. This module must not import
 * data/collections.json: site/appContract.ts imports it, so the whole file
 * would end up in the widget bundle.
 */
export function renderFooter(collections: { slug: string; title: string }[] = []): string {
  const collectionLinks = collections.map((c) => ({ label: c.title, href: `/collections/${c.slug}` }));
  return `<footer class="site-footer">
  <nav aria-label="Site">
    ${group('Viewers', TOOL_LINKS)}
    ${group('Topics', collectionLinks)}
    ${group('Explore', EXPLORE_LINKS)}
    ${group('Project', ABOUT_LINKS)}
  </nav>
  <p class="site-footer-note">MolViewer is free and open source (MIT). Structures come from the <a href="https://www.rcsb.org/" rel="noopener">RCSB PDB</a>, <a href="https://alphafold.ebi.ac.uk/" rel="noopener">AlphaFold DB</a> and <a href="https://pubchem.ncbi.nlm.nih.gov/" rel="noopener">PubChem</a>.</p>
</footer>`;
}
