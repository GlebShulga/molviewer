import { describe, expect, it } from 'vitest';
import { surfaceAtoms, surfaceVertexColors } from '../surfaceAtoms';
import { getAtomColor, calculateColorSchemeContext } from '../atomColor';
import type { ComponentSettings } from '../moleculeTypeClassifier';
import type { Atom, Molecule } from '../../types';

const atom = (id: number, chainId: string, residueName: string): Atom => ({ id, element: 'C', residueName, residueNumber: id, chainId, x: id, y: 0, z: 0 });
// 0-1 protein (chain A), 2 water, 3 ligand (chain B), 4 ion
const molecule: Molecule = {
  name: 'm',
  atoms: [atom(0, 'A', 'ALA'), atom(1, 'A', 'GLY'), atom(2, 'W', 'HOH'), atom(3, 'B', 'LIG'), atom(4, 'C', 'ZN')],
  bonds: [],
};
const component = (type: ComponentSettings['type'], atomIndices: number[], visible = true): ComponentSettings => ({
  type, atomIndices, representation: 'cartoon', colorScheme: 'cpk', visible,
});
const all = (overrides: Partial<Record<ComponentSettings['type'], boolean>> = {}) => [
  component('protein', [0, 1], overrides.protein ?? true),
  component('water', [2], overrides.water ?? true),
  component('ligand', [3], overrides.ligand ?? true),
  component('ion', [4], overrides.ion ?? true),
];

describe('surfaceAtoms', () => {
  it('covers visible components other than water and ions, with a map back to the molecule', () => {
    const subset = surfaceAtoms(molecule, all());
    expect(subset.atoms.map((a) => a.id)).toEqual([0, 1, 3]);
    expect(subset.map).toEqual([0, 1, 3]);
  });

  it('leaves out hidden components', () => {
    expect(surfaceAtoms(molecule, all({ ligand: false })).atoms.map((a) => a.id)).toEqual([0, 1]);
  });

  it('draws nothing when every component is hidden', () => {
    expect(surfaceAtoms(molecule, all({ protein: false, ligand: false })).atoms).toEqual([]);
  });

  it('falls back to all atoms for a water-only or ion-only file', () => {
    const water: Molecule = { name: 'w', atoms: [atom(0, 'W', 'HOH'), atom(1, 'W', 'HOH')], bonds: [] };
    const subset = surfaceAtoms(water, [component('water', [0, 1], false)]);
    expect(subset.atoms).toHaveLength(2);
    expect(subset.map).toBeNull();
  });

  it('keys the surface by the visible component types, so equal-size subsets never share a mesh', () => {
    const proteinOnly = surfaceAtoms(molecule, all({ ligand: false })).key;
    const ligandOnly = surfaceAtoms(molecule, all({ protein: false })).key;
    expect(proteinOnly).not.toBe(ligandOnly);
    // Water and ions are never in the surface: toggling them keeps the mesh
    expect(surfaceAtoms(molecule, all({ water: false, ion: false })).key).toBe(surfaceAtoms(molecule, all()).key);
  });
});

describe('surfaceVertexColors', () => {
  it('colours a vertex like the original atom it came from', () => {
    const subset = surfaceAtoms(molecule, all());
    // Vertex 0 nearest subset atom 2 (the ligand, original index 3, chain B)
    const colors = surfaceVertexColors(Int32Array.from([2]), subset, molecule, 'chain', calculateColorSchemeContext(molecule));
    const expected = getAtomColor(molecule.atoms[3], 'chain', calculateColorSchemeContext(molecule));
    const other = getAtomColor(molecule.atoms[2], 'chain', calculateColorSchemeContext(molecule));
    expect(expected).not.toBe(other);
    const rgb = Array.from(colors);
    const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(rgb.length).toBe(3);
    expect(rgb.every((v) => v >= 0 && v <= 1)).toBe(true);
    // Same colour as the original atom (any colour space): brightest channel matches
    const exp = parse(expected);
    expect(rgb.indexOf(Math.max(...rgb))).toBe(exp.indexOf(Math.max(...exp)));
  });
});
