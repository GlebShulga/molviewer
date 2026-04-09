import { describe, it, expect, beforeEach } from 'vitest';
import { parseMoleculeParams, parseViewParams, buildShareUrl } from '../urlParams';

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

  it('parses HTTPS URL', () => {
    const result = parseMoleculeParams('?url=https://example.com/mol.pdb');
    expect(result).toEqual({ source: 'url', url: 'https://example.com/mol.pdb' });
  });

  it('rejects HTTP URL (non-HTTPS)', () => {
    expect(parseMoleculeParams('?url=http://example.com/mol.pdb')).toBeNull();
  });

  it('rejects invalid URL', () => {
    expect(parseMoleculeParams('?url=not-a-url')).toBeNull();
  });

  it('returns null when no params', () => {
    expect(parseMoleculeParams('')).toBeNull();
    expect(parseMoleculeParams('?foo=bar')).toBeNull();
  });

  it('pdb takes priority over af and url', () => {
    const result = parseMoleculeParams('?pdb=1CRN&af=P69905&url=https://x.com/y.pdb');
    expect(result).toEqual({ source: 'rcsb', id: '1CRN' });
  });

  it('af takes priority over url', () => {
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

describe('buildShareUrl', () => {
  beforeEach(() => {
    // Mock window.location for buildShareUrl
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://molviewer.bio', pathname: '/' },
      writable: true,
    });
  });

  it('builds URL with PDB ID', () => {
    const url = buildShareUrl({ pdbId: '1CRN' });
    expect(url).toBe('https://molviewer.bio/?pdb=1CRN');
  });

  it('builds URL with UniProt ID', () => {
    const url = buildShareUrl({ uniprotId: 'P69905' });
    expect(url).toBe('https://molviewer.bio/?af=P69905');
  });

  it('builds URL with external URL', () => {
    const url = buildShareUrl({ externalUrl: 'https://example.com/mol.pdb' });
    expect(url).toBe('https://molviewer.bio/?url=https%3A%2F%2Fexample.com%2Fmol.pdb');
  });

  it('includes repr and color', () => {
    const url = buildShareUrl({ pdbId: '1CRN', repr: 'cartoon', color: 'chain' });
    expect(url).toBe('https://molviewer.bio/?pdb=1CRN&repr=cartoon&color=chain');
  });

  it('pdbId takes priority over uniprotId', () => {
    const url = buildShareUrl({ pdbId: '1CRN', uniprotId: 'P69905' });
    expect(url).toBe('https://molviewer.bio/?pdb=1CRN');
  });

  it('returns base URL when no source', () => {
    const url = buildShareUrl({});
    expect(url).toBe('https://molviewer.bio/');
  });

  it('includes only repr when no source', () => {
    const url = buildShareUrl({ repr: 'cartoon' });
    expect(url).toBe('https://molviewer.bio/?repr=cartoon');
  });
});
