import { describe, it, expect } from 'vitest';
import { parseXYZ } from '../xyzParser';

describe('parseXYZ', () => {
  it('parses XYZ format correctly', () => {
    const xyz = `3
Water molecule
O     0.00000   0.00000   0.00000
H     0.96000   0.00000   0.00000
H    -0.24000   0.93000   0.00000`;

    const molecule = parseXYZ(xyz);

    expect(molecule.name).toBe('Water molecule');
    expect(molecule.atoms).toHaveLength(3);
    expect(molecule.atoms[0].element).toBe('O');
  });

  it('infers bonds by default', () => {
    const xyz = `3
Water
O     0.00000   0.00000   0.00000
H     0.96000   0.00000   0.00000
H    -0.24000   0.93000   0.00000`;

    const molecule = parseXYZ(xyz);
    expect(molecule.bonds.length).toBe(2);
  });

  it('skips bond inference when disabled', () => {
    const xyz = `3
Water
O     0.00000   0.00000   0.00000
H     0.96000   0.00000   0.00000
H    -0.24000   0.93000   0.00000`;

    const molecule = parseXYZ(xyz, { inferBonds: false });
    expect(molecule.bonds).toHaveLength(0);
  });

  it('throws on file that is too short', () => {
    expect(() => parseXYZ('1')).toThrow('Invalid XYZ format: file too short');
  });

  it('throws on invalid atom count', () => {
    expect(() => parseXYZ('abc\ncomment\nC 0 0 0')).toThrow('Invalid XYZ format: cannot parse atom count');
  });

  it('uses comment line as molecule name', () => {
    // Note: XYZ parser filters empty lines, so an empty comment line
    // causes the atom line to be treated as comment. This test verifies
    // the parser uses the comment line (line 2) as the molecule name.
    const xyz = `1
My Molecule
C     0.00000   0.00000   0.00000`;

    const molecule = parseXYZ(xyz);
    expect(molecule.name).toBe('My Molecule');
  });

  it('parses coordinates correctly', () => {
    const xyz = `1
Test
C     1.23456   -2.34567   3.45678`;

    const molecule = parseXYZ(xyz);
    expect(molecule.atoms[0].x).toBeCloseTo(1.23456);
    expect(molecule.atoms[0].y).toBeCloseTo(-2.34567);
    expect(molecule.atoms[0].z).toBeCloseTo(3.45678);
  });
});
