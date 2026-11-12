import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore, beginSceneLoad, finishSceneLoad, applySceneLoad } from '../../../store/moleculeStore';
import { useOnboarding } from '../useOnboarding';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/track', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/track')>()),
  track,
  entryKind: () => 'home',
}));

const loadEvents = () =>
  track.mock.calls
    .filter(([n]) => String(n).startsWith('structure_load') || n === 'structure_loaded')
    .map(([n, p]) => [n, (p as { detail?: string }).detail]);

const STORAGE_KEY = 'mol3d-onboarding-completed';

beforeEach(() => {
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
  localStorage.clear();
  track.mockClear();
});

describe('completeWithExample', () => {
  it('ends onboarding, so the welcome screen does not come back on the next visit', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.phase).toBe('welcome');

    act(() => result.current.completeWithExample());

    expect(result.current.phase).toBe('completed');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    // A fresh mount is what the next visit sees.
    expect(renderHook(() => useOnboarding()).result.current.phase).toBe('idle');
  });

  it('stays finished when the viewer is emptied again', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.completeWithExample());

    act(() => useMoleculeStore.getState().reset());

    expect(result.current.phase).toBe('completed');
  });

  it('reports the example as its own way through onboarding', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.completeWithExample());

    expect(track).toHaveBeenCalledWith('onboarding_completed', { value: 'example' });
  });
});

describe('startTour', () => {
  /** fetch stub whose 1CRN download finishes when told to (with a server error when `fails`). */
  function slowFetch({ fails = false }: { fails?: boolean } = {}) {
    let release!: () => void;
    const done = new Promise<void>((r) => (release = r));
    vi.stubGlobal('fetch', vi.fn(async () => {
      await done;
      if (fails) return new Response('', { status: 503 });
      return new Response('data_1CRN\nloop_\n_atom_site.group_PDB\n_atom_site.id\n_atom_site.type_symbol\n_atom_site.label_atom_id\n_atom_site.label_comp_id\n_atom_site.Cartn_x\n_atom_site.Cartn_y\n_atom_site.Cartn_z\nATOM 1 C CA ALA 0 0 0\n#\n');
    }));
    return release;
  }

  it('a failed download overtaken by an applied Replace load ends onboarding without an error', async () => {
    const release = slowFetch({ fails: true });
    const { result } = renderHook(() => useOnboarding());
    let tour!: Promise<void>;
    act(() => { tour = result.current.startTour() as unknown as Promise<void>; });
    const replace = beginSceneLoad('replace');
    applySceneLoad(replace, () => {});
    await act(async () => { release(); await tour; });
    finishSceneLoad(replace);
    expect(result.current.phase).toBe('completed');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(useMoleculeStore.getState().error).toBeNull();
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_cancelled', 'superseded'],
    ]);
    vi.unstubAllGlobals();
  });

  it('a failed download still reports its error when nothing overtook it', async () => {
    const release = slowFetch({ fails: true });
    const { result } = renderHook(() => useOnboarding());
    let tour!: Promise<void>;
    act(() => { tour = result.current.startTour() as unknown as Promise<void>; });
    await act(async () => { release(); await tour; });
    expect(result.current.phase).toBe('completed');
    expect(useMoleculeStore.getState().error).toBe('Failed to fetch 1CRN');
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_failed', 'network'],
    ]);
    vi.unstubAllGlobals();
  });

  it('reports the tour\'s demo as a sample a person started', async () => {
    const release = slowFetch();
    const { result } = renderHook(() => useOnboarding());
    let tour!: Promise<void>;
    act(() => { tour = result.current.startTour() as unknown as Promise<void>; });
    await act(async () => { release(); await tour; });
    expect(track).toHaveBeenCalledWith(
      'structure_loaded',
      expect.objectContaining({ source: 'sample', value: 'onboarding', user: 1, atoms: 1 })
    );
    vi.unstubAllGlobals();
  });

  it('does not turn the loading spinner on (the welcome screen shows its own)', async () => {
    const release = slowFetch();
    const { result } = renderHook(() => useOnboarding());
    let tour!: Promise<void>;
    act(() => { tour = result.current.startTour() as unknown as Promise<void>; });
    expect(result.current.phase).toBe('loading');
    expect(useMoleculeStore.getState().isLoading).toBe(false);
    await act(async () => { release(); await tour; });
    expect(result.current.phase).toBe('touring');
    vi.unstubAllGlobals();
  });

  it('ends onboarding when an applied Replace load overtakes it, instead of staying on "Loading"', async () => {
    const release = slowFetch();
    const { result } = renderHook(() => useOnboarding());
    let tour!: Promise<void>;
    act(() => { tour = result.current.startTour() as unknown as Promise<void>; });
    const replace = beginSceneLoad('replace');
    applySceneLoad(replace, () => {});
    await act(async () => { release(); await tour; });
    finishSceneLoad(replace);
    expect(result.current.phase).toBe('completed');
    expect(useMoleculeStore.getState().structureOrder).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('goes on with the tour when a Replace load started meanwhile applied nothing', async () => {
    const release = slowFetch();
    const { result } = renderHook(() => useOnboarding());
    let tour!: Promise<void>;
    act(() => { tour = result.current.startTour() as unknown as Promise<void>; });
    const replace = beginSceneLoad('replace');
    await act(async () => { release(); await tour; });
    finishSceneLoad(replace);
    expect(result.current.phase).toBe('touring');
    expect(useMoleculeStore.getState().structureOrder).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
