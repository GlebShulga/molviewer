/**
 * Site-wide navigation shared by the SPA shell (index.html), landing pages
 * rendered by Pages Functions and the static pages generated at build time.
 */
import { escapeHtml } from './render/html';

export const SITE_ORIGIN = 'https://molviewer.bio';
export const SITE_NAME = 'MolViewer';
export const GITHUB_URL = 'https://github.com/GlebShulga/molviewer';

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
  { label: 'Collections', href: '/collections' },
  { label: 'Small molecules', href: '/compounds' },
  { label: 'Learn', href: '/learn' },
];

export const ABOUT_LINKS: NavLink[] = [
  { label: 'About', href: '/about' },
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

/**
 * Footer with crawlable links to tool pages, collections and the project.
 * `collections` are the featured collection hubs (slug + title).
 */
export function renderFooter(collections: { slug: string; title: string }[] = []): string {
  const collectionLinks = collections.map((c) => ({ label: c.title, href: `/collections/${c.slug}` }));
  return `<footer class="site-footer">
  <nav aria-label="Site">
    <div><h2>Viewers</h2><ul>${linkList(TOOL_LINKS)}</ul></div>
    <div><h2>Explore</h2><ul>${linkList([...EXPLORE_LINKS, ...collectionLinks.slice(0, 6)])}</ul></div>
    <div><h2>Project</h2><ul>${linkList(ABOUT_LINKS)}</ul></div>
  </nav>
  <p class="site-footer-note">MolViewer is free and open source (MIT). Structures come from the <a href="https://www.rcsb.org/" rel="noopener">RCSB PDB</a>, <a href="https://alphafold.ebi.ac.uk/" rel="noopener">AlphaFold DB</a> and <a href="https://pubchem.ncbi.nlm.nih.gov/" rel="noopener">PubChem</a>.</p>
</footer>`;
}
