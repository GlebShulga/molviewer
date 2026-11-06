import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Molecule } from '../../types';

// jsdom has no indexedDB. Stand in for an entry stored there: the synchronous
// loader can't read it (it returns null), only the async one can.
const stored: { molecule: Molecule; measurements: [] } = {
  molecule: {
    name: 'Large legacy molecule',
    atoms: [0, 1, 2].map((i) => ({ id: i, element: 'C', x: i * 1.5, y: 0, z: 0 })),
    bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 }],
  },
  measurements: [],
};

vi.mock('../../utils/moleculeStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/moleculeStorage')>()),
  loadMolecule: () => null,
  loadMoleculeAsync: async () => stored,
}));

const { useMoleculeStore, temporalStore } = await import('../moleculeStore');

describe('loadSavedMolecule with an entry in IndexedDB', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('loads it through the async loader', async () => {
    await useMoleculeStore.getState().loadSavedMolecule('idb-entry');

    const state = useMoleculeStore.getState();
    expect(state.structures.size).toBe(1);
    expect(state.structures.get(state.activeStructureId!)?.molecule.atoms).toHaveLength(3);
    expect(state.loadedMoleculeId).toBe('idb-entry');
  });
});
