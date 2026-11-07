import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteMolecule, getSavedMolecules, getStorageUsage, loadSessionAsync, renameMolecule, saveSession, updateSession } from '../moleculeStorage';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { AROMATIC_DETECTION_THRESHOLD } from '../../config/rendering';
import type { Molecule } from '../../types';

const reporter = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../errorReporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../errorReporter')>()),
  logError: reporter.logError,
}));

// IndexedDB is fake-indexeddb. Sessions below 50,000 atoms (and 1 MB) go to
// localStorage, larger ones to IndexedDB, as in the app.

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

describe('session writes that fail or race', () => {
  beforeEach(() => {
    localStorage.clear();
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });
  afterEach(() => vi.restoreAllMocks());

  /** A session as the Saved panel builds it; `atoms` of 50,000+ go to IndexedDB. */
  function buildSession(name: string, atoms: number) {
    const store = useMoleculeStore.getState();
    store.reset();
    const molecule: Molecule = {
      name,
      atoms: Array.from({ length: atoms }, (_, i) => ({ id: i, element: 'C', x: (i % 100) * 4, y: Math.floor(i / 100) * 4, z: 0 })),
      bonds: [],
    };
    store.addStructure(molecule, name);
    const session = store.buildSession(name, null);
    store.reset();
    return session;
  }
  const LARGE = 50_000;

  /** localStorage.setItem fails for the Saved index only. */
  function failIndexWrites() {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'mol3d_index') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    });
  }

  it('an entry deleted while its update is writing stays deleted', async () => {
    const entry = await saveSession(buildSession('Big', LARGE));
    const update = updateSession(entry.id, buildSession('Big', LARGE));
    deleteMolecule(entry.id);
    await expect(update).resolves.toBeNull();
    expect(getSavedMolecules().map((e) => e.id)).not.toContain(entry.id);
    expect(await loadSessionAsync(entry.id)).toBeNull();
  });

  it('a rename made while an update is writing is kept', async () => {
    const entry = await saveSession(buildSession('Old name', LARGE));
    const update = updateSession(entry.id, buildSession('Old name', LARGE));
    renameMolecule(entry.id, 'New name');
    await update;
    expect(getSavedMolecules().find((e) => e.id === entry.id)?.name).toBe('New name');
  });

  it('a failed index write on save leaves no orphaned payload, and says storage is full', async () => {
    const session = buildSession('Small', 10);
    failIndexWrites();
    await expect(saveSession(session)).rejects.toThrow('Storage is full');
    expect(Object.keys(localStorage).filter((k) => k.startsWith('mol3d_session_'))).toEqual([]);
  });

  it('a failed index write on an update that moves storage keeps the saved session loadable', async () => {
    const entry = await saveSession(buildSession('Grows', 10));
    failIndexWrites();
    await expect(updateSession(entry.id, buildSession('Grows', LARGE))).rejects.toThrow();
    vi.restoreAllMocks();
    // The index still points at localStorage, so that copy must still be there
    const loaded = await loadSessionAsync(entry.id);
    expect(loaded?.state.structures[0].molecule.atoms).toHaveLength(10);
  });
});

describe('storage blocked by the browser', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
  beforeEach(() => {
    reporter.logError.mockClear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'localStorage', original);
  });

  it('lists no saved entries without sending an error report', () => {
    expect(getSavedMolecules()).toEqual([]);
    expect(reporter.logError).not.toHaveBeenCalled();
  });

  it('reports zero usage', () => {
    expect(getStorageUsage()).toMatchObject({ used: 0, percentage: 0 });
  });
});

describe('a corrupt index', () => {
  beforeEach(() => {
    localStorage.clear();
    reporter.logError.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('is still reported', () => {
    localStorage.setItem('mol3d_index', '{not json');
    expect(getSavedMolecules()).toEqual([]);
    expect(reporter.logError).toHaveBeenCalledTimes(1);
  });
});
