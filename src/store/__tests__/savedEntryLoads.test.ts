import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Molecule } from '../../types';
import type { MolViewerSession } from '../../types/session';

// Loading entries from the Saved panel. jsdom has no indexedDB, so the async
// storage loaders are stubbed: an IndexedDB entry is one the synchronous
// loader can't read, and a failed read comes back as null.
const storage = vi.hoisted(() => ({
  loadMoleculeAsync: vi.fn(),
  loadSessionAsync: vi.fn(),
}));

vi.mock('../../utils/moleculeStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/moleculeStorage')>()),
  loadMolecule: () => null,
  loadMoleculeAsync: storage.loadMoleculeAsync,
  loadSessionAsync: storage.loadSessionAsync,
}));

const { useMoleculeStore, temporalStore } = await import('../moleculeStore');

function molecule(name: string, atomCount = 3): Molecule {
  return {
    name,
    atoms: Array.from({ length: atomCount }, (_, i) => ({ id: i, element: 'C', x: i * 1.5, y: 0, z: 0 })),
    bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 }],
  };
}

/** A session holding one structure, built through the store. */
function session(name: string): MolViewerSession {
  const store = useMoleculeStore.getState();
  store.reset();
  store.addStructure(molecule(name), name);
  const built = store.buildSession(name, null);
  store.reset();
  return built;
}

const shownNames = () => {
  const { structures, structureOrder } = useMoleculeStore.getState();
  return structureOrder.map((id) => structures.get(id)?.name);
};

beforeEach(() => {
  storage.loadMoleculeAsync.mockReset();
  storage.loadSessionAsync.mockReset();
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
});

describe('loadSavedMolecule', () => {
  it('loads an entry stored in IndexedDB through the async loader', async () => {
    storage.loadMoleculeAsync.mockResolvedValue({ molecule: molecule('Large legacy molecule'), measurements: [] });

    await useMoleculeStore.getState().loadSavedMolecule('idb-entry');

    const state = useMoleculeStore.getState();
    expect(shownNames()).toEqual(['Large legacy molecule']);
    expect(state.loadedMoleculeId).toBe('idb-entry');
  });

  it('throws when the entry cannot be read, leaving the scene as it was', async () => {
    useMoleculeStore.getState().addStructure(molecule('On screen'), 'On screen');
    storage.loadMoleculeAsync.mockResolvedValue(null);

    await expect(useMoleculeStore.getState().loadSavedMolecule('broken')).rejects.toThrow(
      'This saved molecule could not be read'
    );
    expect(shownNames()).toEqual(['On screen']);
  });
});

describe('loadSavedSession', () => {
  it('loads the session', async () => {
    storage.loadSessionAsync.mockResolvedValue(session('Saved session'));

    await useMoleculeStore.getState().loadSavedSession('s1');

    expect(shownNames()).toEqual(['Saved session']);
    expect(useMoleculeStore.getState().loadedMoleculeId).toBe('s1');
  });

  it('throws when the session cannot be read, leaving the scene as it was', async () => {
    useMoleculeStore.getState().addStructure(molecule('On screen'), 'On screen');
    storage.loadSessionAsync.mockResolvedValue(null);

    await expect(useMoleculeStore.getState().loadSavedSession('broken')).rejects.toThrow(
      'This saved session could not be read'
    );
    expect(shownNames()).toEqual(['On screen']);
  });
});
