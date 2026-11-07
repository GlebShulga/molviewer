import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('flags type-4 bonds as aromatic', () => {
    const sdf = `Aromatic
  Test

  2  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  4  0
  1  2  1  0
M  END`;

    const molecule = parseSDF(sdf);
    expect(molecule.bonds[0]).toMatchObject({ order: 1, isAromatic: true });
    expect(molecule.bonds[1].isAromatic).toBeUndefined();
  });

  describe('formal charges', () => {
    /** A V2000 molfile with one carbon per atom-block charge code and the given property lines. */
    const molfile = (chargeCodes: number[], properties: string[] = []) =>
      [
        'Charges',
        '  Test',
        '',
        `${String(chargeCodes.length).padStart(3)}  0  0  0  0  0  0  0  0  0999 V2000`,
        ...chargeCodes.map(
          (code, i) =>
            `${(i * 1.5).toFixed(4).padStart(10)}    0.0000    0.0000 C   0${String(code).padStart(3)}  0  0  0  0  0  0  0  0  0  0`
        ),
        ...properties,
        'M  END',
      ].join('\n');

    const charges = (sdf: string) => parseSDF(sdf).atoms.map((a) => a.formalCharge);

    it('reads the atom-block charge codes, leaving neutral atoms without a charge', () => {
      // 1 = +3, 2 = +2, 3 = +1, 4 = doublet radical (no charge), 5 = -1, 6 = -2, 7 = -3
      expect(charges(molfile([0, 1, 2, 3, 4, 5, 6, 7]))).toEqual([undefined, 3, 2, 1, undefined, -1, -2, -3]);
    });

    it('takes charges from M  CHG lines, which replace every atom-block charge', () => {
      const sdf = molfile([3, 0, 0], ['M  CHG  1   2  -1', 'M  CHG  1   3   2']);
      expect(charges(sdf)).toEqual([undefined, -1, 2]);
    });

    it('ignores atom-block charges when an M  RAD line is present, as the format requires', () => {
      expect(charges(molfile([5, 0], ['M  RAD  1   2   2']))).toEqual([undefined, undefined]);
    });

    it('reads the charges of PubChem ferrocene (CID 7611)', () => {
      const ferrocene = parseSDF(readFileSync(resolve(__dirname, 'fixtures/ferrocene-cid7611.mol'), 'utf8'));
      const charged = ferrocene.atoms
        .map((a, i) => [i, a.element, a.formalCharge] as const)
        .filter(([, , charge]) => charge !== undefined);
      expect(charged).toEqual([
        [0, 'Fe', 2],
        [1, 'C', -1],
        [2, 'C', -1],
      ]);
    });
  });
});

describe('parseSDF unsupported and empty files', () => {
  it('refuses V3000 molfiles with a reason', async () => {
    const { UnsupportedFormatError } = await import('../errors');
    const v3000 = 'x\n  MolViewer\n\n  0  0  0     0  0            999 V3000\nM  V30 BEGIN CTAB\nM  END\n';
    expect(() => parseSDF(v3000)).toThrow(UnsupportedFormatError);
    expect(() => parseSDF(v3000)).toThrow('V3000 molfiles are not supported yet; save as V2000');
  });

  it('refuses a molfile with no atoms', () => {
    const empty = 'x\n  MolViewer\n\n  0  0  0     0  0            999 V2000\nM  END\n';
    expect(() => parseSDF(empty)).toThrow(/no atoms/i);
  });
});
