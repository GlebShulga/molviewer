// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { findBrokenLinks } from './linkCheck';
import { renderSitemaps } from './sitemap';
import { embedSize, embedSnippet, embedTarget } from '../embed';
import slugsByCid from '../../data/compoundSlugs.json';
import compoundData from '../../data/compounds.json';
import type { Collection, Compound } from '../dataTypes';
import { COLLECTIONS, FEATURED_COLLECTIONS } from '../collections';
import { renderCompoundPage } from './compoundPage';
import { renderCollectionPage, renderCollectionsIndex } from './staticPages';
import { cardTree, compoundCardSpec, renderSquareFallback } from './ogCards';
import { renderStaticDocument } from '../render/layout';
import { SQUARE_FALLBACK } from '../ogImages';
import { mkdtempSync, readFileSync as readFile, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import compoundArt from '../../data/og-art/compound.json';
import type { BallStickArt, OgArtFile } from '../moleculeArt';

const COMPOUNDS = (compoundData as { compounds: Compound[] }).compounds;

describe('findBrokenLinks', () => {
  const input = {
    staticPaths: new Set(['/pdb-viewer', '/collections/enzymes']),
    compoundSlugs: new Set(['caffeine']),
    publicFiles: new Set(['/favicon.svg']),
  };

  it('accepts real routes', () => {
    const html = [
      '/', '/pdb-viewer', '/collections/enzymes', '/pdb/4HHB?repr=cartoon&amp;color=chain', '/af/P69905',
      '/compound/caffeine', '/compound/cid/2519', '/favicon.svg', '/assets/index.css', '/#page-info',
    ].map((h) => `<a href="${h}">x</a>`).join('');
    expect(findBrokenLinks([{ path: '/x', html }], input)).toEqual([]);
  });

  it('reports links to pages that do not exist', () => {
    const html = '<a href="/collections/antibodies">x</a><a href="/compound/unobtainium">y</a><a href="/pdb/TOOLONG">z</a>';
    expect(findBrokenLinks([{ path: '/x', html }], input)).toEqual([
      '/x -> /collections/antibodies',
      '/x -> /compound/unobtainium',
      '/x -> /pdb/TOOLONG',
    ]);
  });
});

describe('renderSitemaps', () => {
  it('writes an index plus one urlset per file, with lastmod only when known', () => {
    const out = renderSitemaps([
      { name: 'sitemap-pdb.xml', urls: [{ path: '/pdb/4HHB', lastmod: '2024-05-22' }] },
      { name: 'sitemap-compounds.xml', urls: [{ path: '/compound/caffeine' }] },
    ]);
    expect([...out.keys()].sort()).toEqual(['sitemap-compounds.xml', 'sitemap-pdb.xml', 'sitemap.xml']);
    expect(out.get('sitemap.xml')).toContain('<loc>https://molviewer.bio/sitemap-pdb.xml</loc><lastmod>2024-05-22</lastmod>');
    expect(out.get('sitemap-compounds.xml')).toContain('<url><loc>https://molviewer.bio/compound/caffeine</loc></url>');
  });
});

describe('collection lastmod', () => {
  const ctx = { cssHref: '/assets/index.css', featured: FEATURED_COLLECTIONS };
  const newer: Collection = {
    slug: 'newer', title: 'Newer', intro: 'x', updated: '2026-11-01',
    items: [{ type: 'af', id: 'P69905', label: 'a' }, { type: 'af', id: 'P04637', label: 'b' }],
  };
  const older: Collection = {
    slug: 'older', title: 'Older', intro: 'x', updated: '2026-10-20',
    items: [{ type: 'pdb', id: '4HHB', label: 'a' }, { type: 'af', id: 'P04637', label: 'b' }],
  };

  it('is the collection’s own updated date, not a revision date of its structures', () => {
    expect(renderCollectionPage(newer, [newer, older], ctx).lastmod).toBe('2026-11-01');
    expect(renderCollectionPage(older, [newer, older], ctx).lastmod).toBe('2026-10-20');
  });

  it('gives /collections the newest updated date across collections', () => {
    expect(renderCollectionsIndex([newer, older], ctx).lastmod).toBe('2026-11-01');
    expect(renderCollectionsIndex([older, newer], ctx).lastmod).toBe('2026-11-01');
  });
});

describe('embeds', () => {
  it('maps pages and embeds to the same target', () => {
    expect(embedTarget('/pdb/4hhb')).toEqual({ kind: 'pdb', key: '4HHB', pagePath: '/pdb/4HHB', embedPath: '/embed/pdb/4HHB', label: 'PDB 4HHB' });
    expect(embedTarget('/embed/compound/cid/2519')).toMatchObject({ kind: 'cid', key: '2519' });
    expect(embedTarget('/compound/cid/0')).toBeNull();
    expect(embedTarget('/embed/af/P69905')?.pagePath).toBe('/af/P69905');
    expect(embedTarget('/compound/vitamin-c')?.label).toBe('Vitamin c');
    expect(embedTarget('/s/abcdefgh1234')).toBeNull();
    expect(embedTarget('/af/NOTANID')).toBeNull();
  });

  it('builds an iframe snippet with view options', () => {
    const snippet = embedSnippet('https://molviewer.bio', embedTarget('/pdb/4HHB')!, { repr: 'cartoon', spin: true, bg: 'light' });
    expect(snippet).toContain('src="https://molviewer.bio/embed/pdb/4HHB?repr=cartoon&amp;spin=1&amp;bg=light"');
    expect(snippet).toMatch(/^<iframe [^>]*><\/iframe>$/);
  });
});

describe('collections data', () => {
  it('has the 8 featured collections with unique slugs', () => {
    expect(FEATURED_COLLECTIONS).toHaveLength(8);
    expect(new Set(COLLECTIONS.map((c) => c.slug)).size).toBe(COLLECTIONS.length);
  });
});

describe('embedSize', () => {
  it('rejects negative, zero and non-numeric sizes, and never exceeds the requested maximum', () => {
    expect(embedSize('-100', 800)).toBe(800);
    expect(embedSize('0', 800)).toBe(800);
    expect(embedSize('abc', 800)).toBe(800);
    expect(embedSize(null, 600)).toBe(600);
    expect(embedSize('50', 800)).toBe(50);
    expect(embedSize('640.7', 800)).toBe(640);
  });
});

describe('compound slug map', () => {
  it('matches data/compounds.json exactly', () => {
    const expected = Object.fromEntries(COMPOUNDS.map((c) => [String(c.cid), c.slug]));
    expect(slugsByCid).toEqual(expected);
  });
});

describe('compound social cards', () => {
  const caffeine = COMPOUNDS.find((c) => c.slug === 'caffeine')!;
  const art = (compoundArt as OgArtFile<BallStickArt>).entries.caffeine;

  it('compound pages point at their pre-rendered card', () => {
    expect(renderCompoundPage(caffeine, []).ogImage).toEqual({
      url: 'https://molviewer.bio/og/compound/caffeine.png',
      type: 'image/png',
      width: 1200,
      height: 630,
    });
  });

  it('puts the picture next to the text, or falls back to the text-only card', () => {
    const withArt = JSON.stringify(cardTree(compoundCardSpec(caffeine, art)));
    expect(withArt).toContain('"src":"data:image/svg+xml;base64,');
    expect(withArt).toContain('molviewer.bio/compound/caffeine');
    const textOnly = JSON.stringify(cardTree(compoundCardSpec(caffeine)));
    expect(textOnly).not.toContain('data:image/svg+xml');
    expect(textOnly).toContain('Caffeine');
  });
});

describe('social image fallbacks', () => {
  it('renders the square fallback as the 500x500 JPEG that non-curated PDB pages announce', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'og-'));
    try {
      await renderSquareFallback(dir);
      const meta = await sharp(readFile(join(dir, SQUARE_FALLBACK.path))).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', SQUARE_FALLBACK.width, SQUARE_FALLBACK.height]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('static pages write the image type and size', () => {
    const html = renderStaticDocument({ path: '/x', title: 't', description: 'd', mainHtml: '', cssHref: '/a.css' });
    expect(html).toContain('<meta property="og:image" content="https://molviewer.bio/og-image.png">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });
});
