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

/** A promise resolved from outside, to finish reads in a chosen order. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('two loads from the Saved panel in quick succession', () => {
  it('shows the one clicked last when the first read finishes after it', async () => {
    const slow = deferred<MolViewerSession | null>();
    const fast = deferred<MolViewerSession | null>();
    storage.loadSessionAsync.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const sessionA = session('A');
    const sessionB = session('B');

    const first = useMoleculeStore.getState().loadSavedSession('a');
    const second = useMoleculeStore.getState().loadSavedSession('b');
    fast.resolve(sessionB);
    await second;
    slow.resolve(sessionA);
    await first;

    expect(shownNames()).toEqual(['B']);
    expect(useMoleculeStore.getState().loadedMoleculeId).toBe('b');
  });

  it('applies to a saved molecule and a session together', async () => {
    const slow = deferred<{ molecule: Molecule; measurements: [] } | null>();
    storage.loadMoleculeAsync.mockReturnValueOnce(slow.promise);
    storage.loadSessionAsync.mockResolvedValueOnce(session('Session'));

    const first = useMoleculeStore.getState().loadSavedMolecule('m');
    await useMoleculeStore.getState().loadSavedSession('s');
    slow.resolve({ molecule: molecule('Old molecule'), measurements: [] });
    await first;

    expect(shownNames()).toEqual(['Session']);
  });

  it('does not report a failure of a load that was overtaken', async () => {
    const slow = deferred<MolViewerSession | null>();
    storage.loadSessionAsync.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(session('B'));

    const first = useMoleculeStore.getState().loadSavedSession('broken');
    await useMoleculeStore.getState().loadSavedSession('b');
    slow.resolve(null);

    await expect(first).resolves.toBeNull();
    expect(shownNames()).toEqual(['B']);
  });
});
