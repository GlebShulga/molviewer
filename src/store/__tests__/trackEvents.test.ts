import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMoleculeStore, temporalStore } from '../moleculeStore';
import type { Atom, Molecule } from '../../types';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../utils/track', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/track')>()),
  track,
}));

/** 46 carbons in a row: one component, small enough that roundAtoms keeps the count. */
function chain(): Molecule {
  const atoms = Array.from({ length: 46 }, (_, i) => ({
    id: i, element: 'C', x: i * 1.5, y: 0, z: 0, residueName: 'LIG', residueNumber: 1, chainId: 'A',
  }));
  return { name: 'chain', atoms, bonds: [] };
}

/** 1,250 residues of N, CA, C, O (5,000 atoms, GPU picking) plus a two-atom heme at 5000-5001. */
function proteinWithHeme(): Molecule {
  const atoms: Atom[] = [];
  for (let r = 1; r <= 1250; r++) {
    for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
      atoms.push({ id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, chainId: 'A', x: r * 1.5, y: 0, z: 0 });
    }
  }
  atoms.push({ id: atoms.length, element: 'Fe', name: 'FE', residueName: 'HEM', residueNumber: 1251, chainId: 'A', x: 0, y: 5, z: 0 });
  atoms.push({ id: atoms.length, element: 'C', name: 'C1', residueName: 'HEM', residueNumber: 1251, chainId: 'A', x: 1, y: 5, z: 0 });
  return { name: 'protein', atoms, bonds: [] };
}

const store = () => useMoleculeStore.getState();

function load(molecule: Molecule): string {
  const id = store().addStructure(molecule, molecule.name);
  track.mockClear();
  return id;
}

beforeEach(() => {
  store().reset();
  temporalStore.getState().clear();
});

describe('events of actions on a structure carry its style and size', () => {
  let id: string;
  beforeEach(() => {
    id = load(chain());
  });

  it('counts a style switch once, not a click on the style already shown', () => {
    const next = store().structures.get(id)!.representation === 'spacefill' ? 'stick' : 'spacefill';

    store().setRepresentation(next);
    store().setRepresentation(next);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('representation_changed', { value: next, atoms: 46 });
  });

  it('reports a measurement with the style it was made in', () => {
    const style = store().structures.get(id)!.representation;
    store().setMeasurementMode('distance');

    store().selectAtom(id, 0);
    store().selectAtom(id, 1);

    expect(track).toHaveBeenCalledWith('measurement_added', { kind: 'distance', value: style, format: 'cpu', atoms: 46 });
  });

  it('reports a label', () => {
    const style = store().structures.get(id)!.representation;

    store().addLabel(id, 0, 'C1');

    expect(track).toHaveBeenCalledWith('label_added', { value: style, format: 'cpu', atoms: 46 });
  });

  it('reports the atom menu, on the active structure when the menu names none', () => {
    const style = store().structures.get(id)!.representation;

    store().showContextMenu({ x: 0, y: 0, atomIndex: 3 });

    expect(track).toHaveBeenCalledWith('atom_menu_opened', { value: style, format: 'cpu', atoms: 46 });
  });
});

describe('a pick in a structure split into components', () => {
  it('reports the style and picking of the component the atom is drawn in', () => {
    const id = load(proteinWithHeme());
    expect(store().structures.get(id)!.representation).toBe('cartoon');

    // The heme next to a Cartoon protein: its own small Ball & Stick instance
    store().showContextMenu({ x: 0, y: 0, atomIndex: 5000, structureId: id });
    expect(track).toHaveBeenLastCalledWith('atom_menu_opened', { value: 'ball-and-stick', format: 'cpu', atoms: 5000 });

    // The 5,000 protein atoms in Spacefill: one instance, picked on the GPU
    store().setRepresentation('spacefill');
    store().showContextMenu({ x: 0, y: 0, atomIndex: 0, structureId: id });
    expect(track).toHaveBeenLastCalledWith('atom_menu_opened', { value: 'spacefill', format: 'gpu', atoms: 5000 });
  });
});
