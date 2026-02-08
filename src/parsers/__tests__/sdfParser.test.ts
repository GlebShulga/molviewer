import { describe, it, expect } from 'vitest';
import { parseSDF } from '../sdfParser';

describe('parseSDF', () => {
  it('parses atom and bond counts correctly', () => {
    const sdf = `Molecule
  Test

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  2  0
M  END`;

    const molecule = parseSDF(sdf);

    expect(molecule.name).toBe('Molecule');
    expect(molecule.atoms).toHaveLength(3);
    expect(molecule.bonds).toHaveLength(2);
    expect(molecule.bonds[1].order).toBe(2);
  });

  it('parses element symbols correctly', () => {
    const sdf = `Test
  Test

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END`;

    const molecule = parseSDF(sdf);

    expect(molecule.atoms[0].element).toBe('N');
    expect(molecule.atoms[1].element).toBe('H');
  });

  it('throws on invalid format', () => {
    expect(() => parseSDF('invalid')).toThrow();
  });

  it('throws on file that is too short', () => {
    expect(() => parseSDF('line1\nline2')).toThrow('Invalid SDF format: file too short');
  });

  it('handles single bonds correctly', () => {
    const sdf = `SingleBond
  Test

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END`;

    const molecule = parseSDF(sdf);
    expect(molecule.bonds[0].order).toBe(1);
  });

  it('handles triple bonds correctly', () => {
    const sdf = `TripleBond
  Test

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  3  0
M  END`;

    const molecule = parseSDF(sdf);
    expect(molecule.bonds[0].order).toBe(3);
  });
});
