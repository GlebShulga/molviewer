// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { findBrokenLinks } from './linkCheck';
import { renderSitemaps } from './sitemap';
import { embedSize, embedSnippet, embedTarget } from '../embed';
import slugsByCid from '../../data/compoundSlugs.json';
import compoundData from '../../data/compounds.json';
import type { Compound } from '../dataTypes';
import { COLLECTIONS, FEATURED_COLLECTIONS } from '../collections';

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
  it('has the 8 featured home-page topics with unique slugs', () => {
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
