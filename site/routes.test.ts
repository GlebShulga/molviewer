// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizePath, parseRoute, sourceRoute, structurePath } from './routes';
import { pageKind } from './events';

describe('routes', () => {
  it('parses every readable route, with or without a trailing slash', () => {
    expect(parseRoute('/')).toEqual({ page: 'home' });
    expect(parseRoute('/pdb/4hhb/')).toEqual({ page: 'structure', structure: { kind: 'pdb', id: '4HHB' }, embed: false });
    expect(parseRoute('/af/P69905')).toMatchObject({ structure: { kind: 'af', id: 'P69905' } });
    expect(parseRoute('/compound/vitamin-c')).toMatchObject({ structure: { kind: 'compound', slug: 'vitamin-c' } });
    expect(parseRoute('/compound/cid/2519/')).toMatchObject({ structure: { kind: 'cid', cid: 2519 } });
    expect(parseRoute('/embed/pdb/4HHB')).toMatchObject({ page: 'structure', embed: true });
    expect(parseRoute('/s/Ab12Cd34Ef56')).toEqual({ page: 'share', id: 'Ab12Cd34Ef56' });
  });

  it('rejects malformed paths', () => {
    for (const p of ['/pdb/ZZZZZ', '/af/NOTANID', '/compound/cid/0', '/compound/Bad', '/embed/s/Ab12Cd34Ef56', '/s/short', '/random']) {
      expect(parseRoute(p)).toEqual({ page: 'other' });
    }
  });

  it('round-trips structure routes and maps sources, ignoring unknown source types', () => {
    for (const p of ['/pdb/4HHB', '/af/P69905', '/compound/caffeine', '/compound/cid/5234']) {
      const r = parseRoute(p);
      if (r.page !== 'structure') throw new Error(p);
      expect(structurePath(r.structure)).toBe(p);
    }
    expect(sourceRoute({ type: 'pubchem', cid: 2519, slug: 'caffeine' })).toEqual({ kind: 'compound', slug: 'caffeine' });
    expect(sourceRoute({ type: 'url', id: 'x' })).toBeNull();
    expect(sourceRoute({ type: 'rcsb', id: 5 })).toBeNull();
    expect(normalizePath('/pdb/4HHB//')).toBe('/pdb/4HHB');
  });

  it('gives a stored source a route only when its id is valid', () => {
    // Shares are stored by clients, so their sources can hold anything
    expect(sourceRoute({ type: 'rcsb', id: '4hhb' })).toEqual({ kind: 'pdb', id: '4HHB' });
    expect(sourceRoute({ type: 'rcsb', id: '4HHB"><script>' })).toBeNull();
    expect(sourceRoute({ type: 'rcsb', id: '../../x' })).toBeNull();
    expect(sourceRoute({ type: 'alphafold', id: 'p69905' })).toEqual({ kind: 'af', id: 'P69905' });
    expect(sourceRoute({ type: 'alphafold', id: 'NOT-AN-ACCESSION' })).toBeNull();
    expect(sourceRoute({ type: 'pubchem', slug: 'Bad Slug!' })).toBeNull();
    expect(sourceRoute({ type: 'pubchem', slug: 'a'.repeat(81) })).toBeNull();
    // An invalid slug falls through to a valid CID
    expect(sourceRoute({ type: 'pubchem', slug: 'Bad Slug!', cid: 2519 })).toEqual({ kind: 'cid', cid: 2519 });
    expect(sourceRoute({ type: 'pubchem', cid: 1.5 })).toBeNull();
    expect(sourceRoute({ type: 'pubchem', cid: 12345678901 })).toBeNull();
    expect(sourceRoute({ type: 'pubchem', cid: Number.MAX_SAFE_INTEGER + 2 })).toBeNull();
  });

  it('classifies pages for analytics', () => {
    expect(pageKind('/')).toBe('home');
    expect(pageKind('/compound/cid/5234')).toBe('compound');
    expect(pageKind('/embed/af/P69905')).toBe('embed');
    expect(pageKind('/learn/plddt-explained')).toBe('other');
  });
});
