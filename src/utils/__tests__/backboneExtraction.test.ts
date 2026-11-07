import { describe, it, expect } from 'vitest';
import { hasBackboneData, isBackboneAtom, traceableResidues } from '../backboneExtraction';
import { calculateColorSchemeContext } from '../atomColor';
import type { Atom, Molecule } from '../../types';

const atom = (name: string, element: string, residueName: string, residueNumber = 1): Atom => ({
  id: 0, name, element, residueName, residueNumber, chainId: 'A', x: 0, y: 0, z: 0,
});
const molecule = (atoms: Atom[]): Molecule => ({ name: 'test', atoms, bonds: [] });

/** Whether `a` is a backbone atom in a molecule of `a` plus the rest of its residue. */
const backbone = (a: Atom, rest: Atom[] = []) => isBackboneAtom(a, traceableResidues(molecule([a, ...rest])));

describe('isBackboneAtom', () => {
  it('takes a protein alpha carbon and a nucleotide phosphorus', () => {
    // A CA-only model of standard residues
    expect(backbone(atom('CA', 'C', 'ALA'))).toBe(true);
    // Modified residues and simulation names are in the chain too: N and C beside the CA
    expect(backbone(atom('CA', 'C', 'MSE'), [atom('N', 'N', 'MSE'), atom('C', 'C', 'MSE')])).toBe(true);
    expect(backbone(atom('CA', 'C', 'HIE'), [atom('N', 'N', 'HIE'), atom('C', 'C', 'HIE')])).toBe(true);
    expect(backbone(atom('P', 'P', 'DA'))).toBe(true);
    expect(backbone(atom('P', 'P', 'G'))).toBe(true);
  });

  it('skips what Cartoon cannot trace: a lipid phosphorus, a calcium ion, a ligand carbon named CA, no residue number', () => {
    expect(backbone(atom('P', 'P', 'POPC'))).toBe(false);
    expect(backbone(atom('CA', 'CA', 'CA'))).toBe(false);
    expect(backbone(atom('CA', 'Ca', 'CA'))).toBe(false);
    expect(backbone(atom('CA', 'C', 'LIG'), [atom('C1', 'C', 'LIG'), atom('O', 'O', 'LIG')])).toBe(false);
    expect(backbone({ ...atom('CA', 'C', 'ALA'), residueNumber: undefined })).toBe(false);
    expect(backbone(atom('N', 'N', 'ALA'))).toBe(false);
  });
});

describe('hasBackboneData and the color context agree', () => {
  const lipids = molecule([atom('P', 'P', 'POPC'), atom('N', 'N', 'POPC'), atom('CA', 'CA', 'CA', 2)]);
  const protein = molecule([atom('N', 'N', 'ALA'), atom('CA', 'C', 'ALA')]);

  it('finds no backbone in lipids and ions, so Cartoon is not offered', () => {
    expect(hasBackboneData(lipids)).toBe(false);
    expect(calculateColorSchemeContext(lipids).hasBackboneData).toBe(false);
  });

  it('finds the backbone of a protein', () => {
    expect(hasBackboneData(protein)).toBe(true);
    expect(calculateColorSchemeContext(protein).hasBackboneData).toBe(true);
  });
});

describe('traceableResidues', () => {
  it('walks the atoms once per atom list: callers on the same list share the set', () => {
    const atoms: Atom[] = [
      { id: 0, element: 'N', name: 'N', residueName: 'ALA', residueNumber: 1, chainId: 'A', x: 0, y: 0, z: 0 },
      { id: 1, element: 'C', name: 'CA', residueName: 'ALA', residueNumber: 1, chainId: 'A', x: 1.5, y: 0, z: 0 },
    ];
    const molecule: Molecule = { name: 'm', atoms, bonds: [] };
    const first = traceableResidues(molecule);
    // A spread of the molecule keeps its atom list, so it finds the same set
    expect(traceableResidues({ ...molecule })).toBe(first);
    // Another atom list is walked again
    expect(traceableResidues({ ...molecule, atoms: atoms.map((a) => ({ ...a })) })).not.toBe(first);
  });
});

describe('hasBackboneData per atom list', () => {
  /** The atoms behind a Proxy that counts reads of an atom by index. */
  function counted(atoms: Atom[]) {
    const reads = { count: 0 };
    const proxy = new Proxy(atoms, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads.count++;
        return Reflect.get(target, key, receiver);
      },
    });
    return { molecule: { name: 'm', atoms: proxy, bonds: [] } as Molecule, reads };
  }

  /** Two segments without chain IDs, both numbered 1-3: Cartoon traces neither. */
  const chainless = (): Atom[] =>
    [0, 1].flatMap((segment) =>
      [1, 2, 3].flatMap((residueNumber) =>
        (['N', 'CA', 'C'] as const).map((name) => ({
          id: 0, name, element: name === 'N' ? 'N' : 'C', residueName: 'ALA', residueNumber, x: segment * 20, y: residueNumber, z: 0,
        }))
      )
    );

  it('reads no atom the second time on a chainless file (the fast loop finds nothing there)', () => {
    const { molecule, reads } = counted(chainless());
    expect(hasBackboneData(molecule)).toBe(false);
    expect(reads.count).toBeGreaterThan(0);
    reads.count = 0;
    expect(hasBackboneData(molecule)).toBe(false);
    expect(reads.count).toBe(0);
  });

  it('keeps the fast loop\'s answer for a protein with chain IDs', () => {
    const { molecule, reads } = counted(chainless().map((a) => ({ ...a, chainId: a.x === 0 ? 'A' : 'B' })));
    expect(hasBackboneData(molecule)).toBe(true);
    reads.count = 0;
    expect(hasBackboneData(molecule)).toBe(true);
    expect(reads.count).toBe(0);
  });
});
