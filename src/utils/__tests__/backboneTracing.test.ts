import { describe, expect, it } from 'vitest';
import { extractBackbone } from '../backboneExtraction';
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
