import { describe, it, expect } from 'vitest';
import { inferBondsFromDistance } from '../bondInference';
import type { Atom } from '../../types';

describe('inferBondsFromDistance', () => {
  it('detects O-H bonds in water', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'O', x: 0, y: 0, z: 0 },
      { id: 1, element: 'H', x: 0.96, y: 0, z: 0 },
      { id: 2, element: 'H', x: -0.24, y: 0.93, z: 0 },
    ];

    const bonds = inferBondsFromDistance(atoms);

    expect(bonds).toHaveLength(2);
    expect(bonds[0]).toEqual({ atom1Index: 0, atom2Index: 1, order: 1 });
    expect(bonds[1]).toEqual({ atom1Index: 0, atom2Index: 2, order: 1 });
  });

  it('does not create bonds for distant atoms', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'C', x: 0, y: 0, z: 0 },
      { id: 1, element: 'C', x: 10, y: 0, z: 0 },
    ];

    const bonds = inferBondsFromDistance(atoms);
    expect(bonds).toHaveLength(0);
  });

  it('respects custom tolerance', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'C', x: 0, y: 0, z: 0 },
      { id: 1, element: 'C', x: 2, y: 0, z: 0 },
    ];

    // Default tolerance should not bond these
    expect(inferBondsFromDistance(atoms)).toHaveLength(0);

    // High tolerance should bond them
    expect(inferBondsFromDistance(atoms, 1.0)).toHaveLength(1);
  });

  it('detects C-C bonds correctly', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'C', x: 0, y: 0, z: 0 },
      { id: 1, element: 'C', x: 1.54, y: 0, z: 0 }, // typical C-C single bond length
    ];

    const bonds = inferBondsFromDistance(atoms);
    expect(bonds).toHaveLength(1);
  });

  it('handles empty atom array', () => {
    const bonds = inferBondsFromDistance([]);
    expect(bonds).toHaveLength(0);
  });

  it('handles single atom', () => {
    const atoms: Atom[] = [{ id: 0, element: 'C', x: 0, y: 0, z: 0 }];
    const bonds = inferBondsFromDistance(atoms);
    expect(bonds).toHaveLength(0);
  });

  it('does not create duplicate bonds', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'C', x: 0, y: 0, z: 0 },
      { id: 1, element: 'C', x: 1.5, y: 0, z: 0 },
    ];

    const bonds = inferBondsFromDistance(atoms);
    expect(bonds).toHaveLength(1);

    // Verify bond direction is always lower index to higher index
    expect(bonds[0].atom1Index).toBeLessThan(bonds[0].atom2Index);
  });
});

describe('inferBondsFromDistance across elements', () => {
  const atom = (id: number, element: string, x: number, y = 0, z = 0): Atom => ({ id, element, x, y, z });
  const pairs = (atoms: Atom[]) => inferBondsFromDistance(atoms).map((b) => `${b.atom1Index}-${b.atom2Index}`);
  /** Pads a small set with far-away carbons so the spatial-index path (> 500 atoms) runs. */
  const padded = (atoms: Atom[]) => [
    ...atoms,
    ...Array.from({ length: 520 }, (_, i) => atom(1000 + i, 'C', 100 + (i % 10) * 10, Math.floor(i / 10) * 10, 50)),
  ];

  it('bonds C-Se at 1.95 Å', () => {
    expect(pairs([atom(0, 'C', 0), atom(1, 'Se', 1.95)])).toEqual(['0-1']);
  });

  it('bonds a long metal-ligand pair the same below and above 500 atoms', () => {
    // K-I: 2.03 + 1.39 + 0.4 = 3.82 Å allowed, longer than the old fixed 3.5 Å grid
    const small = [atom(0, 'K', 0), atom(1, 'I', 3.7)];
    expect(pairs(small)).toEqual(['0-1']);
    expect(pairs(padded(small))).toContain('0-1');
  });

  it('does not bond two metals', () => {
    expect(pairs([atom(0, 'K', 0), atom(1, 'K', 3.3)])).toEqual([]);
    expect(pairs([atom(0, 'ZN', 0), atom(1, 'ZN', 2.5)])).toEqual([]);
    expect(pairs(padded([atom(0, 'Fe', 0), atom(1, 'Cu', 2.5)]))).not.toContain('0-1');
  });

  it('keeps metal-ligand and metal-halide bonds', () => {
    expect(pairs([atom(0, 'Fe', 0), atom(1, 'N', 2.0)])).toEqual(['0-1']);
    expect(pairs([atom(0, 'Pt', 0), atom(1, 'Cl', 2.3)])).toEqual(['0-1']);
    expect(pairs([atom(0, 'FE', 0), atom(1, 'N', 2.0)])).toEqual(['0-1']);
  });

  it('bonds arsenic to arsenic (a metalloid)', () => {
    expect(pairs([atom(0, 'As', 0), atom(1, 'As', 2.45)])).toEqual(['0-1']);
  });

  it('gives a protein the same bonds as before', () => {
    // Glycine-like fragment: N-CA 1.46, CA-C 1.52, C-O 1.23, plus a sulfur
    const atoms = [atom(0, 'N', 0), atom(1, 'C', 1.46), atom(2, 'C', 2.98), atom(3, 'O', 4.21), atom(4, 'S', 2.98, 1.82)];
    expect(pairs(atoms).sort()).toEqual(['0-1', '1-2', '2-3', '2-4'].sort());
    // The padding carbons are 10 Å apart, so they add no bonds
    expect(pairs(padded(atoms)).sort()).toEqual(['0-1', '1-2', '2-3', '2-4'].sort());
  });
});
