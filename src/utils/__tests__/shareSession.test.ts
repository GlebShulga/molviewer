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
