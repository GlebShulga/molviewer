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

  it('does not bond aluminium to magnesium, and keeps Al-F', () => {
    // An AlF4- beside the Mg2+ of a transition-state analogue: 1.21 + 1.41 + 0.4 = 3.02 Å allowed
    expect(pairs([atom(0, 'Al', 0), atom(1, 'Mg', 2.9)])).toEqual([]);
    expect(pairs(padded([atom(0, 'AL', 0), atom(1, 'MG', 2.9)]))).not.toContain('0-1');
    expect(pairs([atom(0, 'Al', 0), atom(1, 'F', 1.7)])).toEqual(['0-1']);
  });

  it('bonds lead to oxygen, but not to another lead, below and above 500 atoms', () => {
    // Pb-O: 1.46 + 0.66 + 0.4 = 2.52 Å allowed. Pb-Pb at 3.0 Å is under the
    // 3.32 Å the radii allow, so only the metal rule leaves it out.
    const leadOxygen = [atom(0, 'Pb', 0), atom(1, 'O', 2.3)];
    expect(pairs(leadOxygen)).toEqual(['0-1']);
    expect(pairs(padded(leadOxygen))).toContain('0-1');
    const twoLeads = [atom(0, 'PB', 0), atom(1, 'Pb', 3.0)];
    expect(pairs(twoLeads)).toEqual([]);
    expect(pairs(padded(twoLeads))).not.toContain('0-1');
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

  it('bonds K+ and Cs+ to nearby nitrogen and oxygen the same below and above 500 atoms', () => {
    // K-N 2.03 + 0.71 + 0.4 = 3.14 Å allowed; Cs-O 2.44 + 0.66 + 0.4 = 3.5 Å
    const small = [atom(0, 'K', 0), atom(1, 'N', 3.0), atom(2, 'O', 0, 2.9), atom(3, 'Cs', 20), atom(4, 'O', 23.4), atom(5, 'N', 20, 3.3)];
    const expected = pairs(small).sort();
    expect(expected).toEqual(['0-1', '0-2', '3-4', '3-5']);
    expect(pairs(padded(small)).sort()).toEqual(expected);
  });

  it('bonds a crowded mix of elements and ions exactly as checking every pair does', () => {
    // A seeded random cloud, dense enough for bonds of every kind
    let seed = 12345;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const elements = ['C', 'C', 'C', 'N', 'O', 'H', 'H', 'S', 'P', 'I', 'K', 'Cs', 'Ca', 'Zn', 'Fe', 'Na'];
    const atoms = Array.from({ length: 800 }, (_, i) =>
      atom(i, elements[Math.floor(random() * elements.length)], random() * 22, random() * 22, random() * 22)
    );
    // Every pair closer than the longest bond any of these elements allows (Cs-I: 4.23 Å), each decided alone
    const expected: string[] = [];
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const [a, b] = [atoms[i], atoms[j]];
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 6) continue;
        if (inferBondsFromDistance([a, b]).length > 0) expected.push(`${i}-${j}`);
      }
    }
    expect(expected.length).toBeGreaterThan(300);
    expect(pairs(atoms)).toEqual(expected);
  });

  it('bonds nothing in a structure made only of metals', () => {
    const metals = Array.from({ length: 600 }, (_, i) => atom(i, i % 2 ? 'Fe' : 'Cs', (i % 10) * 2.5, Math.floor(i / 10) * 2.5));
    expect(pairs(metals)).toEqual([]);
  });
});
