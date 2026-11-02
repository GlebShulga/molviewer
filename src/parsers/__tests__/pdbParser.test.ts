import { describe, it, expect } from 'vitest';
import { parsePDB } from '../pdbParser';

describe('parsePDB', () => {
  it('parses a simple PDB with HETATM records', () => {
    const pdb = `HEADER    CAFFEINE
HETATM    1  N1  CAF A   1       0.000   1.400   0.000  1.00  0.00           N
HETATM    2  C2  CAF A   1       1.200   0.700   0.000  1.00  0.00           C
CONECT    1    2
END`;

    const molecule = parsePDB(pdb);

    expect(molecule.name).toBe('CAFFEINE');
    expect(molecule.atoms).toHaveLength(2);
    expect(molecule.atoms[0].element).toBe('N');
    expect(molecule.atoms[1].element).toBe('C');
    expect(molecule.bonds).toHaveLength(1);
  });

  describe('molecule name', () => {
    const atom = 'ATOM      1  N   ALA A   1      11.104   6.134  -6.504  1.00  0.00           N';
    const nameOf = (...lines: string[]) => parsePDB([...lines, atom].join('\n')).name;

    it('takes the MOLECULE line of a COMPND specification, not the last line', () => {
      expect(nameOf(
        'COMPND    MOL_ID: 1;',
        'COMPND   2 MOLECULE: HEMOGLOBIN (DEOXY) (ALPHA CHAIN);',
        'COMPND   3 CHAIN: A;',
        'COMPND   4 ENGINEERED: YES',
      )).toBe('HEMOGLOBIN (DEOXY) (ALPHA CHAIN)');
    });

    it('prefers COMPND over a HEADER classification, and a HEADER ID over both', () => {
      expect(nameOf('HEADER    PLANT PROTEIN', 'COMPND    MOL_ID: 1;', 'COMPND   2 MOLECULE: CRAMBIN;', 'COMPND   3 CHAIN: A'))
        .toBe('CRAMBIN');
      expect(nameOf(
        'HEADER    PLANT PROTEIN                           30-APR-81   1CRN',
        'COMPND    MOL_ID: 1;',
        'COMPND   2 MOLECULE: CRAMBIN;',
      )).toBe('1CRN');
    });

    it('keeps the free-text COMPND line docking tools write', () => {
      expect(nameOf('COMPND    ligand_pose_1')).toBe('ligand_pose_1');
    });

    it('falls back to "Molecule"', () => {
      expect(nameOf('COMPND    MOL_ID: 1;', 'COMPND   2 CHAIN: A;')).toBe('Molecule');
      expect(nameOf()).toBe('Molecule');
    });
  });

  it('infers bonds when no CONECT records exist', () => {
    const pdb = `HEADER    WATER
HETATM    1  O   HOH A   1       0.000   0.000   0.000  1.00  0.00           O
HETATM    2  H1  HOH A   1       0.960   0.000   0.000  1.00  0.00           H
HETATM    3  H2  HOH A   1      -0.240   0.930   0.000  1.00  0.00           H
END`;

    const molecule = parsePDB(pdb);

    expect(molecule.atoms).toHaveLength(3);
    expect(molecule.bonds.length).toBeGreaterThan(0);
  });

  it('throws on empty input', () => {
    expect(() => parsePDB('')).toThrow('No valid atoms found');
  });

  it('parses ATOM records correctly', () => {
    const pdb = `HEADER    PROTEIN
ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00  0.00           C
ATOM      2  N   ALA A   1       1.458   0.000   0.000  1.00  0.00           N
END`;

    const molecule = parsePDB(pdb);

    expect(molecule.atoms).toHaveLength(2);
    expect(molecule.atoms[0].residueName).toBe('ALA');
    expect(molecule.atoms[0].chainId).toBe('A');
  });

  it('respects inferBonds option', () => {
    const pdb = `HEADER    WATER
HETATM    1  O   HOH A   1       0.000   0.000   0.000  1.00  0.00           O
HETATM    2  H1  HOH A   1       0.960   0.000   0.000  1.00  0.00           H
END`;

    const molecule = parsePDB(pdb, { inferBonds: false });
    expect(molecule.bonds).toHaveLength(0);
  });
});
