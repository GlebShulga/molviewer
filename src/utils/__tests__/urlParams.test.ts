import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseMoleculeParams,
  parseViewParams,
  parsePathnameParams,
  getInitialUrlLoad,
  sourceToPath,
  buildShareUrl,
} from '../urlParams';

describe('parseMoleculeParams', () => {
  it('parses valid PDB ID', () => {
    expect(parseMoleculeParams('?pdb=1CRN')).toEqual({ source: 'rcsb', id: '1CRN' });
  });

  it('uppercases PDB ID', () => {
    expect(parseMoleculeParams('?pdb=1crn')).toEqual({ source: 'rcsb', id: '1CRN' });
  });

  it('trims PDB ID whitespace', () => {
    expect(parseMoleculeParams('?pdb=%201CRN%20')).toEqual({ source: 'rcsb', id: '1CRN' });
  });

  it('returns null for invalid PDB ID (too short)', () => {
    expect(parseMoleculeParams('?pdb=1CR')).toBeNull();
  });

  it('returns null for invalid PDB ID (too long)', () => {
    expect(parseMoleculeParams('?pdb=1CRNX')).toBeNull();
  });

  it('returns null for invalid PDB ID (special chars)', () => {
    expect(parseMoleculeParams('?pdb=1C-N')).toBeNull();
  });

  it('parses classic 6-char UniProt ID', () => {
    expect(parseMoleculeParams('?af=P69905')).toEqual({ source: 'alphafold', id: 'P69905' });
  });

  it('parses new 10-char UniProt ID', () => {
    expect(parseMoleculeParams('?af=A0A1B0GTW7')).toEqual({ source: 'alphafold', id: 'A0A1B0GTW7' });
  });

  it('returns null for invalid UniProt ID', () => {
    expect(parseMoleculeParams('?af=INVALID')).toBeNull();
  });

  it('ignores ?url= (loading from arbitrary URLs is not supported)', () => {
    expect(parseMoleculeParams('?url=https://example.com/mol.pdb')).toBeNull();
  });

  it('returns null when no params', () => {
    expect(parseMoleculeParams('')).toBeNull();
    expect(parseMoleculeParams('?foo=bar')).toBeNull();
  });

  it('pdb takes priority over af (and ?url= is ignored)', () => {
    const result = parseMoleculeParams('?pdb=1CRN&af=P69905&url=https://x.com/y.pdb');
    expect(result).toEqual({ source: 'rcsb', id: '1CRN' });
  });

  it('af is used even when ?url= is present', () => {
    const result = parseMoleculeParams('?af=P69905&url=https://x.com/y.pdb');
    expect(result).toEqual({ source: 'alphafold', id: 'P69905' });
  });
});

describe('parseViewParams', () => {
  it('parses valid representation', () => {
    expect(parseViewParams('?repr=cartoon')).toEqual({ repr: 'cartoon' });
  });

  it('parses valid color scheme', () => {
    expect(parseViewParams('?color=chain')).toEqual({ color: 'chain' });
  });

  it('parses both repr and color', () => {
    expect(parseViewParams('?repr=spacefill&color=bfactor')).toEqual({
      repr: 'spacefill',
      color: 'bfactor',
    });
  });

  it('ignores invalid representation', () => {
    expect(parseViewParams('?repr=invalid')).toEqual({});
  });

  it('ignores invalid color scheme', () => {
    expect(parseViewParams('?color=invalid')).toEqual({});
  });

  it('returns empty object when no params', () => {
    expect(parseViewParams('')).toEqual({});
  });
});

describe('parsePathnameParams', () => {
  it('parses readable structure paths', () => {
    expect(parsePathnameParams('/pdb/3dni')).toEqual({ source: 'rcsb', id: '3DNI' });
    expect(parsePathnameParams('/af/P69905')).toEqual({ source: 'alphafold', id: 'P69905' });
    expect(parsePathnameParams('/compound/caffeine')).toEqual({ source: 'pubchem', slug: 'caffeine' });
    expect(parsePathnameParams('/compound/vitamin-c')).toEqual({ source: 'pubchem', slug: 'vitamin-c' });
    expect(parsePathnameParams('/compound/cid/2519')).toEqual({ source: 'pubchem', cid: 2519 });
    expect(parsePathnameParams('/s/TEST12345678')).toEqual({ source: 'share', id: 'TEST12345678' });
  });

  it('marks embed paths', () => {
    expect(parsePathnameParams('/embed/pdb/4HHB')).toEqual({ source: 'rcsb', id: '4HHB', embed: true });
    expect(parsePathnameParams('/embed/compound/caffeine')).toEqual({ source: 'pubchem', slug: 'caffeine', embed: true });
    expect(parsePathnameParams('/embed/s/TEST12345678')).toBeNull();
  });

  it('rejects malformed paths', () => {
    expect(parsePathnameParams('/af/NOTANID')).toBeNull();
    expect(parsePathnameParams('/compound/cid/0')).toBeNull();
    expect(parsePathnameParams('/embed/compound/cid/007')).toBeNull();
    expect(parsePathnameParams('/pdb/ZZZZZ')).toBeNull();
    expect(parsePathnameParams('/compound/Caffeine')).toBeNull();
    expect(parsePathnameParams('/compound/-bad-')).toBeNull();
    expect(parsePathnameParams('/random')).toBeNull();
  });
});

describe('getInitialUrlLoad', () => {
  it('prefers the path over query parameters', () => {
    expect(getInitialUrlLoad({ pathname: '/pdb/3DNI', search: '?af=P69905' })).toEqual({ source: 'rcsb', id: '3DNI' });
  });

  it('returns null for unparseable input, so nothing waits for a load', () => {
    expect(getInitialUrlLoad({ pathname: '/', search: '?pdb=abc' })).toBeNull();
    expect(getInitialUrlLoad({ pathname: '/af/NOTANID', search: '' })).toBeNull();
    expect(getInitialUrlLoad({ pathname: '/', search: '?url=https://example.com/x.pdb' })).toBeNull();
  });
});

describe('sourceToPath', () => {
  it('maps every addressable source', () => {
    expect(sourceToPath({ type: 'rcsb', id: '4HHB' })).toBe('/pdb/4HHB');
    expect(sourceToPath({ type: 'alphafold', id: 'P69905' })).toBe('/af/P69905');
    expect(sourceToPath({ type: 'pubchem', cid: 2519, slug: 'caffeine' })).toBe('/compound/caffeine');
    expect(sourceToPath({ type: 'pubchem', cid: 2519 })).toBe('/compound/cid/2519');
  });

  it('local files have no address', () => {
    expect(sourceToPath({ type: 'inline', format: 'pdb', data: '' })).toBeNull();
    expect(sourceToPath(undefined)).toBeNull();
  });
});

describe('buildShareUrl', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://molviewer.bio', pathname: '/' },
      writable: true,
    });
  });

  it('builds readable URLs', () => {
    expect(buildShareUrl({ source: { type: 'rcsb', id: '1CRN' } })).toBe('https://molviewer.bio/pdb/1CRN');
    expect(buildShareUrl({ source: { type: 'alphafold', id: 'P69905' } })).toBe('https://molviewer.bio/af/P69905');
    expect(buildShareUrl({ source: { type: 'pubchem', cid: 2519, slug: 'caffeine' } })).toBe(
      'https://molviewer.bio/compound/caffeine'
    );
  });

  it('includes repr and color', () => {
    expect(buildShareUrl({ source: { type: 'rcsb', id: '1CRN' }, repr: 'cartoon', color: 'chain' })).toBe(
      'https://molviewer.bio/pdb/1CRN?repr=cartoon&color=chain'
    );
  });

  it('returns the base URL without an addressable source', () => {
    expect(buildShareUrl({})).toBe('https://molviewer.bio/');
    expect(buildShareUrl({ source: { type: 'inline', format: 'pdb', data: '' } })).toBe('https://molviewer.bio/');
  });

  // Regression: links used to be built on the current path, and the path wins
  // over ?af= on load, so a link copied on /pdb/3DNI for an AlphaFold model
  // (/pdb/3DNI?af=P69905) reopened 3DNI.
  it('ignores the current path', () => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://molviewer.bio', pathname: '/pdb/3DNI' },
      writable: true,
    });
    const url = buildShareUrl({ source: { type: 'alphafold', id: 'P69905' } });
    expect(url).toBe('https://molviewer.bio/af/P69905');
    expect(getInitialUrlLoad(new URL(url))).toEqual({ source: 'alphafold', id: 'P69905' });
  });
});
