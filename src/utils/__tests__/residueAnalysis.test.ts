import { describe, expect, it } from 'vitest';
import { analyzeResidues } from '../residueAnalysis';
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
});
