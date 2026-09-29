/**
 * Writes the static part of the site into the build output (dist/):
 * - tool pages, /about, /compare, /learn and /learn/* (site/content/pages)
 * - /collections and /collections/:slug (data/collections.json)
 * - /compounds and /compound/:slug (data/compounds.json), the latter built
 *   from the SPA shell so the viewer loads the molecule
 * - sitemap index + sitemap-{pages,pdb,af,compounds}.xml
 *
 * Runs after `vite build` (see site/build/vitePlugin.ts). Fails the build on
 * broken internal links.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pages as contentPages } from '../content/pages';
import { SCREENSHOTS } from '../content/screenshots';
import { COLLECTIONS, FEATURED_COLLECTIONS } from '../collections';
import type { AfSeed, Compound, PdbSeed } from '../dataTypes';
import pdbData from '../../data/popularPdbs.json';
import afData from '../../data/alphafold.json';
import compoundData from '../../data/compounds.json';
import { applyShellMeta } from '../render/shell';
import {
  renderCollectionPage,
  renderCollectionsIndex,
  renderCompoundsIndex,
  renderContentPage,
  renderLearnIndex,
  type GeneratedPage,
} from './staticPages';
import { renderCompoundPage } from './compoundPage';
import { renderSitemaps } from './sitemap';
import { findBrokenLinks } from './linkCheck';
import { afCardSpec, pdbCardSpec, renderOgCards, type CardSpec } from './ogCards';
import { shortName } from '../render/pdbPage';

const PDBS = (pdbData as { pdbs: PdbSeed[] }).pdbs;
const AFS = (afData as { entries: AfSeed[] }).entries;
const COMPOUNDS = (compoundData as { compounds: Compound[] }).compounds;

const RELATED_COMPOUNDS = 12;

/** `/pdb-viewer` -> `pdb-viewer.html`, `/learn/x` -> `learn/x.html` (Pages serves them without the extension). */
function fileFor(path: string): string {
  return `${path.replace(/^\//, '')}.html`;
}

function listPublicFiles(publicDir: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.add(`/${relative(publicDir, full).split('\\').join('/')}`);
    }
  };
  walk(publicDir);
  return out;
}

export interface GenerateResult {
  pages: number;
  compounds: number;
  sitemapUrls: number;
  ogRendered: number;
  ogCached: number;
}

/** Card content for every curated PDB and AlphaFold entry. */
function cardSpecs(): CardSpec[] {
  const labelById = new Map<string, string>();
  const collectionsById = new Map<string, string[]>();
  for (const c of COLLECTIONS) {
    for (const item of c.items) {
      if (!labelById.has(item.id)) labelById.set(item.id, item.label);
      collectionsById.set(item.id, [...(collectionsById.get(item.id) ?? []), c.title]);
    }
  }
  const defaultTags = ['Helices and sheets', 'Chains and ligands', 'Measure distances'];
  return [
    ...PDBS.map((p) =>
      pdbCardSpec(p, labelById.get(p.id) ?? shortName({ id: p.id, title: p.title, entities: [] }), collectionsById.get(p.id) ?? defaultTags)
    ),
    ...AFS.map(afCardSpec),
  ];
}

export async function generateSite(outDir: string, publicDir: string, cacheDir: string): Promise<GenerateResult> {
  const shell = readFileSync(join(outDir, 'index.html'), 'utf8');
  const cssHref = shell.match(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"/)?.[1];
  if (!cssHref) throw new Error('site generator: CSS bundle link not found in dist/index.html');

  const ctx = { cssHref, featured: FEATURED_COLLECTIONS };
  const pdbRevised = new Map(PDBS.map((p) => [p.id, p.revised]));

  const content = contentPages.map((p) => (SCREENSHOTS[p.path] ? { ...p, screenshot: SCREENSHOTS[p.path] } : p));
  const staticPages: GeneratedPage[] = [
    ...content.map((p) => renderContentPage(p, ctx)),
    renderLearnIndex(content, ctx),
    renderCollectionsIndex(COLLECTIONS, ctx),
    ...COLLECTIONS.map((c) => renderCollectionPage(c, COLLECTIONS, ctx, pdbRevised)),
    renderCompoundsIndex(COMPOUNDS, ctx),
  ];

  const compoundPages: GeneratedPage[] = COMPOUNDS.map((c) => {
    const related = COMPOUNDS.filter((o) => o.category === c.category && o.slug !== c.slug).slice(0, RELATED_COMPOUNDS);
    return { path: `/compound/${c.slug}`, html: applyShellMeta(shell, renderCompoundPage(c, related)) };
  });

  const allPages = [...staticPages, ...compoundPages];
  const broken = findBrokenLinks([...allPages, { path: '/', html: shell }], {
    staticPaths: new Set(allPages.map((p) => p.path)),
    compoundSlugs: new Set(COMPOUNDS.map((c) => c.slug)),
    publicFiles: listPublicFiles(publicDir),
  });
  if (broken.length) {
    throw new Error(`site generator: ${broken.length} broken internal link(s):\n  ${broken.join('\n  ')}`);
  }

  for (const page of allPages) {
    const file = join(outDir, fileFor(page.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, page.html);
  }

  const sitemaps = renderSitemaps([
    {
      name: 'sitemap-pages.xml',
      urls: [{ path: '/' }, ...staticPages.map((p) => ({ path: p.path, lastmod: p.lastmod }))],
    },
    { name: 'sitemap-pdb.xml', urls: PDBS.map((p) => ({ path: `/pdb/${p.id}`, lastmod: p.revised })) },
    { name: 'sitemap-af.xml', urls: AFS.map((a) => ({ path: `/af/${a.id}`, lastmod: a.revised })) },
    { name: 'sitemap-compounds.xml', urls: COMPOUNDS.map((c) => ({ path: `/compound/${c.slug}` })) },
  ]);
  for (const [name, xml] of sitemaps) writeFileSync(join(outDir, name), xml);

  const og = await renderOgCards(cardSpecs(), outDir, join(cacheDir, 'og'));

  return {
    pages: staticPages.length,
    compounds: compoundPages.length,
    sitemapUrls: 1 + staticPages.length + PDBS.length + AFS.length + COMPOUNDS.length,
    ogRendered: og.rendered,
    ogCached: og.cached,
  };
}
