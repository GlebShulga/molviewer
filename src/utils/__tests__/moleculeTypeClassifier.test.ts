import { describe, expect, it } from 'vitest';
import { classifyMolecule } from '../moleculeTypeClassifier';
import { analyzeResidues } from '../residueAnalysis';
import type { Atom, Molecule } from '../../types';

/**
 * A residue whose atoms are not contiguous in the file: ALA 1 is split by a
 * water written between its atoms (TER-less files, and hydrogens listed
 * after the heavy atoms, do this).
 */
function splitResidue(): Molecule {
  const atom = (id: number, name: string, element: string, residueName: string, residueNumber: number): Atom => ({
    id, name, element, residueName, residueNumber, chainId: 'A', x: id * 1.5, y: 0, z: 0,
  });
  return {
    name: 'split',
    atoms: [atom(0, 'N', 'N', 'ALA', 1), atom(1, 'CA', 'C', 'ALA', 1), atom(2, 'O', 'O', 'HOH', 2), atom(3, 'C', 'C', 'ALA', 1)],
    bonds: [],
  };
}

describe('residue atom indices', () => {
  it('lists every atom of a residue whose atoms are split in the file', () => {
    const [chain] = analyzeResidues(splitResidue().atoms);
    expect(chain.residues.find((r) => r.name === 'ALA')!.atomIndices).toEqual([0, 1, 3]);
  });

  it('puts a split residue\'s atoms in its component', () => {
    const { components } = classifyMolecule(splitResidue());
    expect(components.find((c) => c.type === 'protein')!.atomIndices.sort()).toEqual([0, 1, 3]);
    expect(components.find((c) => c.type === 'water')!.atomIndices).toEqual([2]);
  });
});

describe('large files', () => {
  it('classifies 200,000 atoms in one residue (an XYZ file) without overflowing the call stack', () => {
    const atoms: Atom[] = Array.from({ length: 200_000 }, (_, id) => ({ id, element: 'C', x: id, y: 0, z: 0 }));
    const { components } = classifyMolecule({ name: 'big', atoms, bonds: [] });
    expect(components).toHaveLength(1);
    expect(components[0].atomIndices).toHaveLength(200_000);
  });
});
