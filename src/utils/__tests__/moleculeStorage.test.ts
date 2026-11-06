import { describe, it, expect, beforeEach } from 'vitest';
import { getSavedMolecules, saveSession } from '../moleculeStorage';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { AROMATIC_DETECTION_THRESHOLD } from '../../config/rendering';
import type { Molecule } from '../../types';

// jsdom has no indexedDB, so every save here goes through localStorage.

/** Six carbons on a hexagon, ring bonds with the given orders (benzene: 2,1,2,1,2,1). */
function hexagonMolecule(name: string, orders: (1 | 2)[]): Molecule {
  return {
    name,
    atoms: orders.map((_, i) => ({
      id: i,
      element: 'C',
      x: 1.39 * Math.cos((i * Math.PI) / 3),
      y: 1.39 * Math.sin((i * Math.PI) / 3),
      z: 0,
    })),
    bonds: orders.map((order, i) => ({ atom1Index: i, atom2Index: (i + 1) % 6, order })),
  };
}

const benzene = () => hexagonMolecule('benzene', [2, 1, 2, 1, 2, 1]);
const cyclohexene = () => hexagonMolecule('cyclohexene', [2, 1, 1, 1, 1, 1]);

describe('saved ring count', () => {
  beforeEach(() => {
    localStorage.clear();
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  /** Save a session the way the Saved panel does, after a load dropped its rings. */
  async function saveLoadedSession(molecule: Molecule) {
    const store = useMoleculeStore.getState();
    const id = store.addStructure(molecule, molecule.name);
    store.detectAromaticRingsIfNeeded(id);
    const original = store.buildSession('original', null);
    store.reset();
    useMoleculeStore.getState().loadSession(original);
    // Cartoon or Spacefill shown: detection never ran after the load
    expect(useMoleculeStore.getState().structures.get(id)?.molecule.aromaticRings).toBeUndefined();
    return saveSession(useMoleculeStore.getState().buildSession('resaved', null));
  }

  it('counts rings in a session saved without running detection', async () => {
    const entry = await saveLoadedSession(benzene());
    expect(entry.aromaticRingCount).toBe(1);
    expect(getSavedMolecules()[0].aromaticRingCount).toBe(1);
  });

  it('counts no rings for cyclohexene', async () => {
    const entry = await saveLoadedSession(cyclohexene());
    expect(entry.aromaticRingCount).toBe(0);
  });

  it('counts 0 above the detection threshold', async () => {
    const big = benzene();
    for (let i = big.atoms.length; i <= AROMATIC_DETECTION_THRESHOLD; i++) {
      big.atoms.push({ id: i, element: 'C', x: i * 10, y: 0, z: 0 });
    }
    useMoleculeStore.getState().addStructure(big, 'big');
    const entry = await saveSession(useMoleculeStore.getState().buildSession('big', null));
    expect(entry.aromaticRingCount).toBe(0);
  });
});
