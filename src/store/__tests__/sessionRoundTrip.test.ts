import { describe, it, expect, beforeEach } from 'vitest';
import { useMoleculeStore, temporalStore } from '../moleculeStore';
import { serializeSession, deserializeSession } from '../../utils/sessionSerializer';
import { SessionVersionError, SCHEMA_VERSION } from '../../types/session';
import type { Molecule } from '../../types';
import type { CameraSnapshot } from '../../types/session';
import type { Measurement } from '../../utils/measurements';

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

/** Six carbons on a hexagon, ring bonds with the given orders (benzene: 2,1,2,1,2,1). */
function hexagonMolecule(orders: (1 | 2)[]): Molecule {
  return {
    name: 'ring',
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

  // Checklist item 5: stored aromatic rings are dropped and detected again lazily
  it('drops stored aromatic rings on load so they are detected again', () => {
    const store = useMoleculeStore.getState();
    const id = store.addStructure(hexagonMolecule([2, 1, 2, 1, 2, 1]), 'benzene');
    store.detectAromaticRingsIfNeeded(id);
    const session = store.buildSession('rings', null);
    expect(session.state.structures[0].molecule.aromaticRings).toHaveLength(1);

    store.reset();
    store.loadSession(session);

    const loaded = useMoleculeStore.getState().structures.get(id);
    expect(loaded?.aromaticRingsDetected).toBe(false);
    expect(loaded?.molecule.aromaticRings).toBeUndefined();
  });

  it('replaces a stale stored ring list with what detection finds now', () => {
    const store = useMoleculeStore.getState();
    const id = store.addStructure(hexagonMolecule([2, 1, 1, 1, 1, 1]), 'cyclohexene');
    const session = store.buildSession('stale', null);
    // As an older version detected it: one double bond was enough
    session.state.structures[0].molecule.aromaticRings = [
      { atomIndices: [0, 1, 2, 3, 4, 5], center: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 1.39 },
    ];
    session.state.structures[0].aromaticRingsDetected = true;

    store.reset();
    store.loadSession(session);
    useMoleculeStore.getState().detectAromaticRingsIfNeeded(id);

    const loaded = useMoleculeStore.getState().structures.get(id);
    expect(loaded?.aromaticRingsDetected).toBe(true);
    expect(loaded?.molecule.aromaticRings ?? []).toEqual([]);
  });

  it('shows rings for a session saved before detection ran', () => {
    const store = useMoleculeStore.getState();
    const id = store.addStructure(hexagonMolecule([2, 1, 2, 1, 2, 1]), 'benzene');
    const session = store.buildSession('undetected', null);
    expect(session.state.structures[0].molecule.aromaticRings).toBeUndefined();

    store.reset();
    store.loadSession(session);
    useMoleculeStore.getState().detectAromaticRingsIfNeeded(id);

    expect(useMoleculeStore.getState().structures.get(id)?.molecule.aromaticRings).toHaveLength(1);
  });

  it('detects rings for every structure of a session, not only the active one', () => {
    const store = useMoleculeStore.getState();
    const id1 = store.addStructure(hexagonMolecule([2, 1, 2, 1, 2, 1]), 'benzene 1');
    const id2 = store.addStructure(hexagonMolecule([2, 1, 2, 1, 2, 1]), 'benzene 2');
    store.detectAromaticRingsIfNeeded(id1);
    store.detectAromaticRingsIfNeeded(id2);
    const session = store.buildSession('two', null);

    store.reset();
    store.loadSession(session);
    // What Ball & Stick and Stick do for each structure they draw
    useMoleculeStore.getState().detectAromaticRingsIfNeeded(id1);
    useMoleculeStore.getState().detectAromaticRingsIfNeeded(id2);

    const { structures } = useMoleculeStore.getState();
    expect(structures.get(id1)?.molecule.aromaticRings).toHaveLength(1);
    expect(structures.get(id2)?.molecule.aromaticRings).toHaveLength(1);
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

/** Four atoms whose dihedral is -90° (IUPAC sign). */
function createDihedralMolecule(): Molecule {
  const points = [[1, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 1]];
  return {
    name: 'dihedral',
    atoms: points.map(([x, y, z], id) => ({ id, element: 'C', x, y, z })),
    bonds: [
      { atom1Index: 0, atom2Index: 1, order: 1 },
      { atom1Index: 1, atom2Index: 2, order: 1 },
      { atom1Index: 2, atom2Index: 3, order: 1 },
    ],
  };
}

function storedMeasurement(
  id: string,
  type: Measurement['type'],
  structureId: string,
  atomIndices: number[],
  value: number
): Measurement {
  return {
    id,
    type,
    atomIndices,
    atomRefs: atomIndices.map((atomIndex) => ({ structureId, atomIndex })),
    value,
    unit: type === 'distance' ? 'Å' : '°',
  };
}

describe('measurement values when a session loads', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('recomputes dihedrals and leaves distances and unresolvable dihedrals as stored', () => {
    const store = useMoleculeStore.getState();
    const id = store.addStructure(createDihedralMolecule(), 'D');
    // Values as an older version stored them: the dihedral with the old sign,
    // the distance deliberately wrong to show it is not recomputed.
    store.addMeasurement(storedMeasurement('dih', 'dihedral', id, [0, 1, 2, 3], 90));
    store.addMeasurement(storedMeasurement('dist', 'distance', id, [0, 1], 9.99));
    store.addMeasurement(storedMeasurement('lost', 'dihedral', id, [0, 1, 2, 40], 12.5));
    const session = store.buildSession('old', null);

    store.reset();
    store.loadSession(session);

    const values = Object.fromEntries(
      useMoleculeStore.getState().measurements.map((m) => [m.id, m.value])
    );
    expect(values.dih).toBeCloseTo(-90, 6);
    expect(values.dist).toBe(9.99);
    expect(values.lost).toBe(12.5);
  });
});
