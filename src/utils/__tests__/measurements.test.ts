import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateAngle,
  calculateDihedral,
  calculateDistance,
  dihedralAngle,
  formatMeasurement,
  type Measurement,
} from '../measurements';
import { parsePDB } from '../../parsers/pdbParser';
import type { Atom } from '../../types';

const p = (x: number, y: number, z: number) => ({ x, y, z });
const atom = (x: number, y: number, z: number, id = 0): Atom => ({ id, element: 'C', x, y, z });

describe('dihedralAngle', () => {
  it('follows the IUPAC sign: a counterclockwise turn is negative', () => {
    expect(dihedralAngle(p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(0, 1, 1))).toBeCloseTo(-90, 6);
  });

  it('gives the opposite sign for the mirror image', () => {
    expect(dihedralAngle(p(-1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(0, 1, 1))).toBeCloseTo(90, 6);
  });

  it('gives 0 for a planar cis arrangement', () => {
    expect(dihedralAngle(p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(1, 1, 0))).toBeCloseTo(0, 6);
  });

  it('gives ±180 for a planar trans arrangement', () => {
    // atan2(±0, -1) is ±180, so only the magnitude is fixed
    expect(Math.abs(dihedralAngle(p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(-1, 1, 0)))).toBeCloseTo(180, 6);
  });

  it('gives 0, not NaN, for collinear points', () => {
    const value = dihedralAngle(p(0, 0, 0), p(1, 0, 0), p(2, 0, 0), p(2, 1, 0));
    expect(value).toBe(0);
  });
});

describe('calculateDihedral on Crambin', () => {
  const molecule = parsePDB(
    readFileSync(resolve(__dirname, '../../../public/sample-molecules/1crn.pdb'), 'utf8')
  );
  const backbone = (residue: number, name: string) => {
    const found = molecule.atoms.find(
      (a) => a.chainId === 'A' && a.residueNumber === residue && a.name?.trim() === name
    );
    if (!found) throw new Error(`No ${name} in residue ${residue}`);
    return found;
  };

  it('gives alpha-helix phi and psi inside the first HELIX record (residues 7-19)', () => {
    const r = 10;
    const phi = calculateDihedral(backbone(r - 1, 'C'), backbone(r, 'N'), backbone(r, 'CA'), backbone(r, 'C'));
    const psi = calculateDihedral(backbone(r, 'N'), backbone(r, 'CA'), backbone(r, 'C'), backbone(r + 1, 'N'));
    expect(Math.abs(phi - -60)).toBeLessThan(30);
    expect(Math.abs(psi - -45)).toBeLessThan(30);
  });
});

describe('calculateDistance and calculateAngle', () => {
  it('measures a 3-4-5 distance', () => {
    expect(calculateDistance(atom(0, 0, 0), atom(3, 4, 0))).toBeCloseTo(5, 10);
  });

  it('measures a right angle and a straight angle', () => {
    expect(calculateAngle(atom(1, 0, 0), atom(0, 0, 0), atom(0, 1, 0))).toBeCloseTo(90, 10);
    expect(calculateAngle(atom(1, 0, 0), atom(0, 0, 0), atom(-1, 0, 0))).toBeCloseTo(180, 10);
  });
});

describe('formatMeasurement', () => {
  it('keeps the minus sign of a dihedral', () => {
    const m: Measurement = {
      id: 'd',
      type: 'dihedral',
      atomIndices: [0, 1, 2, 3],
      atomRefs: [],
      value: -57.34,
      unit: '°',
    };
    expect(formatMeasurement(m)).toBe('-57.3°');
  });
});
