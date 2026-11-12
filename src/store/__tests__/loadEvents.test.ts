/**
 * Load events of the URL loads (landing, examples) and the Saved panel: who
 * started the load, and exactly one outcome (src/utils/loadTracking.ts).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Molecule } from '../../types';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../utils/track', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/track')>()),
  track,
}));

const storage = vi.hoisted(() => ({ loadMoleculeAsync: vi.fn(), loadSessionAsync: vi.fn() }));
vi.mock('../../utils/moleculeStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/moleculeStorage')>()),
  loadMoleculeAsync: storage.loadMoleculeAsync,
  loadSessionAsync: storage.loadSessionAsync,
}));

const loader = vi.hoisted(() => ({ loadStructureFromSource: vi.fn() }));
vi.mock('../../utils/structureLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/structureLoader')>()),
  loadStructureFromSource: loader.loadStructureFromSource,
}));

const { useMoleculeStore, temporalStore, beginSceneLoad, finishSceneLoad, applySceneLoad, resetSceneLoadsForTests, MAX_STRUCTURES } =
  await import('../moleculeStore');
const { loadStructureFromParams } = await import('../../hooks/useInitialUrlLoad');
const { LoadError } = await import('../../utils/loadErrors');

function molecule(name: string, atomCount = 3): Molecule {
  return {
    name,
    atoms: Array.from({ length: atomCount }, (_, i) => ({ id: i, element: 'C', x: i * 1.5, y: 0, z: 0 })),
    bonds: [],
  };
}

const loadEvents = () =>
  track.mock.calls
    .filter(([n]) => String(n).startsWith('structure_load') || n === 'structure_loaded')
    .map(([n, p]) => [n, (p as { detail?: string }).detail]);
const startedProps = () => track.mock.calls.find(([n]) => n === 'structure_load_started')?.[1];

beforeEach(() => {
  track.mockClear();
  storage.loadMoleculeAsync.mockReset();
  loader.loadStructureFromSource.mockReset();
  resetSceneLoadsForTests();
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
});

async function fromParams(start: { userInitiated: boolean; via?: string }) {
  const token = beginSceneLoad('add');
  try {
    return await loadStructureFromParams({ source: 'rcsb', id: '4HHB' }, new AbortController().signal, token, start);
  } finally {
    finishSceneLoad(token);
  }
}

describe('loadStructureFromParams', () => {
  it('marks the landing auto-load as automatic and an example click as a user load', async () => {
    loader.loadStructureFromSource.mockResolvedValue({ molecule: molecule('4HHB'), name: '4HHB' });
    await fromParams({ userInitiated: false });
    expect(startedProps()).toMatchObject({ source: 'rcsb', user: 0 });
    track.mockClear();
    await fromParams({ userInitiated: true, via: 'welcome_example' });
    expect(track).toHaveBeenCalledWith('structure_loaded', expect.objectContaining({ user: 1, value: 'welcome_example' }));
  });

  it('cancels with reason limit, and reports no load, when the store refuses the structure', async () => {
    const store = useMoleculeStore.getState();
    for (let i = 0; i < MAX_STRUCTURES; i++) store.addStructure(molecule(`m${i}`), `m${i}`);
    loader.loadStructureFromSource.mockResolvedValue({ molecule: molecule('4HHB'), name: '4HHB' });
    const { structId } = await fromParams({ userInitiated: true, via: 'empty_example' });
    expect(structId).toBeNull();
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_cancelled', 'limit'],
    ]);
  });

  it('cancels as superseded when a Replace load applied meanwhile', async () => {
    let finish!: (v: unknown) => void;
    loader.loadStructureFromSource.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const pending = fromParams({ userInitiated: false });
    const replace = beginSceneLoad('replace');
    applySceneLoad(replace, () => {});
    finishSceneLoad(replace);
    finish({ molecule: molecule('4HHB'), name: '4HHB' });
    await pending;
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_cancelled', 'superseded'],
    ]);
  });

  it('reports a failure while adding to the store, and still throws for the caller', async () => {
    loader.loadStructureFromSource.mockResolvedValue({ molecule: molecule('4HHB'), name: '4HHB' });
    const add = vi.spyOn(useMoleculeStore.getState(), 'addStructure').mockImplementation(() => {
      throw new Error('store broke');
    });
    await expect(fromParams({ userInitiated: false })).rejects.toThrow('store broke');
    add.mockRestore();
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_failed', 'other'],
    ]);
  });

  it('reports a failed fetch by class and still throws for the caller', async () => {
    loader.loadStructureFromSource.mockRejectedValue(new LoadError('PDB ID "4HHB" not found', 'not_found'));
    await expect(fromParams({ userInitiated: false })).rejects.toThrow('not found');
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_failed', 'not_found'],
    ]);
  });
});

describe('Saved panel loads', () => {
  it('count as user loads with source saved', async () => {
    storage.loadMoleculeAsync.mockResolvedValue({ molecule: molecule('saved', 5), measurements: [] });
    await useMoleculeStore.getState().loadSavedMolecule('entry-1');
    expect(startedProps()).toMatchObject({ source: 'saved', user: 1 });
    expect(track).toHaveBeenCalledWith('structure_loaded', expect.objectContaining({ source: 'saved', atoms: 5 }));
  });

  it('report an unreadable entry as not found', async () => {
    storage.loadMoleculeAsync.mockResolvedValue(null);
    await expect(useMoleculeStore.getState().loadSavedMolecule('entry-1')).rejects.toThrow();
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_failed', 'not_found'],
    ]);
  });
});
