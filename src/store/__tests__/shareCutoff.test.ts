/**
 * Opening a share works out where a structure's old (identity-less) atom
 * indices stop being trustworthy (legacyIndexCutoff) only when a reference
 * needs it: references with an identity ignore it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Molecule } from '../../types';
import type { ShareableStructure, SharedLabel } from '../../utils/shareSession';

// The store calls legacyIndexCutoff across modules: a spy on the export
// can't see that, so the module is mocked with the real function wrapped
vi.mock('../../utils/shareSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/shareSession')>();
  return { ...actual, legacyIndexCutoff: vi.fn(actual.legacyIndexCutoff) };
});

const { legacyIndexCutoff } = await import('../../utils/shareSession');
const { useMoleculeStore, temporalStore } = await import('../moleculeStore');

const SOURCE = { type: 'rcsb' as const, id: '1ABC' };

function protein(): Molecule {
  const atoms = (['N', 'CA', 'C'] as const).map((name, i) => ({
    id: i, name, element: name === 'N' ? 'N' : 'C', residueName: 'ALA', residueNumber: 1, chainId: 'A', x: i * 1.5, y: 0, z: 0,
  }));
  return { name: '1ABC', atoms, bonds: [] };
}

function openShare(labels: SharedLabel[]) {
  const shared: ShareableStructure = {
    id: 'orig',
    source: SOURCE,
    name: '1ABC',
    representation: 'cartoon',
    colorScheme: 'secondaryStructure',
    visible: true,
    componentSettings: [],
  };
  return useMoleculeStore.getState().applyShareableSession({
    structures: [{ molecule: protein(), source: SOURCE, shareableStructure: shared }],
    skipped: [],
    layoutMode: 'overlay',
    camera: null,
    measurements: [],
    labels,
    surfaceSettings: { type: 'vdw', opacity: 0.7, probeRadius: 1.4, wireframe: false, visible: false, color: '#ffffff' },
    autoRotate: false,
    sourceStructures: [shared],
  });
}

const ca = { chainId: 'A', residueNumber: 1, residueName: 'ALA', name: 'CA', element: 'C' };

beforeEach(() => {
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
  vi.mocked(legacyIndexCutoff).mockClear();
});

describe('legacyIndexCutoff when a share opens', () => {
  it('is not worked out when every reference has an identity', () => {
    openShare([
      { id: 'l1', structureId: 'orig', atomIndex: 1, text: 'CA', atom: ca },
      { id: 'l2', structureId: 'orig', atomIndex: 0, text: 'N', atom: { ...ca, name: 'N', element: 'N' } },
    ]);
    expect(useMoleculeStore.getState().labels).toHaveLength(2);
    expect(legacyIndexCutoff).not.toHaveBeenCalled();
  });

  it('is worked out once for a structure whose references lack identities', () => {
    openShare([
      { id: 'l1', structureId: 'orig', atomIndex: 1, text: 'CA' },
      { id: 'l2', structureId: 'orig', atomIndex: 0, text: 'N' },
      { id: 'l3', structureId: 'orig', atomIndex: 2, text: 'C', atom: { ...ca, name: 'C' } },
    ]);
    expect(useMoleculeStore.getState().labels).toHaveLength(3);
    expect(legacyIndexCutoff).toHaveBeenCalledTimes(1);
  });
});
