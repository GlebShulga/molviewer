import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Molecule } from '../../types';
import type { MolViewerSession } from '../../types/session';

// Loading entries from the Saved panel. jsdom has no indexedDB, so the async
// storage loaders are stubbed; a failed read comes back as null.
const storage = vi.hoisted(() => ({
  loadMoleculeAsync: vi.fn(),
  loadSessionAsync: vi.fn(),
}));

vi.mock('../../utils/moleculeStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/moleculeStorage')>()),
  loadMoleculeAsync: storage.loadMoleculeAsync,
  loadSessionAsync: storage.loadSessionAsync,
}));

const {
  useMoleculeStore,
  temporalStore,
  beginSceneLoad,
  finishSceneLoad,
  isCurrentSceneLoad,
  applySceneLoad,
  resetSceneLoadsForTests,
} = await import('../moleculeStore');

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
  resetSceneLoadsForTests();
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
});

describe('loadSavedMolecule', () => {
  it('loads NaN and null residue numbers (from older parsing, kept by IndexedDB and JSON) as undefined', async () => {
    const saved = molecule('Old save');
    saved.atoms[0] = { ...saved.atoms[0], residueNumber: 1 };
    saved.atoms[1] = { ...saved.atoms[1], residueNumber: NaN };
    saved.atoms[2] = { ...saved.atoms[2], residueNumber: null as unknown as number };
    storage.loadMoleculeAsync.mockResolvedValue({ molecule: saved, measurements: [] });

    await useMoleculeStore.getState().loadSavedMolecule('old-entry');

    const { structures, activeStructureId } = useMoleculeStore.getState();
    expect(structures.get(activeStructureId!)!.molecule.atoms.map((a) => a.residueNumber)).toEqual([1, undefined, undefined]);
  });

  it('loads an entry stored in IndexedDB through the async loader', async () => {
    storage.loadMoleculeAsync.mockResolvedValue({ molecule: molecule('Large legacy molecule'), measurements: [] });

    await useMoleculeStore.getState().loadSavedMolecule('idb-entry');

    expect(shownNames()).toEqual(['Large legacy molecule']);
  });

  it("leaves no saved entry marked as loaded, so a session's Update button goes away", async () => {
    // loadedMoleculeId drives the Update button, shown only for sessions
    storage.loadSessionAsync.mockResolvedValue(session('Saved session'));
    await useMoleculeStore.getState().loadSavedSession('s1');
    expect(useMoleculeStore.getState().loadedMoleculeId).toBe('s1');
    storage.loadMoleculeAsync.mockResolvedValue({ molecule: molecule('Legacy molecule'), measurements: [] });

    await useMoleculeStore.getState().loadSavedMolecule('legacy');

    expect(useMoleculeStore.getState().loadedMoleculeId).toBeNull();
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

  it('shows the first one while the second still reads, then the second', async () => {
    const slow = deferred<MolViewerSession | null>();
    const slower = deferred<MolViewerSession | null>();
    storage.loadSessionAsync.mockReturnValueOnce(slow.promise).mockReturnValueOnce(slower.promise);
    const sessionA = session('A');
    const sessionB = session('B');

    const first = useMoleculeStore.getState().loadSavedSession('a');
    const second = useMoleculeStore.getState().loadSavedSession('b');
    slow.resolve(sessionA);
    await first;
    expect(shownNames()).toEqual(['A']);
    expect(useMoleculeStore.getState().loadedMoleculeId).toBe('a');

    slower.resolve(sessionB);
    await second;
    expect(shownNames()).toEqual(['B']);
    expect(useMoleculeStore.getState().loadedMoleculeId).toBe('b');
  });

  it('deleting the first neither shows it nor reports an error', async () => {
    const slow = deferred<MolViewerSession | null>();
    const slower = deferred<MolViewerSession | null>();
    storage.loadSessionAsync.mockReturnValueOnce(slow.promise).mockReturnValueOnce(slower.promise);
    const sessionB = session('B');

    const first = useMoleculeStore.getState().loadSavedSession('a');
    const second = useMoleculeStore.getState().loadSavedSession('b');
    useMoleculeStore.getState().deleteSavedMolecule('a');
    slow.resolve(null);
    await expect(first).resolves.toBeNull();
    expect(shownNames()).toEqual([]);

    slower.resolve(sessionB);
    await second;
    expect(shownNames()).toEqual(['B']);
  });

  it('deleting the first keeps it off screen even when its read had the data', async () => {
    const slow = deferred<MolViewerSession | null>();
    const slower = deferred<MolViewerSession | null>();
    storage.loadSessionAsync.mockReturnValueOnce(slow.promise).mockReturnValueOnce(slower.promise);
    const sessionA = session('A');

    const first = useMoleculeStore.getState().loadSavedSession('a');
    const second = useMoleculeStore.getState().loadSavedSession('b');
    useMoleculeStore.getState().deleteSavedMolecule('a');
    slow.resolve(sessionA);
    await expect(first).resolves.toBeNull();
    expect(shownNames()).toEqual([]);
    expect(useMoleculeStore.getState().loadedMoleculeId).toBeNull();

    slower.resolve(null);
    await expect(second).rejects.toThrow('could not be read');
  });

  it('Clear All cancels both', async () => {
    const slow = deferred<MolViewerSession | null>();
    const slower = deferred<MolViewerSession | null>();
    storage.loadSessionAsync.mockReturnValueOnce(slow.promise).mockReturnValueOnce(slower.promise);
    const sessionA = session('A');
    const sessionB = session('B');

    const first = useMoleculeStore.getState().loadSavedSession('a');
    const second = useMoleculeStore.getState().loadSavedSession('b');
    useMoleculeStore.getState().clearAllSavedMolecules();
    slow.resolve(sessionA);
    slower.resolve(sessionB);
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(shownNames()).toEqual([]);
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

describe('a pending saved load and other actions', () => {
  // Built before each test sets up its scene: session() resets the store
  let pendingSession: MolViewerSession;
  beforeEach(() => {
    pendingSession = session('Old session');
  });

  /** Starts loading saved session 'pending' whose read finishes only when told to. */
  function startSlowSessionLoad() {
    const read = deferred<MolViewerSession | null>();
    storage.loadSessionAsync.mockReturnValueOnce(read.promise);
    const load = useMoleculeStore.getState().loadSavedSession('pending');
    return { load, finish: () => read.resolve(pendingSession), fail: () => read.resolve(null) };
  }

  /** A load from elsewhere (file, fetch, share link), as its loader runs it: token, apply if current, finish. */
  function otherLoad(mode: 'replace' | 'add', apply: () => void) {
    const token = beginSceneLoad(mode);
    return () => {
      applySceneLoad(token, apply);
      finishSceneLoad(token);
    };
  }

  it('a fetch started before it still lands when its read fails', async () => {
    useMoleculeStore.getState().addStructure(molecule('On screen'), 'On screen');
    const fetchDone = otherLoad('add', () => useMoleculeStore.getState().addStructure(molecule('Slow fetch'), 'Slow fetch'));
    const pending = startSlowSessionLoad();
    pending.fail();
    await expect(pending.load).rejects.toThrow('could not be read');
    fetchDone();

    expect(shownNames()).toEqual(['On screen', 'Slow fetch']);
  });

  it('read before an Add started after it finishes, it is loaded and the Add lands on it', async () => {
    const pending = startSlowSessionLoad();
    const fetchDone = otherLoad('add', () => useMoleculeStore.getState().addStructure(molecule('Later fetch'), 'Later fetch'));
    pending.finish();
    await pending.load;
    expect(shownNames()).toEqual(['Old session']);
    fetchDone();

    expect(shownNames()).toEqual(['Old session', 'Later fetch']);
  });

  it('a slow fetch in Replace mode still replaces the scene after a file added meanwhile', () => {
    useMoleculeStore.getState().addStructure(molecule('On screen'), 'On screen');
    const pdbDone = otherLoad('replace', () => useMoleculeStore.getState().setMolecule(molecule('Slow PDB')));
    otherLoad('add', () => useMoleculeStore.getState().addStructure(molecule('Small file'), 'Small file'))();
    expect(shownNames()).toEqual(['On screen', 'Small file']);
    pdbDone();

    expect(shownNames()).toEqual(['Slow PDB']);
  });

  it('a Replace load that fails leaves an earlier Replace load to apply', () => {
    const firstDone = otherLoad('replace', () => useMoleculeStore.getState().setMolecule(molecule('First file')));
    const failing = beginSceneLoad('replace');
    finishSceneLoad(failing);
    firstDone();

    expect(shownNames()).toEqual(['First file']);
  });

  it('a saved molecule, once loaded, overtakes an Add load started before it', async () => {
    const add = beginSceneLoad('add');
    storage.loadMoleculeAsync.mockResolvedValueOnce({ molecule: molecule('Saved molecule'), measurements: [] });
    await useMoleculeStore.getState().loadSavedMolecule('m');
    expect(shownNames()).toEqual(['Saved molecule']);
    expect(isCurrentSceneLoad(add)).toBe(false);
    finishSceneLoad(add);
  });

  it('a file loaded in Replace mode wins over it', async () => {
    const pending = startSlowSessionLoad();
    otherLoad('replace', () => useMoleculeStore.getState().setMolecule(molecule('Dropped file')))();
    pending.finish();
    await expect(pending.load).resolves.toBeNull();

    expect(shownNames()).toEqual(['Dropped file']);
  });

  it('a file added in Add mode meanwhile does not drop it: it then replaces the scene', async () => {
    useMoleculeStore.getState().addStructure(molecule('On screen'), 'On screen');
    const pending = startSlowSessionLoad();
    otherLoad('add', () => useMoleculeStore.getState().addStructure(molecule('Added file'), 'Added file'))();
    expect(shownNames()).toEqual(['On screen', 'Added file']);
    pending.finish();
    await pending.load;

    expect(shownNames()).toEqual(['Old session']);
  });

  it('a share link opened meanwhile wins over it', async () => {
    const pending = startSlowSessionLoad();
    otherLoad('replace', () => useMoleculeStore.getState().loadSession(session('Direct session')))();
    pending.finish();
    await pending.load;

    expect(shownNames()).toEqual(['Direct session']);
  });

  it('a fetch started before it loses to it', async () => {
    const fetchDone = otherLoad('add', () => useMoleculeStore.getState().addStructure(molecule('Slow fetch'), 'Slow fetch'));
    const pending = startSlowSessionLoad();
    pending.finish();
    await pending.load;
    fetchDone();

    expect(shownNames()).toEqual(['Old session']);
  });

  it('deleting it leaves an Add load started after it running', async () => {
    const pending = startSlowSessionLoad();
    const add = beginSceneLoad('add');
    useMoleculeStore.getState().deleteSavedMolecule('pending');
    pending.fail();
    await expect(pending.load).resolves.toBeNull();
    expect(isCurrentSceneLoad(add)).toBe(true);
    finishSceneLoad(add);
  });

  it('does not show the loading spinner, and a failing read leaves none behind', async () => {
    const pending = startSlowSessionLoad();
    expect(useMoleculeStore.getState().isLoading).toBe(false);
    pending.fail();
    await expect(pending.load).rejects.toThrow('could not be read');
    expect(useMoleculeStore.getState().isLoading).toBe(false);
  });

  it('deleting the entry being loaded cancels the load without an error', async () => {
    useMoleculeStore.getState().addStructure(molecule('On screen'), 'On screen');
    const pending = startSlowSessionLoad();
    useMoleculeStore.getState().deleteSavedMolecule('pending');
    pending.fail();

    await expect(pending.load).resolves.toBeNull();
    expect(shownNames()).toEqual(['On screen']);
  });

  it('clearing all entries cancels the load without an error', async () => {
    const pending = startSlowSessionLoad();
    useMoleculeStore.getState().clearAllSavedMolecules();
    pending.fail();

    await expect(pending.load).resolves.toBeNull();
  });

  it('deleting another entry leaves the load running', async () => {
    const pending = startSlowSessionLoad();
    useMoleculeStore.getState().deleteSavedMolecule('some-other-entry');
    pending.finish();
    await pending.load;

    expect(shownNames()).toEqual(['Old session']);
  });
});

describe('scene load tokens', () => {
  const loading = () => useMoleculeStore.getState().isLoading;

  it('lets Add loads coexist and keeps the spinner until both finish', () => {
    const fetch = beginSceneLoad('add');
    const file = beginSceneLoad('add');
    expect([isCurrentSceneLoad(fetch), isCurrentSceneLoad(file)]).toEqual([true, true]);
    expect(loading()).toBe(true);
    finishSceneLoad(file);
    expect(loading()).toBe(true);
    finishSceneLoad(fetch);
    expect(loading()).toBe(false);
  });

  it('an Add load is overtaken only by a later Replace load that applied', () => {
    const add = beginSceneLoad('add');
    const replace = beginSceneLoad('replace');
    expect(isCurrentSceneLoad(add)).toBe(true);
    expect(isCurrentSceneLoad(replace)).toBe(true);
    applySceneLoad(replace, () => {});
    expect(isCurrentSceneLoad(add)).toBe(false);
    const laterAdd = beginSceneLoad('add');
    expect(isCurrentSceneLoad(laterAdd)).toBe(true);
    [add, replace, laterAdd].forEach(finishSceneLoad);
  });

  it('a Replace load is overtaken only by a later Replace load that applied', () => {
    const replace = beginSceneLoad('replace');
    const laterAdd = beginSceneLoad('add');
    const laterReplace = beginSceneLoad('replace');
    applySceneLoad(laterAdd, () => {});
    expect(isCurrentSceneLoad(replace)).toBe(true);
    applySceneLoad(laterReplace, () => {});
    expect(isCurrentSceneLoad(replace)).toBe(false);
    [replace, laterAdd, laterReplace].forEach(finishSceneLoad);
  });

  it('applies nothing and marks nothing after the load finished', () => {
    const add = beginSceneLoad('add');
    const replace = beginSceneLoad('replace');
    finishSceneLoad(replace);
    const apply = vi.fn();
    expect(applySceneLoad(replace, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(isCurrentSceneLoad(add)).toBe(true);
    finishSceneLoad(add);
  });

  it('applySceneLoad: a load that is no longer current is not applied', () => {
    const older = beginSceneLoad('replace');
    const newer = beginSceneLoad('replace');
    expect(applySceneLoad(newer, () => {})).toBe(true);
    const apply = vi.fn();
    expect(applySceneLoad(older, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    [older, newer].forEach(finishSceneLoad);
  });

  it('applySceneLoad: an apply that returns false (a refused add) marks nothing', () => {
    const add = beginSceneLoad('add');
    const replace = beginSceneLoad('replace');
    expect(applySceneLoad(replace, () => false)).toBe(false);
    expect(isCurrentSceneLoad(add)).toBe(true);
    [add, replace].forEach(finishSceneLoad);
  });

  it('applySceneLoad: an apply that throws marks nothing, and the error goes to the caller', () => {
    const add = beginSceneLoad('add');
    const replace = beginSceneLoad('replace');
    expect(() => applySceneLoad(replace, () => { throw new Error('unreadable'); })).toThrow('unreadable');
    expect(isCurrentSceneLoad(add)).toBe(true);
    [add, replace].forEach(finishSceneLoad);
  });

  it('applySceneLoad: a Replace load that applied drops the loads started before it', () => {
    const add = beginSceneLoad('add');
    const replace = beginSceneLoad('replace');
    expect(applySceneLoad(replace, () => {})).toBe(true);
    expect(isCurrentSceneLoad(add)).toBe(false);
    [add, replace].forEach(finishSceneLoad);
  });

  it('counts a load once even when finished twice', () => {
    const a = beginSceneLoad('add');
    const b = beginSceneLoad('add');
    finishSceneLoad(a);
    finishSceneLoad(a);
    expect(loading()).toBe(true);
    finishSceneLoad(b);
    expect(loading()).toBe(false);
  });

  it('a load without the spinner (the tour) never turns it on, nor off for another load', () => {
    const tour = beginSceneLoad('add', { countsAsLoading: false });
    expect(loading()).toBe(false);
    const fetch = beginSceneLoad('add');
    finishSceneLoad(tour);
    expect(loading()).toBe(true);
    finishSceneLoad(fetch);
    expect(loading()).toBe(false);
  });

  it('keeps the spinner through a reset or an error while a load is in flight', () => {
    const fetch = beginSceneLoad('add');
    useMoleculeStore.getState().reset();
    useMoleculeStore.getState().setError('something');
    expect(loading()).toBe(true);
    finishSceneLoad(fetch);
    expect(loading()).toBe(false);
  });
});
