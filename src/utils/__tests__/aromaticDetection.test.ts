import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { countAromaticRings, detectAromaticRings } from '../aromaticDetection';
import { AROMATIC_DETECTION_THRESHOLD } from '../../config/rendering';
import { parseSDF } from '../../parsers/sdfParser';
import { parsePDB } from '../../parsers/pdbParser';
import type { Atom, Bond, Molecule } from '../../types';

const CC = 1.39;
const samples = resolve(__dirname, '../../../public/sample-molecules');

type Point = [number, number, number];

/** n points on a regular polygon in the xy plane (circumradius = side for n = 6). */
function polygon(n: number, center: [number, number] = [0, 0], radius = CC, startAngle = 0): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = startAngle + (i * 2 * Math.PI) / n;
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle), 0];
  });
}

function atomsAt(points: Point[], elements: string[]): Atom[] {
  return elements.map((element, id) => {
    const [x, y, z] = points[id] ?? [id * 1.5, 3, 0];
    return { id, element, x, y, z };
  });
}

/** 1, 2 or 3 = bond order; 'ar' = flagged aromatic (SDF type 4). */
function bonds(list: [number, number, 1 | 2 | 3 | 'ar'][]): Bond[] {
  return list.map(([atom1Index, atom2Index, order]) =>
    order === 'ar'
      ? { atom1Index, atom2Index, order: 1, isAromatic: true }
      : { atom1Index, atom2Index, order }
  );
}

function molecule(atoms: Atom[], bondList: Bond[]): Molecule {
  return { name: 'test', atoms, bonds: bondList };
}

/** A ring of the given elements, bonded i to i+1 with the given orders, plus extra atoms and bonds. */
function ring(
  elements: string[],
  orders: (1 | 2 | 'ar')[],
  extra: { elements?: string[]; bonds?: [number, number, 1 | 2][] } = {}
): Molecule {
  const n = elements.length;
  const all = [...elements, ...(extra.elements ?? [])];
  return molecule(
    atomsAt(polygon(n), all),
    bonds([
      ...orders.map((order, i): [number, number, 1 | 2 | 'ar'] => [i, (i + 1) % n, order]),
      ...(extra.bonds ?? []),
    ])
  );
}

const ringSets = (m: Molecule) =>
  detectAromaticRings(m)
    .map((r) => [...r.atomIndices].sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0] || a.length - b.length);

const benzene = () => ring(['C', 'C', 'C', 'C', 'C', 'C'], [2, 1, 2, 1, 2, 1]);

describe('detectAromaticRings', () => {
  it('finds the benzene ring with its center, normal and radius', () => {
    const rings = detectAromaticRings(benzene());

    expect(rings).toHaveLength(1);
    const [r] = rings;
    expect([...r.atomIndices].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.center.x).toBeCloseTo(0);
    expect(r.center.y).toBeCloseTo(0);
    expect(r.center.z).toBeCloseTo(0);
    expect(r.normal.x).toBeCloseTo(0);
    expect(r.normal.y).toBeCloseTo(0);
    expect(Math.abs(r.normal.z)).toBeCloseTo(1);
    // A regular hexagon's circumradius equals its side.
    expect(r.radius).toBeCloseTo(CC);
  });

  it('returns plain objects, not three.js vectors', () => {
    const [r] = detectAromaticRings(benzene());

    expect(Object.getPrototypeOf(r.center)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(r.normal)).toBe(Object.prototype);
  });

  describe('rejects rings that are not aromatic', () => {
    it.each<[string, Molecule]>([
      ['cyclohexane', ring(['C', 'C', 'C', 'C', 'C', 'C'], [1, 1, 1, 1, 1, 1])],
      ['cyclohexene', ring(['C', 'C', 'C', 'C', 'C', 'C'], [2, 1, 1, 1, 1, 1])],
      ['1,3-cyclohexadiene', ring(['C', 'C', 'C', 'C', 'C', 'C'], [2, 1, 2, 1, 1, 1])],
      [
        '1,4-benzoquinone',
        ring(['C', 'C', 'C', 'C', 'C', 'C'], [1, 2, 1, 1, 2, 1], {
          elements: ['O', 'O'],
          bonds: [[0, 6, 2], [3, 7, 2]],
        }),
      ],
      ['cyclopentadiene', ring(['C', 'C', 'C', 'C', 'C'], [2, 1, 2, 1, 1])],
      [
        'thiophene 1,1-dioxide',
        ring(['S', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1], {
          elements: ['O', 'O'],
          bonds: [[0, 5, 2], [0, 6, 2]],
        }),
      ],
      [
        'fulvene',
        ring(['C', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1], { elements: ['C'], bonds: [[0, 5, 2]] }),
      ],
    ])('%s', (_name, m) => {
      expect(detectAromaticRings(m)).toEqual([]);
    });
  });

  describe('finds single aromatic rings', () => {
    // Every case builds its ring first, so the ring is atoms 0..n-1
    it.each<[string, Molecule]>([
      ['pyridine', ring(['N', 'C', 'C', 'C', 'C', 'C'], [2, 1, 2, 1, 2, 1])],
      // N1 bonded by single bonds only: its lone pair gives 2 electrons
      ['pyrrole', ring(['N', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1])],
      ['furan', ring(['O', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1])],
      ['thiophene', ring(['S', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1])],
      [
        // N1 C2(=O) N3 C4(=O) C5=C6
        'uracil',
        ring(['N', 'C', 'N', 'C', 'C', 'C'], [1, 1, 1, 1, 2, 1], {
          elements: ['O', 'O'],
          bonds: [[1, 6, 2], [3, 7, 2]],
        }),
      ],
      [
        // N1 C2(=O) C3=C4 C5=C6
        '2-pyridone',
        ring(['N', 'C', 'C', 'C', 'C', 'C'], [1, 1, 2, 1, 2, 1], { elements: ['O'], bonds: [[1, 6, 2]] }),
      ],
      ['a ring with every bond flagged aromatic', ring(['C', 'C', 'C', 'C', 'C', 'C'], ['ar', 'ar', 'ar', 'ar', 'ar', 'ar'])],
      ['pyrrole flagged aromatic', ring(['N', 'C', 'C', 'C', 'C'], ['ar', 'ar', 'ar', 'ar', 'ar'])],
    ])('%s', (_name, m) => {
      const rings = ringSets(m);
      expect(rings).toHaveLength(1);
      expect(rings[0]).toEqual([...Array(rings[0].length).keys()]);
      expect([5, 6]).toContain(rings[0].length);
    });
  });

  it('finds both rings of naphthalene drawn with a single shared bond', () => {
    // Atoms 0 and 1 are the shared bond (vertical, at x = 0). Ring A is
    // 0-2-3-4-5-1, ring B is 0-9-8-7-6-1. Both double bonds of the shared
    // atoms lie in ring A, so ring B only reaches 6 electrons through them.
    const d = CC * Math.cos(Math.PI / 6);
    const a = polygon(6, [-d, 0], CC, Math.PI / 6); // 30°, 90°, ..., 330°
    const b = polygon(6, [d, 0], CC, Math.PI / 6);
    const points: Point[] = [a[0], a[5], a[1], a[2], a[3], a[4], b[4], b[5], b[0], b[1]];
    const m = molecule(
      atomsAt(points, Array(10).fill('C')),
      bonds([
        [0, 2, 2], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 1, 2], [1, 0, 1],
        [0, 9, 1], [9, 8, 2], [8, 7, 1], [7, 6, 2], [6, 1, 1],
      ])
    );
    expect(points[0][0]).toBeCloseTo(0);
    expect(ringSets(m)).toEqual([
      [0, 1, 2, 3, 4, 5],
      [0, 1, 6, 7, 8, 9],
    ]);
  });

  it('finds both rings of caffeine, with its methyls and C=O groups', () => {
    // 0 N1, 1 C2, 2 N3, 3 C4, 4 C5, 5 C6, 6 N7, 7 C8, 8 N9,
    // 9 O on C2, 10 O on C6, 11-13 methyls on N1, N3, N7
    const elements = ['N', 'C', 'N', 'C', 'C', 'C', 'N', 'C', 'N', 'O', 'O', 'C', 'C', 'C'];
    const m = molecule(
      atomsAt([], elements),
      bonds([
        [0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 0, 1],
        [4, 6, 1], [6, 7, 1], [7, 8, 2], [8, 3, 1],
        [1, 9, 2], [5, 10, 2], [0, 11, 1], [2, 12, 1], [6, 13, 1],
      ])
    );
    expect(ringSets(m)).toEqual([
      [0, 1, 2, 3, 4, 5],
      [3, 4, 6, 7, 8],
    ]);
  });

  it('finds the one benzene ring of the aspirin sample', () => {
    const aspirin = parseSDF(readFileSync(resolve(samples, 'aspirin.sdf'), 'utf8'));
    expect(detectAromaticRings(aspirin)).toHaveLength(1);
  });

  it('finds nothing in a protein whose bonds are all single (Crambin)', () => {
    // Also the early exit: no double or flagged bond means no ring search
    const crambin = parsePDB(readFileSync(resolve(samples, '1crn.pdb'), 'utf8'));
    expect(crambin.bonds.length).toBeGreaterThan(0);
    expect(crambin.bonds.every((b) => b.order === 1 && !b.isAromatic)).toBe(true);
    expect(detectAromaticRings(crambin)).toEqual([]);
  });
});

describe('countAromaticRings', () => {
  it('uses a stored ring list as is, an empty one included', () => {
    const stored = detectAromaticRings(benzene());
    expect(countAromaticRings({ ...benzene(), aromaticRings: [...stored, ...stored] })).toBe(2);
    expect(countAromaticRings({ ...benzene(), aromaticRings: [] })).toBe(0);
  });

  it('detects rings when none are stored', () => {
    expect(countAromaticRings(benzene())).toBe(1);
    expect(countAromaticRings(ring(['C', 'C', 'C', 'C', 'C', 'C'], [2, 1, 1, 1, 1, 1]))).toBe(0);
  });

  it('gives 0 above the detection threshold without detecting', () => {
    const big = benzene();
    for (let i = big.atoms.length; i <= AROMATIC_DETECTION_THRESHOLD; i++) {
      big.atoms.push({ id: i, element: 'C', x: i * 10, y: 0, z: 0 });
    }
    expect(big.atoms.length).toBe(AROMATIC_DETECTION_THRESHOLD + 1);
    expect(countAromaticRings(big)).toBe(0);
  });
});
