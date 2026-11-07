import { describe, expect, it } from 'vitest';
import { analyzeResidues, atomResidueId, residueId, residueKey } from '../residueAnalysis';
import type { Atom } from '../../types';

describe('analyzeResidues', () => {
  it('keeps atoms without a residue number apart from a real residue 0', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'C', name: 'C1', residueName: 'LIG', residueNumber: 0, chainId: 'A', x: 0, y: 0, z: 0 },
      { id: 1, element: 'C', name: 'C2', residueName: 'LIG', residueNumber: undefined, chainId: 'A', x: 1, y: 0, z: 0 },
    ];
    const [chain] = analyzeResidues(atoms);
    expect(chain.residues).toHaveLength(2);
    expect(chain.residues.map((r) => r.atoms.length)).toEqual([1, 1]);
  });

  it('gives residue 0 and a residue without a number different keys, and sorts the one without a number last', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'C', name: 'C1', residueName: 'LIG', residueNumber: undefined, chainId: 'A', x: 0, y: 0, z: 0 },
      { id: 1, element: 'N', name: 'N', residueName: 'GLY', residueNumber: 0, chainId: 'A', x: 1, y: 0, z: 0 },
      { id: 2, element: 'N', name: 'N', residueName: 'ALA', residueNumber: 1, chainId: 'A', x: 2, y: 0, z: 0 },
    ];
    const [chain] = analyzeResidues(atoms);
    const keys = chain.residues.map((r) => residueKey(r.chainId, r.number, r.insertionCode));
    expect(new Set(keys).size).toBe(3);
    expect(chain.residues.map((r) => r.name)).toEqual(['GLY', 'ALA', 'LIG']);
    // The same key an atom of that residue gets
    expect(keys[2]).toBe(residueKey('A', atoms[0].residueNumber, atoms[0].insertionCode));
  });
});

describe('residueId', () => {
  it('tells apart a residue and a ligand with the same number in one chain', () => {
    const atom = (id: number, residueName: string, residueNumber: number): Atom => ({
      id, element: 'C', name: 'C1', residueName, residueNumber, chainId: 'A', x: id, y: 0, z: 0,
    });
    const atoms = [atom(0, 'MET', 1), atom(1, 'ALA', 2), atom(2, 'LIG', 1)];
    const [chain] = analyzeResidues(atoms);
    const ids = chain.residues.map((r) => residueId(r.chainId, r.name, r.number, r.insertionCode));
    expect(new Set(ids).size).toBe(3);
    // The same id an atom of that residue gets
    expect(ids).toContain(atomResidueId(atoms[2]));
    expect(atomResidueId(atoms[2])).not.toBe(atomResidueId(atoms[0]));
  });

  it("names a residue without a name 'UNK' and one without a number 'none', as analyzeResidues groups them", () => {
    const [chain] = analyzeResidues([{ id: 0, element: 'O', x: 0, y: 0, z: 0 }]);
    const [r] = chain.residues;
    expect(residueId(r.chainId, r.name, r.number, r.insertionCode)).toBe('Unknown:UNK:none');
    expect(atomResidueId({})).toBe('Unknown:UNK:none');
  });
});
