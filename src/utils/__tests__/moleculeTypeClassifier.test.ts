import { describe, expect, it } from 'vitest';
import { classifyMolecule } from '../moleculeTypeClassifier';
import { analyzeResidues } from '../residueAnalysis';
import type { Atom, Molecule } from '../../types';

/**
 * A residue whose atoms are not contiguous in the file: ALA 1 is split by a
 * water written between its atoms (TER-less files, and hydrogens listed
 * after the heavy atoms, do this).
 */
function splitResidue(): Molecule {
  const atom = (id: number, name: string, element: string, residueName: string, residueNumber: number): Atom => ({
    id, name, element, residueName, residueNumber, chainId: 'A', x: id * 1.5, y: 0, z: 0,
  });
  return {
    name: 'split',
    atoms: [atom(0, 'N', 'N', 'ALA', 1), atom(1, 'CA', 'C', 'ALA', 1), atom(2, 'O', 'O', 'HOH', 2), atom(3, 'C', 'C', 'ALA', 1)],
    bonds: [],
  };
}

describe('residue atom indices', () => {
  it('lists every atom of a residue whose atoms are split in the file', () => {
    const [chain] = analyzeResidues(splitResidue().atoms);
    expect(chain.residues.find((r) => r.name === 'ALA')!.atomIndices).toEqual([0, 1, 3]);
  });

  it('puts a split residue\'s atoms in its component', () => {
    const { components } = classifyMolecule(splitResidue());
    expect(components.find((c) => c.type === 'protein')!.atomIndices.sort()).toEqual([0, 1, 3]);
    expect(components.find((c) => c.type === 'water')!.atomIndices).toEqual([2]);
  });
});

describe('large files', () => {
  it('classifies 200,000 atoms in one residue (an XYZ file) without overflowing the call stack', () => {
    const atoms: Atom[] = Array.from({ length: 200_000 }, (_, id) => ({ id, element: 'C', x: id, y: 0, z: 0 }));
    const { components } = classifyMolecule({ name: 'big', atoms, bonds: [] });
    expect(components).toHaveLength(1);
    expect(components[0].atomIndices).toHaveLength(200_000);
  });
});

/**
 * A straight peptide chain along x: N-CA 1.46 Å, CA-C 1.52 Å and a 1.33 Å
 * peptide bond from each C to the next N. A residue's own N and C are
 * 2.98 Å apart, so only neighbours link. `names` lists each residue's atom
 * names (N, CA, C, O by default).
 */
function peptide(
  chainId: string,
  residues: { name: string; atoms?: string[] }[],
  start: { x?: number; y?: number; number?: number } = {}
): Atom[] {
  const atoms: Atom[] = [];
  const offsets: Record<string, [number, number]> = { N: [0, 0], CA: [1.46, 0], C: [2.98, 0], O: [2.98, 1.23] };
  residues.forEach((residue, i) => {
    const base = (start.x ?? 0) + i * 4.31;
    for (const name of residue.atoms ?? ['N', 'CA', 'C', 'O']) {
      const [dx, dy] = offsets[name];
      atoms.push({
        id: atoms.length, name, element: name === 'CA' ? 'C' : name[0], residueName: residue.name,
        residueNumber: (start.number ?? 1) + i, chainId, x: base + dx, y: (start.y ?? 0) + dy, z: 0,
      });
    }
  });
  return atoms;
}

/** SAM's methionine part, with its atom names, away from the chain: a ligand, not a residue. */
function sam(chainId: string, firstId: number): Atom[] {
  return [
    ['N', 'N', 0], ['CA', 'C', 1.46], ['C', 'C', 2.98], ['O', 'O', 3.6], ['OXT', 'O', 4.2], ['CB', 'C', 5.1], ['SD', 'S', 6.5],
  ].map(([name, element, x], i) => ({
    id: firstId + i, name: name as string, element: element as string, residueName: 'SAM', residueNumber: 301,
    chainId, x: (x as number) + 30, y: 8, z: 0,
  }));
}

function molecule(atoms: Atom[]): Molecule {
  return { name: 'test', atoms: atoms.map((a, id) => ({ ...a, id })), bonds: [] };
}

function residuesOf(classification: ReturnType<typeof classifyMolecule>, type: string): string[] {
  return [...(classification.components.find((c) => c.type === type)?.residueFilter ?? [])].sort();
}

describe('peptide-linked residues outside the 20 standard amino acids', () => {
  const chainA = () => peptide('A', [{ name: 'ALA' }, { name: 'MSE' }, { name: 'ALA' }, { name: 'HIE' }]);

  it('puts modified (MSE) and simulation-named (HIE) residues in the protein component', () => {
    const classification = classifyMolecule(molecule(chainA()));
    expect(classification.components.map((c) => c.type)).toEqual(['protein']);
    expect(classification.hasMultipleTypes).toBe(false);
    expect(classification.components[0].atomIndices).toHaveLength(16);
  });

  it('keeps SAM, whose atoms carry amino-acid names, a ligand beside such a chain', () => {
    const atoms = chainA();
    const classification = classifyMolecule(molecule([...atoms, ...sam('A', atoms.length)]));
    expect(residuesOf(classification, 'protein')).toEqual(['A:1', 'A:2', 'A:3', 'A:4']);
    expect(residuesOf(classification, 'ligand')).toEqual(['A:301']);
  });

  it('links a first residue through its C', () => {
    const classification = classifyMolecule(molecule(peptide('A', [{ name: 'MSE' }, { name: 'ALA' }])));
    expect(classification.components.map((c) => c.type)).toEqual(['protein']);
  });

  it('makes a linked D-peptide in a chain of its own protein', () => {
    const classification = classifyMolecule(molecule(peptide('B', [{ name: 'DAL' }, { name: 'DLE' }])));
    expect(classification.components.map((c) => c.type)).toEqual(['protein']);
  });

  it('keeps a residue without an alpha carbon (an NME cap) a ligand', () => {
    const atoms = peptide('A', [{ name: 'ALA' }, { name: 'NME', atoms: ['N', 'C'] }]);
    expect(residuesOf(classifyMolecule(molecule(atoms)), 'ligand')).toEqual(['A:2']);
  });

  it('keeps a nucleotide name with N, CA and C out of the protein component', () => {
    const atoms = peptide('A', [{ name: 'ALA' }, { name: 'A' }]);
    expect(residuesOf(classifyMolecule(molecule(atoms)), 'ligand')).toEqual(['A:2']);
  });
});
