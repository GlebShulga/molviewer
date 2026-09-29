/**
 * Address-bar sync (useUrlSync) together with the startup URL load
 * (useInitialUrlLoad), rendered under StrictMode like the real app.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { useUrlSyncStore, initialUrlSyncState } from '../../store/urlSyncStore';
import { useUrlSync, computeUrlTarget, computeTitle, DEFAULT_TITLE } from '../useUrlSync';
import { useInitialUrlLoad, UNSUPPORTED_URL_PARAM } from '../useInitialUrlLoad';
import type { Molecule, StructureSource } from '../../types';

// ---- mocks: network loaders ------------------------------------------------

type Deferred = { resolve: () => void; reject: (e: Error) => void };
const pending: Deferred[] = [];

function mockMolecule(name: string): Molecule {
  return {
    name,
    atoms: [0, 1, 2].map((i) => ({ id: i, element: 'C', x: i * 1.5, y: 0, z: 0, residueName: 'ALA', residueNumber: 1, chainId: 'A' })),
    bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 as const }],
  };
}

function nameOf(source: StructureSource): string {
  switch (source.type) {
    case 'rcsb':
      return source.id;
    case 'alphafold':
      return `AF-${source.id}`;
    case 'pubchem':
      return `CID ${source.cid}`;
    default:
      return 'inline';
  }
}

vi.mock('../../utils/structureLoader', () => ({
  resolvePubchemCid: vi.fn(async () => 2519),
  loadStructureFromSource: vi.fn(
    (source: StructureSource, signal?: AbortSignal) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        pending.push({
          resolve: () => resolve({ molecule: mockMolecule(nameOf(source)), name: nameOf(source) }),
          reject,
        });
      })
  ),
}));

vi.mock('../../utils/shareSession', () => ({
  loadSharedSession: vi.fn(async () => ({ structures: [] })),
  deserializeShareableSession: vi.fn(
    (_session: unknown, signal?: AbortSignal) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        pending.push({
          resolve: () =>
            resolve({
              structures: ['1CRN', '4HHB'].map((id) => ({
                molecule: mockMolecule(id),
                source: { type: 'rcsb', id },
                shareableStructure: {
                  id: `orig-${id}`,
                  source: { type: 'rcsb', id },
                  name: id,
                  representation: 'cartoon',
                  colorScheme: 'chain',
                  componentSettings: [],
                  visible: true,
                },
              })),
              layoutMode: 'overlay',
              camera: null,
              measurements: [],
              labels: [],
              surfaceSettings: { type: 'vdw', opacity: 0.7, probeRadius: 1.4, wireframe: false, visible: false, color: '#ffffff' },
              autoRotate: false,
              skipped: [],
            }),
          reject,
        });
      })
  ),
}));

// ---- helpers ---------------------------------------------------------------

const history: string[] = [];
const titles: string[] = [];

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** Put the app at `url` as if the page had just been opened there. */
function openAt(url: string, title = 'Server title | MolViewer') {
  window.history.replaceState(null, '', url);
  document.title = title;
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
  useUrlSyncStore.setState(initialUrlSyncState(window.location));
  history.length = 0;
  titles.length = 0;
}

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function mountApp() {
  return renderHook(
    () => {
      useInitialUrlLoad();
      useUrlSync();
    },
    { wrapper }
  );
}

/** Wait until the startup load reaches the (mocked) network, then answer it. */
async function resolveAll() {
  await waitFor(() => expect(pending.length).toBeGreaterThan(0));
  await act(async () => {
    while (pending.length) pending.shift()!.resolve();
    await Promise.resolve();
  });
}

function addStructure(source: StructureSource | undefined, name = source ? nameOf(source) : 'local') {
  let id = '';
  act(() => {
    id = useMoleculeStore.getState().addStructure(mockMolecule(name), name, source);
  });
  return id;
}

let replaceSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  pending.length = 0;
  const original = window.history.replaceState.bind(window.history);
  replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    original(data, unused, url);
    history.push(currentUrl());
    titles.push(document.title);
  });
});

afterEach(() => {
  replaceSpy.mockRestore();
});

// ---- pure rule -------------------------------------------------------------

describe('computeUrlTarget', () => {
  const s = (source: StructureSource | undefined, extra: object = {}) => ({
    name: source ? nameOf(source) : 'local',
    source,
    representation: 'cartoon' as const,
    colorScheme: 'chain' as const,
    ...extra,
  });

  it('points at the first addressable structure', () => {
    expect(
      computeUrlTarget({ pathname: '/', search: '', structures: [s(undefined), s({ type: 'alphafold', id: 'P69905' })], becameEmpty: false })
    ).toEqual({ url: '/af/P69905' });
  });

  it('leaves an empty scene alone unless it was emptied', () => {
    expect(computeUrlTarget({ pathname: '/pdb/ZZZZ', search: '', structures: [], becameEmpty: false })).toBeNull();
    expect(computeUrlTarget({ pathname: '/pdb/1CRN', search: '', structures: [], becameEmpty: true })).toEqual({ url: '/' });
  });

  it('drops unknown query parameters but keeps the path', () => {
    expect(
      computeUrlTarget({ pathname: '/pdb/1CRN', search: '?utm_source=x', structures: [s({ type: 'rcsb', id: '1CRN' })], becameEmpty: false })
    ).toEqual({ url: '/pdb/1CRN' });
  });

  it('treats source types from older versions as having no address', () => {
    const legacy = s({ type: 'url', url: 'https://files.rcsb.org/download/1CRN.pdb' } as unknown as StructureSource);
    expect(computeUrlTarget({ pathname: '/', search: '', structures: [legacy], becameEmpty: false })).toBeNull();
  });
});

describe('computeTitle', () => {
  const rcsb = (id: string) => ({ id: `s-${id}`, name: id, source: { type: 'rcsb', id } as StructureSource });
  const local = { id: 's-local', name: 'my-file', source: undefined };

  it('names the first structure, local files included', () => {
    expect(computeTitle({ first: local, titledId: null, becameEmpty: false, pathname: '/', initialStructurePath: null })).toBe(
      'my-file - MolViewer'
    );
  });

  it('keeps the landing title while its own structure is shown at its own address', () => {
    const input = { first: rcsb('3DNI'), titledId: null, becameEmpty: false, pathname: '/pdb/3DNI', initialStructurePath: '/pdb/3DNI' };
    expect(computeTitle(input)).toBeUndefined();
    // Replacing it with another structure renames the tab.
    expect(computeTitle({ ...input, first: rcsb('4HHB'), titledId: 's-3DNI', pathname: '/pdb/4HHB' })).toBe('4HHB - MolViewer');
  });

  it('changes only when the first structure changes, and resets when the scene is emptied', () => {
    expect(computeTitle({ first: rcsb('1CRN'), titledId: 's-1CRN', becameEmpty: false, pathname: '/', initialStructurePath: null })).toBeUndefined();
    expect(computeTitle({ first: undefined, titledId: 's-1CRN', becameEmpty: true, pathname: '/', initialStructurePath: null })).toBe(DEFAULT_TITLE);
  });
});

// ---- hooks -----------------------------------------------------------------

describe('useUrlSync + useInitialUrlLoad', () => {
  it('single load from the home page', async () => {
    openAt('/');
    mountApp();
    addStructure({ type: 'rcsb', id: '4HHB' });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/4HHB'));
    expect(document.title).toBe('4HHB - MolViewer');
  });

  it('a local file on the home page keeps the address and names the tab', async () => {
    openAt('/', DEFAULT_TITLE);
    mountApp();
    addStructure(undefined, 'my-file');
    await waitFor(() => expect(document.title).toBe('my-file - MolViewer'));
    expect(currentUrl()).toBe('/');
  });

  it('cold load of /pdb/ID never passes through / and keeps the server title', async () => {
    openAt('/pdb/1CRN');
    expect(useUrlSyncStore.getState().initialLoadSettled).toBe(false);
    mountApp();
    // StrictMode aborted the first run and started a second one.
    expect(useUrlSyncStore.getState().initialLoadSettled).toBe(false);
    await resolveAll();
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    expect(useMoleculeStore.getState().structureOrder).toHaveLength(1);
    expect(currentUrl()).toBe('/pdb/1CRN');
    expect(history).not.toContain('/');
    expect(document.title).toBe('Server title | MolViewer');
  });

  it('an aborted run (as in the StrictMode double mount) does not settle the flag', async () => {
    openAt('/pdb/1CRN');
    const first = mountApp();
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    // Unmounting aborts the in-flight load, like StrictMode's first run.
    first.unmount();
    await act(async () => {
      while (pending.length) pending.shift()!.resolve();
      await Promise.resolve();
    });
    expect(useUrlSyncStore.getState().initialLoadSettled).toBe(false);
    expect(useMoleculeStore.getState().structureOrder).toHaveLength(0);
    expect(history).toEqual([]);

    mountApp();
    await resolveAll();
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    expect(currentUrl()).toBe('/pdb/1CRN');
    expect(history).not.toContain('/');
  });

  it('failed load keeps the original address', async () => {
    openAt('/pdb/ZZZZ');
    mountApp();
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    await act(async () => {
      pending.splice(0).forEach((p) => p.reject(new Error('PDB ID "ZZZZ" not found')));
      await Promise.resolve();
    });
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    expect(useMoleculeStore.getState().error).toMatch(/not found/);
    expect(currentUrl()).toBe('/pdb/ZZZZ');
    expect(history).toEqual([]);
  });

  it('unparseable params start settled, and a later user load syncs', async () => {
    openAt('/?pdb=abc');
    expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true);
    mountApp();
    expect(pending).toHaveLength(0);
    addStructure({ type: 'rcsb', id: '1UBQ' });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1UBQ'));
  });

  it('a scene populated before startup settles through the early return', async () => {
    openAt('/pdb/1CRN');
    act(() => {
      useMoleculeStore.getState().addStructure(mockMolecule('4HHB'), '4HHB', { type: 'rcsb', id: '4HHB' });
    });
    mountApp();
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    expect(pending).toHaveLength(0);
    await waitFor(() => expect(currentUrl()).toBe('/pdb/4HHB'));
  });

  it('?pdb= becomes the readable path and keeps repr until the representation changes', async () => {
    openAt('/?pdb=1CRN&repr=cartoon');
    mountApp();
    await resolveAll();
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1CRN?repr=cartoon'));
    expect(document.title).toBe('1CRN - MolViewer');
    act(() => {
      useMoleculeStore.getState().setRepresentation('spacefill');
    });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1CRN'));
  });

  it('Add mode keeps the first structure; removing it moves on; removing the last goes home', async () => {
    openAt('/');
    mountApp();
    const pdb = addStructure({ type: 'rcsb', id: '3DNI' });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/3DNI'));

    addStructure({ type: 'alphafold', id: 'P69905' });
    const local = addStructure(undefined, 'my-file');
    await waitFor(() => expect(useMoleculeStore.getState().structureOrder).toHaveLength(3));
    expect(currentUrl()).toBe('/pdb/3DNI');

    act(() => useMoleculeStore.getState().removeStructure(pdb));
    await waitFor(() => expect(currentUrl()).toBe('/af/P69905'));

    const af = useMoleculeStore.getState().structureOrder.find((id) => id !== local)!;
    act(() => useMoleculeStore.getState().removeStructure(af));
    // Only a local file left: it has no address.
    await waitFor(() => expect(currentUrl()).toBe('/'));

    act(() => useMoleculeStore.getState().removeStructure(local));
    await waitFor(() => expect(useMoleculeStore.getState().structureOrder).toHaveLength(0));
    expect(currentUrl()).toBe('/');
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  it('removing the last structure goes to /', async () => {
    openAt('/');
    mountApp();
    const id = addStructure({ type: 'rcsb', id: '1CRN' });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1CRN'));
    act(() => useMoleculeStore.getState().removeStructure(id));
    await waitFor(() => expect(currentUrl()).toBe('/'));
  });

  it('share restore keeps /s/ until the user loads something new', async () => {
    openAt('/s/TEST12345678');
    expect(useUrlSyncStore.getState().syncEnabled).toBe(false);
    mountApp();
    await act(async () => {
      await Promise.resolve();
    });
    await resolveAll();
    await waitFor(() => expect(useMoleculeStore.getState().structureOrder).toHaveLength(2));
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    expect(currentUrl()).toBe('/s/TEST12345678');
    expect(history).toEqual([]);

    // Replace mode: a new scene.
    act(() => {
      useMoleculeStore.getState().setMolecule(mockMolecule('1UBQ'), { type: 'rcsb', id: '1UBQ' });
    });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1UBQ'));
  });

  it('share restore then Add mode switches to the share\'s first structure (intended)', async () => {
    openAt('/s/TEST12345678');
    mountApp();
    await act(async () => {
      await Promise.resolve();
    });
    await resolveAll();
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    addStructure({ type: 'alphafold', id: 'P69905' });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1CRN'));
  });

  it('embed pages never change their address', async () => {
    openAt('/embed/pdb/4HHB?repr=cartoon');
    mountApp();
    await resolveAll();
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    expect(useMoleculeStore.getState().structureOrder).toHaveLength(1);
    act(() => {
      useMoleculeStore.getState().setRepresentation('spacefill');
    });
    addStructure({ type: 'rcsb', id: '1CRN' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(currentUrl()).toBe('/embed/pdb/4HHB?repr=cartoon');
    expect(history).toEqual([]);
  });
});

describe('text below the viewer (#page-info)', () => {
  function addPageInfo() {
    const el = document.createElement('section');
    el.id = 'page-info';
    document.body.appendChild(el);
    return el;
  }

  it('is hidden once the address leaves the page it describes, even without landing data', async () => {
    const pageInfo = addPageInfo();
    openAt('/compound/cid/12345');
    mountApp();
    await resolveAll();
    await waitFor(() => expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true));
    expect(pageInfo.hidden).toBe(false);
    act(() => {
      useMoleculeStore.getState().setMolecule(mockMolecule('4HHB'), { type: 'rcsb', id: '4HHB' });
    });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/4HHB'));
    expect(pageInfo.hidden).toBe(true);
    pageInfo.remove();
  });

  it('stays visible on the home page', async () => {
    const pageInfo = addPageInfo();
    openAt('/');
    mountApp();
    addStructure({ type: 'rcsb', id: '1CRN' });
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1CRN'));
    expect(pageInfo.hidden).toBe(false);
    pageInfo.remove();
  });
});

describe('trailing slashes', () => {
  it('a landing path with a trailing slash keeps its text and server title', async () => {
    const el = document.createElement('section');
    el.id = 'page-info';
    document.body.appendChild(el);
    openAt('/pdb/1CRN/');
    mountApp();
    await resolveAll();
    await waitFor(() => expect(currentUrl()).toBe('/pdb/1CRN'));
    expect(el.hidden).toBe(false);
    expect(document.title).toBe('Server title | MolViewer');
    el.remove();
  });
});

describe('removed ?url= links', () => {
  it('explain why nothing loaded instead of showing an empty page', async () => {
    openAt('/?url=https%3A%2F%2Fexample.org%2Fx.pdb');
    mountApp();
    await waitFor(() => expect(useMoleculeStore.getState().error).toBe(UNSUPPORTED_URL_PARAM));
    expect(pending).toHaveLength(0);
    expect(useUrlSyncStore.getState().initialLoadSettled).toBe(true);
  });
});
