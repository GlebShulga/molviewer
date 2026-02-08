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
