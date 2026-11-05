import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  atomStyleLimit,
  atomStyleLimitLabel,
  colorSchemeAvailability,
  DESKTOP_ATOM_STYLE_LIMIT,
  isStyleLimited,
  representationAvailability,
  styleFallbackMessage,
  TOUCH_ATOM_STYLE_LIMIT,
} from '../representationAvailability';
import type { Atom, Molecule } from '../../types';

const protein = { visible: true, atomCount: 4_800, hasBackbone: true, touch: false };
const ligand = { visible: true, atomCount: 24, hasBackbone: false, touch: false };

/** A chain of residues of N, CA, C, O, or the same atoms without CA (no backbone). */
function chain(atomCount: number, backbone = true): Molecule {
  const names = backbone ? ['N', 'CA', 'C', 'O'] : ['N', 'CB', 'C', 'O'];
  const atoms: Atom[] = Array.from({ length: atomCount }, (_, i) => ({
    id: i, element: names[i % 4][0], name: names[i % 4], residueName: 'ALA',
    residueNumber: Math.floor(i / 4) + 1, chainId: 'A', x: i, y: 0, z: 0,
  }));
  return { name: 'chain', atoms, bonds: [] };
}

describe('representationAvailability', () => {
  it('keeps the atom styles on a desktop up to 100,000 atoms (4HHB and 1AON included)', () => {
    for (const rep of ['ball-and-stick', 'stick', 'spacefill'] as const) {
      expect(representationAvailability(rep, protein).available).toBe(true);
      expect(representationAvailability(rep, { ...protein, atomCount: 58_870 }).available).toBe(true);
      expect(representationAvailability(rep, { ...protein, atomCount: DESKTOP_ATOM_STYLE_LIMIT }).available).toBe(true);
    }
  });

  it('stops Ball & Stick and Stick over 100,000 atoms with a backbone on a desktop', () => {
    const ribosome = { ...protein, atomCount: DESKTOP_ATOM_STYLE_LIMIT + 1 };
    for (const rep of ['ball-and-stick', 'stick'] as const) {
      expect(representationAvailability(rep, ribosome)).toEqual({
        available: false,
        reason: 'over 100,000 atoms; use Cartoon or Spacefill',
      });
      // Not without a backbone: there is no Cartoon to fall back on
      expect(representationAvailability(rep, { ...ribosome, hasBackbone: false }).available).toBe(true);
    }
    // Spacefill stays fast through impostors, and Cartoon is the fallback
    expect(representationAvailability('spacefill', { ...ribosome, atomCount: 237_685 }).available).toBe(true);
    expect(representationAvailability('cartoon', ribosome).available).toBe(true);
  });

  it('keeps the real limits, with reasons', () => {
    expect(representationAvailability('cartoon', ligand)).toEqual({ available: false, reason: 'needs a protein or nucleic-acid backbone' });
    expect(representationAvailability('surface-vdw', ligand).reason).toBe('needs at least 100 atoms');
    expect(representationAvailability('surface-vdw', { ...protein, atomCount: 150_000 }).reason).toBe('too many atoms');
    expect(representationAvailability('stick', { ...protein, visible: false }).reason).toBe('the structure is hidden');
  });

  it('stops Ball & Stick and Stick over 1,000 atoms with a backbone on a touch screen', () => {
    const touch = { ...protein, touch: true };
    for (const rep of ['ball-and-stick', 'stick'] as const) {
      expect(representationAvailability(rep, { ...touch, atomCount: TOUCH_ATOM_STYLE_LIMIT }).available).toBe(true);
      expect(representationAvailability(rep, { ...touch, atomCount: TOUCH_ATOM_STYLE_LIMIT + 1 })).toEqual({
        available: false,
        reason: 'over 1,000 atoms on a touch screen; use Cartoon or Spacefill',
      });
      // Not on a desktop, and not without a backbone (no Cartoon to fall back on)
      expect(representationAvailability(rep, { ...protein, atomCount: TOUCH_ATOM_STYLE_LIMIT + 1 }).available).toBe(true);
      expect(representationAvailability(rep, { ...touch, hasBackbone: false, atomCount: 5_000 }).available).toBe(true);
    }
    expect(representationAvailability('spacefill', touch).available).toBe(true);
    expect(representationAvailability('cartoon', touch).available).toBe(true);
  });
});

describe('isStyleLimited', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubTouch = (coarse: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));

  it('reads the device and the molecule', () => {
    stubTouch(true);
    expect(isStyleLimited('ball-and-stick', chain(1_200))).toBe(true);
    expect(isStyleLimited('stick', chain(1_200))).toBe(true);
    expect(isStyleLimited('stick', chain(1_000))).toBe(false);
    expect(isStyleLimited('spacefill', chain(1_200))).toBe(false);
    expect(isStyleLimited('stick', chain(1_200, false))).toBe(false);

    stubTouch(false);
    expect(isStyleLimited('ball-and-stick', chain(1_200))).toBe(false);
    expect(isStyleLimited('ball-and-stick', chain(DESKTOP_ATOM_STYLE_LIMIT))).toBe(false);
    expect(isStyleLimited('ball-and-stick', chain(DESKTOP_ATOM_STYLE_LIMIT + 4))).toBe(true);
    expect(isStyleLimited('stick', chain(DESKTOP_ATOM_STYLE_LIMIT + 4, false))).toBe(false);
  });

  it('names the requested style and this device\'s limit in the fallback message', () => {
    stubTouch(true);
    expect(styleFallbackMessage('stick')).toBe('Showing Cartoon: Stick is limited to 1,000 atoms on touch screens');
    stubTouch(false);
    expect(styleFallbackMessage('ball-and-stick')).toBe('Showing Cartoon: Ball & Stick is limited to 100,000 atoms');
  });

  it('names the limit from the constants in every text', () => {
    for (const touch of [true, false]) {
      const label = atomStyleLimitLabel(touch);
      expect(label).toBe(atomStyleLimit(touch).toLocaleString('en-US'));
      const facts = { ...protein, atomCount: atomStyleLimit(touch) + 1, touch };
      expect(representationAvailability('stick', facts).reason).toContain(`over ${label} atoms`);
      stubTouch(touch);
      expect(styleFallbackMessage('ball-and-stick')).toContain(`limited to ${label} atoms`);
    }
    expect(atomStyleLimit(true)).toBe(TOUCH_ATOM_STYLE_LIMIT);
    expect(atomStyleLimit(false)).toBe(DESKTOP_ATOM_STYLE_LIMIT);
  });
});

describe('colorSchemeAvailability', () => {
  const facts = {
    visible: true,
    representation: 'ball-and-stick' as const,
    hasBackbone: true,
    hasResidueData: true,
    hasBfactorData: true,
    hasResidueNumbers: true,
    hasSecondaryStructure: false,
  };

  it('turns CPK off for Cartoon only', () => {
    expect(colorSchemeAvailability('cpk', facts).available).toBe(true);
    expect(colorSchemeAvailability('cpk', { ...facts, representation: 'cartoon' }).available).toBe(false);
  });

  it('needs the data a scheme colors by', () => {
    expect(colorSchemeAvailability('bfactor', { ...facts, hasBfactorData: false }).reason).toBe('no B-factor values in this file');
    // Helices and sheets can be found from the backbone
    expect(colorSchemeAvailability('secondaryStructure', facts).available).toBe(true);
    expect(colorSchemeAvailability('secondaryStructure', { ...facts, hasBackbone: false }).available).toBe(false);
  });
});
