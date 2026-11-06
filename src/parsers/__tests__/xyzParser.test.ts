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

  it('keeps the first atom when the comment line is blank', () => {
    const molecule = parseXYZ('3\n\nO 0 0 0\nH 0.96 0 0\nH -0.24 0.93 0', { inferBonds: false });
    expect(molecule.name).toBe('Molecule');
    expect(molecule.atoms.map((a) => a.element)).toEqual(['O', 'H', 'H']);
    expect(molecule.atoms.map((a) => a.id)).toEqual([0, 1, 2]);
  });

  it('reads CRLF line endings', () => {
    const molecule = parseXYZ('2\r\nPair\r\nC 0 0 0\r\nO 1.2 0 0\r\n', { inferBonds: false });
    expect(molecule.name).toBe('Pair');
    expect(molecule.atoms.map((a) => a.element)).toEqual(['C', 'O']);
  });

  it('ignores blank lines before the count line and after the atoms', () => {
    const molecule = parseXYZ('\n\n2\nPair\nC 0 0 0\nO 1.2 0 0\n\n\n', { inferBonds: false });
    expect(molecule.name).toBe('Pair');
    expect(molecule.atoms).toHaveLength(2);
  });

  it('loads only the first frame of a trajectory', () => {
    const frame = (x: number) => `2\nframe\nC ${x} 0 0\nO ${x + 1.2} 0 0`;
    const molecule = parseXYZ(`${frame(0)}\n${frame(5)}`, { inferBonds: false });
    expect(molecule.atoms).toHaveLength(2);
    expect(molecule.atoms[0].x).toBe(0);
  });

  it('reports the real line number of a malformed atom line', () => {
    // Line 5 is the bad one: the blank comment line counts
    expect(() => parseXYZ('3\n\nO 0 0 0\nH 0.96 0 0\nH oops')).toThrow('line 5');
  });
});
