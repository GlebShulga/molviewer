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
