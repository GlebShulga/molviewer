import { describe, it, expect, vi } from 'vitest';
import type { StructureSource } from '../../types';

vi.mock('../structureLoader', () => ({
  loadStructureFromSource: vi.fn(async (source: StructureSource) => {
    if (source.type !== 'rcsb') throw new Error(`This structure's source (${source.type}) is no longer supported`);
    return {
      molecule: { name: source.id, atoms: [{ id: 0, element: 'C', x: 0, y: 0, z: 0 }], bonds: [] },
      name: source.id,
    };
  }),
}));

import { deserializeShareableSession, SHARE_SCHEMA_VERSION, type ShareableSession } from '../shareSession';

function session(sources: unknown[]): ShareableSession {
  return {
    schemaVersion: SHARE_SCHEMA_VERSION,
    structures: sources.map((source, i) => ({
      id: `s${i}`,
      source: source as StructureSource,
      name: `S${i}`,
      representation: 'cartoon',
      colorScheme: 'chain',
      componentSettings: [],
      visible: true,
    })),
    layoutMode: 'overlay',
    camera: null,
    measurements: [],
    labels: [],
    surfaceSettings: { type: 'vdw', opacity: 0.7, probeRadius: 1.4, wireframe: false, visible: false, color: '#ffffff' },
    autoRotate: false,
  };
}

describe('deserializeShareableSession', () => {
  it('restores the structures it can and reports the ones it skipped', async () => {
    const result = await deserializeShareableSession(
      session([{ type: 'rcsb', id: '1CRN' }, { type: 'url', url: 'https://example.org/x.pdb' }, { type: 'rcsb', id: '4HHB' }])
    );
    expect(result.structures.map((s) => s.shareableStructure.id)).toEqual(['s0', 's2']);
    expect(result.skipped).toEqual(['S1']);
  });

  it('fails only when nothing can be restored', async () => {
    await expect(deserializeShareableSession(session([{ type: 'url', url: 'https://example.org/x.pdb' }]))).rejects.toThrow(
      /no longer supported/
    );
  });
});

describe('share atom identity', () => {
  const atom = (id: number, name: string, residueNumber: number, chainId = 'A') =>
    ({ id, element: 'C', name, residueName: 'ALA', residueNumber, chainId, x: id, y: 0, z: 0 });
  const molecule = (atoms: ReturnType<typeof atom>[]) => ({ name: 'm', atoms, bonds: [] });

  it('stores each referenced atom\'s identity next to its index', async () => {
    const { serializeShareableSession } = await import('../shareSession');
    const mol = molecule([atom(0, 'N', 1), atom(1, 'CA', 1), atom(2, 'C', 1)]);
    const structures = new Map([['s1', { id: 's1', name: 'm', molecule: mol, source: { type: 'rcsb', id: '1ABC' }, visible: true, representation: 'cartoon', colorScheme: 'chain', componentSettings: [] }]]);
    const payload = serializeShareableSession(
      {
        structureOrder: ['s1'],
        structures: structures as never,
        layoutMode: 'overlay',
        measurements: [{ id: 'm1', type: 'distance', atomIndices: [0, 2], atomRefs: [{ structureId: 's1', atomIndex: 0 }, { structureId: 's1', atomIndex: 2 }], value: 2, unit: 'Å' }],
        labels: [{ id: 'l1', structureId: 's1', atomIndex: 1, text: 'CA' }],
        surfaceSettings: { type: 'vdw', opacity: 0.7, probeRadius: 1.4, wireframe: false, visible: false, color: '#ffffff' },
        autoRotate: false,
      },
      null
    );
    expect(payload.labels[0].atom).toEqual({ chainId: 'A', residueNumber: 1, residueName: 'ALA', name: 'CA' });
    expect(payload.measurements[0].atomRefs[1].atom).toMatchObject({ name: 'C', residueNumber: 1 });
  });

  it('resolves a reference by index when the atom there still matches, else by identity', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    const ca = { chainId: 'A', residueNumber: 1, residueName: 'ALA', name: 'CA' };
    // Same file: the index still points at CA
    expect(resolveSharedAtom(molecule([atom(0, 'N', 1), atom(1, 'CA', 1)]), { atomIndex: 1, atom: ca })).toBe(1);
    // An atom was inserted before it: found by identity
    expect(resolveSharedAtom(molecule([atom(0, 'N', 1), atom(1, 'H', 1), atom(2, 'CA', 1)]), { atomIndex: 1, atom: ca })).toBe(2);
    // Gone
    expect(resolveSharedAtom(molecule([atom(0, 'N', 1)]), { atomIndex: 1, atom: ca })).toBeNull();
  });

  it('uses the index alone for old shares, and drops it when out of range', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    const m = molecule([atom(0, 'N', 1), atom(1, 'CA', 1)]);
    expect(resolveSharedAtom(m, { atomIndex: 1 })).toBe(1);
    expect(resolveSharedAtom(m, { atomIndex: 5 })).toBeNull();
    expect(resolveSharedAtom(m, { atomIndex: -1 })).toBeNull();
  });

  it('picks the atom at the stored index when two atoms share an identity', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    const twin = { chainId: 'A', residueNumber: 1, residueName: 'ALA', name: 'CA' };
    expect(resolveSharedAtom(molecule([atom(0, 'CA', 1), atom(1, 'CA', 1)]), { atomIndex: 1, atom: twin })).toBe(1);
  });
});
