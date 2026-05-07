import { describe, it, expect, beforeEach } from 'vitest';
import { useMoleculeStore, temporalStore } from '../moleculeStore';
import { serializeSession, deserializeSession } from '../../utils/sessionSerializer';
import { SessionVersionError, SCHEMA_VERSION } from '../../types/session';
import type { Molecule } from '../../types';
import type { CameraSnapshot } from '../../types/session';

function createMockMolecule(name: string, atomCount = 3): Molecule {
  const atoms = Array.from({ length: atomCount }, (_, i) => ({
    id: i,
    element: 'C',
    x: i * 1.5,
    y: 0,
    z: 0,
    residueName: 'ALA',
    residueNumber: 1,
    chainId: 'A',
  }));
  return {
    name,
    atoms,
    bonds: atomCount >= 2
      ? [{ atom1Index: 0, atom2Index: 1, order: 1 as const }]
      : [],
  };
}

const SAMPLE_CAMERA: CameraSnapshot = {
  position: [10, 20, 30],
  target: [1, 2, 3],
  zoom: 1.5,
};

describe('session save/load round-trip', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  // Checklist item 1: Round-trip integrity
  it('preserves structures, representation, color scheme, and camera through serialize/deserialize', () => {
    const store = useMoleculeStore.getState();
    const id = store.addStructure(createMockMolecule('1HHO'), '1HHO');
    store.setStructureRepresentation(id, 'cartoon');
    store.setStructureColorScheme(id, 'rainbow');
    store.setSurfaceSettings({ visible: true, opacity: 0.4 });
    store.addLabel(id, 0, 'active site');
    store.setAutoRotate(true);

    const session = store.buildSession('test-1', SAMPLE_CAMERA);

    // Wipe state and reload from session
    store.reset();
    expect(useMoleculeStore.getState().structures.size).toBe(0);

    const camera = useMoleculeStore.getState().loadSession(session);

    const restored = useMoleculeStore.getState();
    expect(restored.structures.size).toBe(1);
    const restoredStructure = restored.structures.get(id);
    expect(restoredStructure?.representation).toBe('cartoon');
    expect(restoredStructure?.colorScheme).toBe('rainbow');
    expect(restored.surfaceSettings.visible).toBe(true);
    expect(restored.surfaceSettings.opacity).toBe(0.4);
    expect(restored.labels).toHaveLength(1);
    expect(restored.labels[0].text).toBe('active site');
    expect(restored.autoRotate).toBe(true);
    expect(camera).toEqual(SAMPLE_CAMERA);
  });

  // Checklist item 2: Multi-structure
  it('preserves multi-structure order, visibility, and layout mode', () => {
    const store = useMoleculeStore.getState();
    const id1 = store.addStructure(createMockMolecule('1HHO'), '1HHO');
    const id2 = store.addStructure(createMockMolecule('4HHB'), '4HHB');
    store.setLayoutMode('side-by-side');
    store.setStructureVisibility(id2, false);

    const session = store.buildSession('test-2', null);
    store.reset();
    store.loadSession(session);

    const restored = useMoleculeStore.getState();
    expect(restored.structureOrder).toEqual([id1, id2]);
    expect(restored.layoutMode).toBe('side-by-side');
    expect(restored.structures.get(id1)?.visible).toBe(true);
    expect(restored.structures.get(id2)?.visible).toBe(false);
    // Side-by-side offsets restored verbatim from session (not recomputed)
    expect(restored.structures.get(id1)?.offset).not.toEqual([0, 0, 0]);
  });

  // Checklist item 4: Schema version guard
  it('throws SessionVersionError on a newer schema version', () => {
    const store = useMoleculeStore.getState();
    store.addStructure(createMockMolecule('A'), 'A');
    const session = store.buildSession('future', null);
    session.schemaVersion = SCHEMA_VERSION + 1;

    expect(() => deserializeSession(session)).toThrow(SessionVersionError);
  });

  // Checklist item 5: Performance — aromatic ring detection skipped on load
  it('forces aromaticRingsDetected=true on load to avoid re-detection', () => {
    const store = useMoleculeStore.getState();
    const id = store.addStructure(createMockMolecule('A'), 'A');
    // Simulate a saved session whose structure has not had detection run
    const session = store.buildSession('perf', null);
    session.state.structures[0].aromaticRingsDetected = false;

    store.reset();
    store.loadSession(session);

    expect(useMoleculeStore.getState().structures.get(id)?.aromaticRingsDetected).toBe(true);
  });

  // Checklist item 6: Undo isolation
  it('does not leave the pre-load state on the undo stack', () => {
    const store = useMoleculeStore.getState();
    // Build a "pre-load" state worth undoing back to
    const oldId = store.addStructure(createMockMolecule('OLD'), 'OLD');
    store.setStructureRepresentation(oldId, 'spacefill');

    // Build a session containing different structures
    const session = (() => {
      const tmp = useMoleculeStore;
      tmp.getState().reset();
      tmp.getState().addStructure(createMockMolecule('NEW'), 'NEW');
      return tmp.getState().buildSession('test-undo', null);
    })();

    // Restore the pre-load state, then load the session
    useMoleculeStore.getState().reset();
    useMoleculeStore.getState().addStructure(createMockMolecule('OLD'), 'OLD');
    temporalStore.getState().clear();
    useMoleculeStore.getState().loadSession(session);

    // After loadSession, the temporal store should have been cleared:
    // there should be no pastStates that would let undo bring back the OLD state.
    expect(temporalStore.getState().pastStates).toHaveLength(0);
  });

  // Round-trip preserves residueFilter (Set ↔ array)
  it('preserves componentSettings.residueFilter Set through serialization', () => {
    const id = useMoleculeStore.getState().addStructure(createMockMolecule('A'), 'A');
    const struct = useMoleculeStore.getState().structures.get(id)!;
    // Inject a componentSettings entry with a Set residueFilter, regardless of
    // what the classifier produced for the trivial mock molecule.
    const filter = new Set(['A:1', 'A:2', 'A:3']);
    useMoleculeStore.getState().setStructureComponentSettings(id, [
      {
        type: 'protein',
        atomIndices: [0, 1, 2],
        representation: 'cartoon',
        colorScheme: 'rainbow',
        visible: true,
        residueFilter: filter,
      },
      ...struct.componentSettings,
    ]);

    const session = serializeSession(
      {
        structures: useMoleculeStore.getState().structures,
        structureOrder: useMoleculeStore.getState().structureOrder,
        activeStructureId: useMoleculeStore.getState().activeStructureId,
        layoutMode: useMoleculeStore.getState().layoutMode,
        measurements: useMoleculeStore.getState().measurements,
        labels: useMoleculeStore.getState().labels,
        surfaceSettings: useMoleculeStore.getState().surfaceSettings,
        autoRotate: useMoleculeStore.getState().autoRotate,
      },
      null,
      'set-test'
    );

    // After JSON round-trip, residueFilter must be an array (Set is not JSON-serializable)
    const json = JSON.parse(JSON.stringify(session));
    expect(Array.isArray(json.state.structures[0].componentSettings[0].residueFilter)).toBe(true);

    // Deserializing must reconstitute the Set
    const restored = deserializeSession(json);
    const restoredFilter = restored.structures.get(id)?.componentSettings[0].residueFilter;
    expect(restoredFilter).toBeInstanceOf(Set);
    expect(restoredFilter?.has('A:2')).toBe(true);
  });
});
