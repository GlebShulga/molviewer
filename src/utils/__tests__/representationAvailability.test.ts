import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  atomStyleLimit,
  atomStyleLimitLabel,
  availableColor,
  colorSchemeAvailability,
  colorToShow,
  DESKTOP_ATOM_STYLE_LIMIT,
  isStyleLimited,
  representationAvailability,
  styleFallbackMessage,
  styleLimitFallback,
  styleLimitNote,
  styleToShow,
  TOUCH_ATOM_STYLE_LIMIT,
} from '../representationAvailability';
import { calculateColorSchemeContext } from '../atomColor';
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
      // Without a backbone too, with Spacefill instead (a 150,000-atom XYZ file)
      expect(representationAvailability(rep, { ...ribosome, hasBackbone: false })).toEqual({
        available: false,
        reason: 'over 100,000 atoms; use Spacefill',
      });
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
      // Not on a desktop
      expect(representationAvailability(rep, { ...protein, atomCount: TOUCH_ATOM_STYLE_LIMIT + 1 }).available).toBe(true);
      // Without a backbone too (a small-molecule file of 5,000 atoms), with Spacefill instead
      expect(representationAvailability(rep, { ...touch, hasBackbone: false, atomCount: 5_000 })).toEqual({
        available: false,
        reason: 'over 1,000 atoms on a touch screen; use Spacefill',
      });
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
    // Without a backbone too
    expect(isStyleLimited('stick', chain(1_200, false))).toBe(true);

    stubTouch(false);
    expect(isStyleLimited('ball-and-stick', chain(1_200))).toBe(false);
    expect(isStyleLimited('ball-and-stick', chain(DESKTOP_ATOM_STYLE_LIMIT))).toBe(false);
    expect(isStyleLimited('ball-and-stick', chain(DESKTOP_ATOM_STYLE_LIMIT + 4))).toBe(true);
    expect(isStyleLimited('stick', chain(DESKTOP_ATOM_STYLE_LIMIT + 4, false))).toBe(true);
  });

  it('limits a lipid system too, and shows it in Spacefill: its phosphorus is no backbone, so there is no Cartoon', () => {
    stubTouch(false);
    const atoms: Atom[] = Array.from({ length: DESKTOP_ATOM_STYLE_LIMIT + 4 }, (_, i) => ({
      id: i, element: i % 4 === 0 ? 'P' : 'C', name: i % 4 === 0 ? 'P' : `C${i % 4}`, residueName: 'POPC',
      residueNumber: Math.floor(i / 4) + 1, chainId: 'M', x: i, y: 0, z: 0,
    }));
    const membrane = { name: 'membrane', atoms, bonds: [] };
    expect(isStyleLimited('ball-and-stick', membrane)).toBe(true);
    expect(styleLimitFallback(membrane)).toBe('spacefill');
    expect(styleLimitFallback(chain(DESKTOP_ATOM_STYLE_LIMIT + 4))).toBe('cartoon');
  });

  it('names the style shown, the requested style and this device\'s limit in the fallback message', () => {
    stubTouch(true);
    expect(styleFallbackMessage('stick', 'cartoon')).toBe('Showing Cartoon: Stick is limited to 1,000 atoms on touch screens');
    stubTouch(false);
    expect(styleFallbackMessage('ball-and-stick', 'cartoon')).toBe('Showing Cartoon: Ball & Stick is limited to 100,000 atoms');
    expect(styleFallbackMessage('ball-and-stick', 'spacefill')).toBe('Showing Spacefill: Ball & Stick is limited to 100,000 atoms');
  });

  it('names the limit from the constants in every text', () => {
    for (const touch of [true, false]) {
      const label = atomStyleLimitLabel(touch);
      expect(label).toBe(atomStyleLimit(touch).toLocaleString('en-US'));
      const facts = { ...protein, atomCount: atomStyleLimit(touch) + 1, touch };
      expect(representationAvailability('stick', facts).reason).toContain(`over ${label} atoms`);
      stubTouch(touch);
      expect(styleFallbackMessage('ball-and-stick', 'cartoon')).toContain(`limited to ${label} atoms`);
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

describe('styleToShow (links, sessions and the widget)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows Ball & Stick for Cartoon without a backbone, the limit fallback over the limit, and both', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    expect(styleToShow('cartoon', chain(400, false))).toBe('ball-and-stick');
    expect(styleToShow('ball-and-stick', chain(1_200))).toBe('cartoon');
    // Cartoon can't trace it, and Ball & Stick is over the touch limit
    expect(styleToShow('cartoon', chain(1_200, false))).toBe('spacefill');
    expect(styleToShow('cartoon', chain(1_200))).toBe('cartoon');
    expect(styleToShow('stick', chain(400, false))).toBe('stick');
  });

  it('gives the backbone reason when Cartoon fell back, the limit otherwise', () => {
    expect(styleFallbackMessage('cartoon', 'ball-and-stick')).toBe('Showing Ball & Stick: Cartoon needs a protein or nucleic-acid backbone');
    expect(styleFallbackMessage('cartoon', 'spacefill')).toBe('Showing Spacefill: Cartoon needs a protein or nucleic-acid backbone');
  });
});

describe('availableColor and colorToShow', () => {
  const withHelices = (molecule: Molecule): Molecule => ({
    ...molecule,
    atoms: molecule.atoms.map((a) => ({ ...a, secondaryStructure: 'helix' as const })),
  });

  it('gives CPK for Secondary structure without a backbone or helix and sheet records, and keeps it with them', () => {
    const noBackbone = calculateColorSchemeContext(chain(40, false));
    expect(availableColor('secondaryStructure', 'ball-and-stick', noBackbone)).toBe('cpk');
    expect(availableColor('secondaryStructure', 'ball-and-stick', calculateColorSchemeContext(withHelices(chain(40, false))))).toBe('secondaryStructure');
    expect(availableColor('secondaryStructure', 'ball-and-stick', calculateColorSchemeContext(chain(40)))).toBe('secondaryStructure');
    expect(availableColor('rainbow', 'ball-and-stick', noBackbone)).toBe('rainbow');
  });

  it('repairs the color only when Cartoon fell back', () => {
    const molecule = chain(40, false);
    expect(colorToShow('secondaryStructure', 'cartoon', 'ball-and-stick', molecule)).toBe('cpk');
    expect(colorToShow('secondaryStructure', 'stick', 'stick', molecule)).toBe('secondaryStructure');
    expect(colorToShow('secondaryStructure', 'cartoon', 'cartoon', chain(40))).toBe('secondaryStructure');
  });
});

describe('styleLimitNote (keys 1 and 2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the style to use instead: Cartoon with a backbone, Spacefill without', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    const atoms = (backbone: boolean): Molecule => ({
      name: 'm',
      atoms: Array.from({ length: 1_200 }, (_, i) => ({
        id: i, element: 'C', name: backbone && i % 4 === 1 ? 'CA' : `C${i % 4}`, residueName: 'ALA',
        residueNumber: Math.floor(i / 4) + 1, chainId: 'A', x: i, y: 0, z: 0,
      })),
      bonds: [],
    });
    expect(styleLimitNote('ball-and-stick', atoms(true))).toBe('Ball & Stick: over 1,000 atoms on a touch screen; use Cartoon or Spacefill');
    expect(styleLimitNote('stick', atoms(false))).toBe('Stick: over 1,000 atoms on a touch screen; use Spacefill');
  });
});
