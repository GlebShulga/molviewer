import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePDB } from '../pdbParser';

const samples = resolve(__dirname, '../../../public/sample-molecules');

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

  it('infers bonds and adds CONECT records on top (1CRN lists only its disulfides)', () => {
    const crambin = parsePDB(readFileSync(resolve(samples, '1crn.pdb'), 'utf8'));
    expect(crambin.bonds.length).toBeGreaterThan(300);
    const serialIndex = new Map(crambin.atoms.map((a, i) => [a.serial, i]));
    const has = (s1: number, s2: number) => {
      const [a, b] = [serialIndex.get(s1)!, serialIndex.get(s2)!];
      return crambin.bonds.some((bd) => (bd.atom1Index === a && bd.atom2Index === b) || (bd.atom1Index === b && bd.atom2Index === a));
    };
    expect(has(20, 282) && has(26, 229) && has(116, 188)).toBe(true);
  });

  it('keeps a CONECT bond longer than the distance cutoff', () => {
    const pdb = `HETATM    1  C1  LIG A   1       0.000   0.000   0.000  1.00  0.00           C
HETATM    2  C2  LIG A   1       1.500   0.000   0.000  1.00  0.00           C
HETATM    3  C3  LIG A   1       7.500   0.000   0.000  1.00  0.00           C
CONECT    1    2
CONECT    1    3
END`;
    const molecule = parsePDB(pdb);
    const pairs = molecule.bonds.map((b) => [b.atom1Index, b.atom2Index].sort().join('-')).sort();
    expect(pairs).toEqual(['0-1', '0-2']);
  });

  it('adds inferred bonds to partial CONECT records', () => {
    const pdb = `HETATM    1  C1  LIG A   1       0.000   0.000   0.000  1.00  0.00           C
HETATM    2  C2  LIG A   1       1.500   0.000   0.000  1.00  0.00           C
HETATM    3  C3  LIG A   1       3.000   0.000   0.000  1.00  0.00           C
CONECT    1    2
END`;
    expect(parsePDB(pdb).bonds).toHaveLength(2);
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

describe('parsePDB element symbols', () => {
  /** One ATOM/HETATM line with a 4-character atom name field (columns 13-16) and an optional element column. */
  const line = (name4: string, residue: string, element = '', record = 'HETATM') =>
    `${record.padEnd(6)}${'1'.padStart(5)} ${name4} ${residue.padStart(3)} A${'1'.padStart(4)}    ` +
    `${'0.000'.padStart(8)}${'0.000'.padStart(8)}${'0.000'.padStart(8)}${'1.00'.padStart(6)}${'0.00'.padStart(6)}          ${element.padStart(2)}`;
  const elementOf = (name4: string, residue: string, element = '') => parsePDB(`${line(name4, residue, element)}\nEND`).atoms[0].element;

  it('writes element columns in "Zn" form', () => {
    expect(elementOf('ZN  ', ' ZN', 'ZN')).toBe('Zn');
    expect(elementOf('SE  ', 'MSE', 'SE')).toBe('Se');
    expect(elementOf(' CA ', 'ALA', ' C')).toBe('C');
  });

  it('classifies a HETATM ZN as an ion', async () => {
    const { classifyMolecule } = await import('../../utils/moleculeTypeClassifier');
    const molecule = parsePDB(`${line('ZN  ', ' ZN', 'ZN')}\nEND`);
    expect(classifyMolecule(molecule).components.map((c) => c.type)).toEqual(['ion']);
  });

  it('reads two-letter elements from the atom name when the column is blank', () => {
    expect(elementOf('FE  ', 'HEM')).toBe('Fe');
    expect(elementOf('CL1 ', 'LIG')).toBe('Cl');
    expect(elementOf('BR1 ', 'LIG')).toBe('Br');
    expect(elementOf('ZN  ', ' ZN')).toBe('Zn');
  });

  it('keeps common one-letter atom names that look like elements', () => {
    expect(elementOf('NA  ', 'HEM')).toBe('N');
    expect(elementOf(' CA ', 'ALA')).toBe('C');
    expect(elementOf('CA  ', 'ALA')).toBe('C');
    expect(elementOf('CA  ', 'SEP')).toBe('C');
    expect(elementOf('CD  ', 'MSE')).toBe('C');
    expect(elementOf('NE  ', 'AGL')).toBe('N');
  });

  it('reads ions whose residue is named after the element', () => {
    expect(elementOf('CA  ', ' CA')).toBe('Ca');
    expect(elementOf('CA  ', ' ca')).toBe('Ca');
    expect(elementOf('NA  ', ' NA')).toBe('Na');
    expect(elementOf('HG  ', ' HG')).toBe('Hg');
  });

  it('reads hydrogens', () => {
    expect(elementOf('HG21', 'THR')).toBe('H');
    expect(elementOf('HE21', 'GLN')).toBe('H');
    expect(elementOf('1HG2', 'THR')).toBe('H');
    expect(elementOf(' HG ', 'SEP')).toBe('H');
    expect(elementOf('HG1 ', 'SEP')).toBe('H');
  });
});

describe('parsePDB occupancy and residue numbers', () => {
  const atomLine = (serial: number, occupancy: string, resSeq: string, x: number) =>
    `ATOM  ${String(serial).padStart(5)}  CA  ALA A${resSeq.padStart(4)}    ${x.toFixed(3).padStart(8)}${'0.000'.padStart(8)}${'0.000'.padStart(8)}${occupancy.padStart(6)}${'0.00'.padStart(6)}           C`;

  it('keeps an occupancy of 0 and reads a blank one as 1', () => {
    const m = parsePDB([atomLine(1, '0.00', '1', 0), atomLine(2, '', '2', 4), atomLine(3, '0.50', '3', 8), 'END'].join('\n'));
    expect(m.atoms.map((a) => a.occupancy)).toEqual([0, 1, 0.5]);
  });

  it('reads a blank residue number as undefined, not NaN', () => {
    const m = parsePDB([atomLine(1, '1.00', '', 0), 'END'].join('\n'));
    expect(m.atoms[0].residueNumber).toBeUndefined();
  });
});

describe('parsePDB alternate locations', () => {
  const line = (serial: number, name: string, alt: string, residue: string, resSeq: number, x: number, element = 'C') =>
    `ATOM  ${String(serial).padStart(5)} ${name.padEnd(4)}${alt}${residue.padStart(3)} A${String(resSeq).padStart(4)}    ` +
    `${x.toFixed(3).padStart(8)}${'0.000'.padStart(8)}${'0.000'.padStart(8)}${'0.50'.padStart(6)}${'0.00'.padStart(6)}           ${element}`;

  it('keeps one conformer of a residue with A and B side chains', () => {
    const m = parsePDB(
      [
        line(1, ' CA ', ' ', 'SER', 1, 0),
        line(2, ' CB ', 'A', 'SER', 1, 1.5),
        line(3, ' CB ', 'B', 'SER', 1, 1.6),
        line(4, ' OG ', 'A', 'SER', 1, 3.0, 'O'),
        line(5, ' OG ', 'B', 'SER', 1, 3.1, 'O'),
        'END',
      ].join('\n')
    );
    expect(m.atoms.map((a) => `${a.name}${a.altLoc ?? ''}`)).toEqual(['CA', 'CBA', 'OGA']);
  });

  it('keeps a residue that only has a B conformer', () => {
    const m = parsePDB([line(1, ' CA ', 'A', 'SER', 1, 0), line(2, ' CA ', 'B', 'GLY', 2, 3.8), 'END'].join('\n'));
    expect(m.atoms.map((a) => `${a.residueName}${a.residueNumber}${a.altLoc}`)).toEqual(['SER1A', 'GLY2B']);
  });

  it('keeps one residue at a microheterogeneity site', () => {
    const m = parsePDB(
      [line(1, ' CA ', 'A', 'SER', 5, 0), line(2, ' CB ', 'A', 'SER', 5, 1.5), line(3, ' CA ', 'B', 'THR', 5, 0.1), line(4, ' CB ', 'B', 'THR', 5, 1.6), 'END'].join('\n')
    );
    expect(new Set(m.atoms.map((a) => a.residueName))).toEqual(new Set(['SER']));
  });
});
