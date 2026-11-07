import { describe, expect, it } from 'vitest';
import { extractBackbone, hasBackboneData } from '../backboneExtraction';
import { calculateColorSchemeContext } from '../atomColor';
import { detectSecondaryStructure } from '../secondaryStructureDetection';
import { classifyMolecule } from '../moleculeTypeClassifier';
import { parsePDB } from '../../parsers/pdbParser';
import type { Atom, Molecule } from '../../types';

/** A straight-ish protein backbone: N, CA, C per residue, 3.8 Å apart. */
function chain(numbers: number[], chainId?: string): Molecule {
  const atoms: Atom[] = [];
  numbers.forEach((n, i) => {
    for (const [name, element, dx] of [['N', 'N', 0], ['CA', 'C', 1.2], ['C', 'C', 2.4]] as const) {
      atoms.push({ id: atoms.length, name, element, residueName: 'ALA', residueNumber: n, chainId, x: i * 3.8 + dx, y: 0, z: 0 });
    }
  });
  return { name: 'chain', atoms, bonds: [] };
}

describe('backbone tracing', () => {
  it('traces residue 0', () => {
    const [c] = extractBackbone(chain([0, 1, 2], 'A'));
    expect(c.residues.map((r) => r.residueNumber)).toEqual([0, 1, 2]);
  });

  it('traces a file without chain IDs, with the same keys the Cartoon filter uses', () => {
    const m = chain([1, 2, 3]);
    const chains = extractBackbone(m);
    expect(chains).toHaveLength(1);
    const protein = classifyMolecule(m).components.find((c) => c.type === 'protein')!;
    for (const r of chains[0].residues) expect(protein.residueFilter!.has(`${r.chainId}:${r.residueNumber}`)).toBe(true);
  });

  it('keeps negative residue numbers in order, and finds their secondary structure', () => {
    const m = chain([-3, -2, -1, 0, 1, 2, 3], 'A');
    expect(extractBackbone(m)[0].residues.map((r) => r.residueNumber)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    detectSecondaryStructure(m);
    expect(m.atoms.every((a) => a.secondaryStructure !== undefined)).toBe(true);
  });

  it('finds secondary structure in a file without chain IDs', () => {
    const m = chain([1, 2, 3]);
    detectSecondaryStructure(m);
    expect(m.atoms.every((a) => a.secondaryStructure !== undefined)).toBe(true);
  });

  it('does not trace a calcium ion named CA', () => {
    const m = chain([1, 2], 'A');
    m.atoms.push({ id: m.atoms.length, name: 'CA', element: 'Ca', residueName: 'CA', residueNumber: 3, chainId: 'A', x: 11.4, y: 0, z: 0 });
    expect(extractBackbone(m)[0].residues.map((r) => r.residueNumber)).toEqual([1, 2]);
  });

  it('does not trace segments without chain IDs whose numbering restarts', () => {
    const first = chain([1, 2, 3]);
    const second = chain([1, 2, 3]).atoms.map((a, i) => ({ ...a, id: first.atoms.length + i, y: 20 }));
    const m: Molecule = { name: 'segments', atoms: [...first.atoms, ...second], bonds: [] };
    expect(extractBackbone(m).find((c) => c.chainId === 'Unknown')).toBeUndefined();
    // So Cartoon is not offered: it would draw nothing
    expect(hasBackboneData(m)).toBe(false);
    expect(calculateColorSchemeContext(m).hasBackboneData).toBe(false);
    detectSecondaryStructure(m);
    expect(m.atoms.every((a) => a.secondaryStructure === undefined)).toBe(true);
  });

  it('still traces the chains with IDs next to ambiguous chainless segments', () => {
    const segments = [...chain([1, 2]).atoms, ...chain([1, 2]).atoms.map((a) => ({ ...a, y: 20 }))];
    const m: Molecule = { name: 'mixed', atoms: [...chain([1, 2, 3], 'A').atoms, ...segments].map((a, id) => ({ ...a, id })), bonds: [] };
    expect(extractBackbone(m).map((c) => c.chainId)).toEqual(['A']);
    expect(hasBackboneData(m)).toBe(true);
  });

  it('keeps a residue\'s carbonyl O when a water has the same number', () => {
    for (const chainId of ['A', undefined]) {
      const m = chain([1, 2, 3], chainId);
      m.atoms.push({ id: m.atoms.length, name: 'O', element: 'O', residueName: 'ALA', residueNumber: 2, chainId, x: 6.2, y: 1.2, z: 0 });
      m.atoms.push({ id: m.atoms.length, name: 'O', element: 'O', residueName: 'HOH', residueNumber: 2, chainId, x: 40, y: 40, z: 40 });
      const residue = extractBackbone(m)[0].residues.find((r) => r.residueNumber === 2)!;
      expect(residue.o).toEqual({ x: 6.2, y: 1.2, z: 0 });
    }
  });

  it('keeps tracing a chainless protein when a ligand has a residue\'s number and a carbon named CA', () => {
    // MD and docking output: ligand LIG numbered 2, beside protein residue 2
    const m = chain([1, 2, 3]);
    const ligand = (name: string, element: string, x: number): Atom =>
      ({ id: m.atoms.length, name, element, residueName: 'LIG', residueNumber: 2, x, y: 15, z: 0 });
    m.atoms.push(ligand('CA', 'C', 40), ligand('C1', 'C', 41.5), ligand('O', 'O', 43));
    expect(hasBackboneData(m)).toBe(true);
    const [traced] = extractBackbone(m);
    expect(traced.chainId).toBe('Unknown');
    expect(traced.residues.map((r) => r.residueNumber)).toEqual([1, 2, 3]);
    detectSecondaryStructure(m);
    expect(m.atoms.filter((a) => a.residueName === 'ALA').every((a) => a.secondaryStructure !== undefined)).toBe(true);
  });

  it('keeps a residue\'s backbone atoms when a ligand with its number has atoms named CA, N, C or O', () => {
    for (const chainId of ['A', undefined]) {
      const m = chain([1, 2, 3], chainId);
      const caIndex = m.atoms.findIndex((a) => a.residueNumber === 2 && a.name === 'CA');
      for (const [name, element] of [['CA', 'C'], ['N', 'N'], ['O', 'O']] as const) {
        m.atoms.push({ id: m.atoms.length, name, element, residueName: 'LIG', residueNumber: 2, chainId, x: 40, y: 40, z: 40 });
      }
      const residue = extractBackbone(m)[0].residues.find((r) => r.residueNumber === 2)!;
      expect(residue.atomIndex).toBe(caIndex);
      expect(residue.ca).toEqual({ x: m.atoms[caIndex].x, y: 0, z: 0 });
      expect(residue.n).toEqual({ x: 3.8, y: 0, z: 0 });
      expect(residue.o).toBeUndefined();
    }
  });

  it('applies HELIX records of a file without chain IDs', () => {
    const atomLine = (serial: number, name: string, resSeq: number, x: number) =>
      `ATOM  ${String(serial).padStart(5)} ${name.padEnd(4)} ALA  ${String(resSeq).padStart(4)}    ${x.toFixed(3).padStart(8)}${'0.000'.padStart(8)}${'0.000'.padStart(8)}  1.00  0.00           C`;
    const helix = 'HELIX    1   1 ALA      1  ALA      3  1                                   3';
    const lines = [helix];
    for (let r = 1; r <= 4; r++) lines.push(atomLine(r, ' CA ', r, r * 3.8));
    const m = parsePDB([...lines, 'END'].join('\n'));
    expect(m.atoms.map((a) => a.secondaryStructure)).toEqual(['helix', 'helix', 'helix', 'coil']);
  });
});
