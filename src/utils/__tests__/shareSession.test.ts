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

  it('opens v1 links (with stored atom lists) and refuses a schema it does not know', async () => {
    const v1 = { ...session([{ type: 'rcsb', id: '1CRN' }]), schemaVersion: 1 } as ShareableSession;
    // Built apart: a literal with fields ComponentStyle lacks would not type-check
    const stored = [
      { type: 'protein' as const, atomIndices: [0], residueFilter: ['A:1'], representation: 'stick' as const, colorScheme: 'rainbow' as const, visible: true },
    ];
    v1.structures[0].componentSettings = stored;
    const result = await deserializeShareableSession(v1);
    expect(result.structures[0].shareableStructure.componentSettings[0]).toMatchObject({ representation: 'stick' });

    const v3 = { ...session([{ type: 'rcsb', id: '1CRN' }]), schemaVersion: 3 } as unknown as ShareableSession;
    await expect(deserializeShareableSession(v3)).rejects.toThrow(/Unsupported share schema v3/);
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
    expect(payload.labels[0].atom).toEqual({ chainId: 'A', residueNumber: 1, residueName: 'ALA', name: 'CA', element: 'C' });
    expect(payload.measurements[0].atomRefs[1].atom).toMatchObject({ name: 'C', residueNumber: 1 });
  });

  it('resolves a reference by index when the atom there still matches, else by identity', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    const ca = { chainId: 'A', residueNumber: 1, residueName: 'ALA', name: 'CA' };
    // Same file: the index still points at CA
    expect(resolveSharedAtom(molecule([atom(0, 'N', 1), atom(1, 'CA', 1)]), { atomIndex: 1, atom: ca }, Infinity)).toBe(1);
    // An atom was inserted before it: found by identity
    expect(resolveSharedAtom(molecule([atom(0, 'N', 1), atom(1, 'H', 1), atom(2, 'CA', 1)]), { atomIndex: 1, atom: ca }, Infinity)).toBe(2);
    // Gone
    expect(resolveSharedAtom(molecule([atom(0, 'N', 1)]), { atomIndex: 1, atom: ca }, Infinity)).toBeNull();
  });

  it('uses the index alone for old shares, and drops it when out of range or at the cutoff', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    const m = molecule([atom(0, 'N', 1), atom(1, 'CA', 1)]);
    expect(resolveSharedAtom(m, { atomIndex: 1 }, Infinity)).toBe(1);
    expect(resolveSharedAtom(m, { atomIndex: 5 }, Infinity)).toBeNull();
    expect(resolveSharedAtom(m, { atomIndex: -1 }, Infinity)).toBeNull();
    // In range, but at or past the point where the indices may have shifted
    expect(resolveSharedAtom(m, { atomIndex: 0 }, 1)).toBe(0);
    expect(resolveSharedAtom(m, { atomIndex: 1 }, 1)).toBeNull();
  });

  it('picks the atom at the stored index when two atoms share an identity', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    const twin = { chainId: 'A', residueNumber: 1, residueName: 'ALA', name: 'CA' };
    expect(resolveSharedAtom(molecule([atom(0, 'CA', 1), atom(1, 'CA', 1)]), { atomIndex: 1, atom: twin }, Infinity)).toBe(1);
  });

  it('drops a reference whose identity matches atoms in several chainless segments, and finds the only match', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    // Two segments without chain IDs, both numbered 1-2 (simulation output)
    const segment = (start: number) => [atom(start, 'N', 1, ''), atom(start + 1, 'CA', 1, ''), atom(start + 2, 'CA', 2, '')];
    const ca1 = { residueNumber: 1, residueName: 'ALA', name: 'CA' };
    // The stored index is past the end: the identity alone can't say which segment
    expect(resolveSharedAtom(molecule([...segment(0), ...segment(3)]), { atomIndex: 9, atom: ca1 }, Infinity)).toBeNull();
    expect(resolveSharedAtom(molecule(segment(0)), { atomIndex: 9, atom: ca1 }, Infinity)).toBe(1);
  });
});

describe('share atom identity with alternate locations', () => {
  it('records the altLoc and requires it to match', async () => {
    const { atomIdentity, resolveSharedAtom } = await import('../shareSession');
    const a = { id: 0, element: 'C', name: 'CB', residueName: 'SER', residueNumber: 1, chainId: 'A', altLoc: 'A', x: 0, y: 0, z: 0 };
    const b = { ...a, id: 1, altLoc: 'B' };
    expect(atomIdentity(a)).toMatchObject({ altLoc: 'A' });
    expect(resolveSharedAtom({ name: 'm', atoms: [a, b], bonds: [] }, { atomIndex: 0, atom: atomIdentity(b) }, Infinity)).toBe(1);
  });
});

describe('share atom identity without chain, residue or name (SDF, MOL, XYZ, PubChem)', () => {
  const atom = (id: number, element: string) => ({ id, element, x: id, y: 0, z: 0 });
  const water = { name: 'water', atoms: [atom(0, 'O'), atom(1, 'H'), atom(2, 'H')], bonds: [] };

  it('stores the element', async () => {
    const { atomIdentity } = await import('../shareSession');
    expect(atomIdentity(water.atoms[0])).toMatchObject({ element: 'O' });
  });

  it('resolves only the atom at the stored index, and only when its element matches', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    expect(resolveSharedAtom(water, { atomIndex: 1, atom: { element: 'H' } }, Infinity)).toBe(1);
    // Out of range: never the first atom with that element
    expect(resolveSharedAtom(water, { atomIndex: 5, atom: { element: 'H' } }, Infinity)).toBeNull();
    expect(resolveSharedAtom(water, { atomIndex: 1, atom: { element: 'O' } }, Infinity)).toBeNull();
  });

  it('uses the index of an empty identity (written before identities had an element) when in range', async () => {
    const { resolveSharedAtom } = await import('../shareSession');
    expect(resolveSharedAtom(water, { atomIndex: 2, atom: {} }, Infinity)).toBe(2);
    expect(resolveSharedAtom(water, { atomIndex: 3, atom: {} }, Infinity)).toBeNull();
  });
});

describe('old share references (no identity) after the parser changes', () => {
  const atom = (id: number, altLoc?: string) =>
    ({ id, element: 'C', name: 'CB', residueName: 'SER', residueNumber: id, chainId: 'A', x: id, y: 0, z: 0, ...(altLoc ? { altLoc } : {}) });
  const molecule = (altLocs: Record<number, string>, count = 100) =>
    ({ name: 'm', atoms: Array.from({ length: count }, (_, i) => atom(i, altLocs[i])), bonds: [] });
  const pdb = { type: 'inline' as const, format: 'pdb' as const, data: '' };

  it('keeps PDB indices before the first alternate location and drops the rest', async () => {
    const { legacyIndexCutoff, resolveSharedAtom } = await import('../shareSession');
    const m = molecule({ 50: 'A', 51: 'A' });
    const cutoff = legacyIndexCutoff(m, pdb);
    expect(cutoff).toBe(50);
    expect(resolveSharedAtom(m, { atomIndex: 10 }, cutoff)).toBe(10);
    expect(resolveSharedAtom(m, { atomIndex: 60 }, cutoff)).toBeNull();
  });

  it('keeps every mmCIF index when only A was kept, and cuts off at the first other alternate location', async () => {
    const { legacyIndexCutoff } = await import('../shareSession');
    for (const source of [{ type: 'rcsb' as const, id: '1ABC' }, { type: 'alphafold' as const, id: 'P69905' }, { type: 'inline' as const, format: 'cif' as const, data: '' }]) {
      expect(legacyIndexCutoff(molecule({ 20: 'A', 21: 'A' }), source)).toBe(Infinity);
      // A residue whose only conformer is B: the old parser dropped it
      expect(legacyIndexCutoff(molecule({ 20: 'A', 30: 'B', 31: 'B' }), source)).toBe(30);
    }
  });

  it('drops every XYZ index when the comment line is blank (the old parser read the first atom as the comment)', async () => {
    const { legacyIndexCutoff } = await import('../shareSession');
    const m = molecule({}, 2);
    const xyz = (data: string) => ({ type: 'inline' as const, format: 'xyz' as const, data });
    expect(legacyIndexCutoff(m, xyz('2\n\nC 0 0 0\nC 1.5 0 0\n'))).toBe(0);
    expect(legacyIndexCutoff(m, xyz('\n2\n   \nC 0 0 0\nC 1.5 0 0\n'))).toBe(0);
    expect(legacyIndexCutoff(m, xyz('2\nethane\nC 0 0 0\nC 1.5 0 0\n'))).toBe(Infinity);
  });

  it('keeps every SDF, MOL and PubChem index, and none without a source', async () => {
    const { legacyIndexCutoff, resolveSharedAtom } = await import('../shareSession');
    const m = molecule({});
    expect(legacyIndexCutoff(m, { type: 'inline', format: 'sdf', data: '' })).toBe(Infinity);
    expect(legacyIndexCutoff(m, { type: 'inline', format: 'mol', data: '' })).toBe(Infinity);
    expect(legacyIndexCutoff(m, { type: 'pubchem', cid: 2244 })).toBe(Infinity);
    expect(legacyIndexCutoff(m, undefined)).toBe(0);
    expect(resolveSharedAtom(m, { atomIndex: 3 }, 0)).toBeNull();
  });
});
