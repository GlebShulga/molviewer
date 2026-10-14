import { describe, it, expect } from 'vitest';
import { detectAromaticRings } from '../aromaticDetection';
import type { Atom, Bond, Molecule } from '../../types';

const CC = 1.39;

/** Six carbons on a regular hexagon in the xy plane, centered on the origin. */
function hexagon(): Atom[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (i * Math.PI) / 3;
    return { id: i, element: 'C', x: CC * Math.cos(angle), y: CC * Math.sin(angle), z: 0 };
  });
}

function ringBonds(orders: (1 | 2)[]): Bond[] {
  return orders.map((order, i) => ({ atom1Index: i, atom2Index: (i + 1) % 6, order }));
}

function molecule(atoms: Atom[], bonds: Bond[]): Molecule {
  return { name: 'test', atoms, bonds };
}

describe('detectAromaticRings', () => {
  it('finds the benzene ring with its center, normal and radius', () => {
    const rings = detectAromaticRings(molecule(hexagon(), ringBonds([2, 1, 2, 1, 2, 1])));

    expect(rings).toHaveLength(1);
    const [ring] = rings;
    expect([...ring.atomIndices].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ring.center.x).toBeCloseTo(0);
    expect(ring.center.y).toBeCloseTo(0);
    expect(ring.center.z).toBeCloseTo(0);
    expect(ring.normal.x).toBeCloseTo(0);
    expect(ring.normal.y).toBeCloseTo(0);
    expect(Math.abs(ring.normal.z)).toBeCloseTo(1);
    // A regular hexagon's circumradius equals its side.
    expect(ring.radius).toBeCloseTo(CC);
  });

  it('returns plain objects, not three.js vectors', () => {
    const [ring] = detectAromaticRings(molecule(hexagon(), ringBonds([2, 1, 2, 1, 2, 1])));

    expect(Object.keys(ring.center).sort()).toEqual(['x', 'y', 'z']);
    expect(Object.keys(ring.normal).sort()).toEqual(['x', 'y', 'z']);
  });

  it('finds no aromatic ring in cyclohexane (single bonds only)', () => {
    expect(detectAromaticRings(molecule(hexagon(), ringBonds([1, 1, 1, 1, 1, 1])))).toEqual([]);
  });
});
