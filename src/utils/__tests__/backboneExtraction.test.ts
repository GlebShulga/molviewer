import { describe, it, expect } from 'vitest';
import { hasBackboneData, isBackboneAtom } from '../backboneExtraction';
import { calculateColorSchemeContext } from '../atomColor';
import type { Atom, Molecule } from '../../types';

const atom = (name: string, element: string, residueName: string, residueNumber = 1): Atom => ({
  id: 0, name, element, residueName, residueNumber, chainId: 'A', x: 0, y: 0, z: 0,
});
const molecule = (atoms: Atom[]): Molecule => ({ name: 'test', atoms, bonds: [] });

describe('isBackboneAtom', () => {
  it('takes a protein alpha carbon and a nucleotide phosphorus', () => {
    expect(isBackboneAtom(atom('CA', 'C', 'ALA'))).toBe(true);
    // Modified residues are in the chain too
    expect(isBackboneAtom(atom('CA', 'C', 'MSE'))).toBe(true);
    expect(isBackboneAtom(atom('P', 'P', 'DA'))).toBe(true);
    expect(isBackboneAtom(atom('P', 'P', 'G'))).toBe(true);
  });

  it('skips what Cartoon cannot trace: a lipid phosphorus, a calcium ion, no residue number', () => {
    expect(isBackboneAtom(atom('P', 'P', 'POPC'))).toBe(false);
    expect(isBackboneAtom(atom('CA', 'CA', 'CA'))).toBe(false);
    expect(isBackboneAtom(atom('CA', 'Ca', 'CA'))).toBe(false);
    expect(isBackboneAtom({ ...atom('CA', 'C', 'ALA'), residueNumber: undefined })).toBe(false);
    expect(isBackboneAtom(atom('N', 'N', 'ALA'))).toBe(false);
  });
});

describe('hasBackboneData and the color context agree', () => {
  const lipids = molecule([atom('P', 'P', 'POPC'), atom('N', 'N', 'POPC'), atom('CA', 'CA', 'CA', 2)]);
  const protein = molecule([atom('N', 'N', 'ALA'), atom('CA', 'C', 'ALA')]);

  it('finds no backbone in lipids and ions, so Cartoon is not offered', () => {
    expect(hasBackboneData(lipids)).toBe(false);
    expect(calculateColorSchemeContext(lipids).hasBackboneData).toBe(false);
  });

  it('finds the backbone of a protein', () => {
    expect(hasBackboneData(protein)).toBe(true);
    expect(calculateColorSchemeContext(protein).hasBackboneData).toBe(true);
  });
});
