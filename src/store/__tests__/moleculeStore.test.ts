import { describe, it, expect, beforeEach } from 'vitest';
import { useMoleculeStore, temporalStore } from '../moleculeStore';
import type { Molecule } from '../../types';
import type { Structure } from '../../types/multiStructure';
import type { Measurement } from '../../utils/measurements';
import { loadMolecule, saveMolecule } from '../../utils/moleculeStorage';

function createMockMolecule(name = 'Test', atomCount = 3): Molecule {
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

/** A protein residue plus a ligand: classified as multi-component (smart defaults). */
function createProteinWithLigand(): Molecule {
  const atom = (id: number, name: string, element: string, residueName: string, residueNumber: number) => ({
    id, name, element, x: id * 1.5, y: 0, z: 0, residueName, residueNumber, chainId: 'A',
  });
  return {
    name: '4HHB',
    atoms: [
      atom(0, 'N', 'N', 'ALA', 1),
      atom(1, 'CA', 'C', 'ALA', 1),
      atom(2, 'C', 'C', 'ALA', 1),
      atom(3, 'O', 'O', 'ALA', 1),
      atom(4, 'FE', 'Fe', 'HEM', 2),
      atom(5, 'C1', 'C', 'HEM', 2),
    ],
    bonds: [],
  };
}

describe('moleculeStore', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    // Clear undo history
    temporalStore.getState().clear();
  });

  describe('setStructureRepresentation with components', () => {
    it('restyles the polymer components, keeps ligands, and restores cartoon', () => {
      const store = () => useMoleculeStore.getState();
      const id = store().addStructure(createProteinWithLigand(), '4HHB');
      const components = () => store().structures.get(id)!.componentSettings;
      const repOf = (type: string) => components().find((c) => c.type === type)?.representation;
      expect(store().structures.get(id)!.classification?.hasMultipleTypes).toBe(true);
      const ligandBefore = repOf('ligand');

      store().setStructureRepresentation(id, 'stick');
      expect(repOf('protein')).toBe('stick');
      expect(repOf('ligand')).toBe(ligandBefore);

      store().setStructureRepresentation(id, 'surface-vdw');
      expect(repOf('protein')).toBe('stick');

      store().setStructureRepresentation(id, 'cartoon');
      expect(repOf('protein')).toBe('cartoon');
    });
  });

  describe('addStructure', () => {
    it('adds a structure and sets it as active', () => {
      const mol = createMockMolecule('Protein A');
      const id = useMoleculeStore.getState().addStructure(mol, 'Protein A');

      const state = useMoleculeStore.getState();
      expect(id).toBeTruthy();
      expect(state.activeStructureId).toBe(id);
      expect(state.structureOrder).toContain(id);
      expect(state.structures.get(id)?.name).toBe('Protein A');
    });

    it('supports multiple structures', () => {
      const id1 = useMoleculeStore.getState().addStructure(createMockMolecule('A'), 'A');
      const id2 = useMoleculeStore.getState().addStructure(createMockMolecule('B'), 'B');

      const state = useMoleculeStore.getState();
      expect(state.structures.size).toBe(2);
      expect(state.structureOrder).toEqual([id1, id2]);
    });
  });

  describe('removeStructure', () => {
    it('removes a structure and updates active', () => {
      const id1 = useMoleculeStore.getState().addStructure(createMockMolecule('A'), 'A');
      const id2 = useMoleculeStore.getState().addStructure(createMockMolecule('B'), 'B');

      useMoleculeStore.getState().removeStructure(id2);

      const state = useMoleculeStore.getState();
      expect(state.structures.size).toBe(1);
      expect(state.structureOrder).toEqual([id1]);
    });

    it('clears activeStructureId when last structure removed', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule(), 'A');
      useMoleculeStore.getState().removeStructure(id);

      expect(useMoleculeStore.getState().activeStructureId).toBeNull();
      expect(useMoleculeStore.getState().structures.size).toBe(0);
    });

    it('cleans up labels associated with removed structure', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule(), 'A');
      useMoleculeStore.getState().addLabel(id, 0, 'Test Label');

      expect(useMoleculeStore.getState().labels.length).toBe(1);

      useMoleculeStore.getState().removeStructure(id);
      expect(useMoleculeStore.getState().labels.length).toBe(0);
    });
  });

  describe('measurements', () => {
    it('adds and removes measurements', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule('A', 5), 'A');

      useMoleculeStore.getState().addMeasurement({
        id: 'meas-1',
        type: 'distance',
        atomIndices: [0, 1],
        atomRefs: [
          { structureId: id, atomIndex: 0 },
          { structureId: id, atomIndex: 1 },
        ],
        value: 1.5,
        unit: '\u00C5',
      });

      expect(useMoleculeStore.getState().measurements.length).toBe(1);

      useMoleculeStore.getState().removeMeasurement('meas-1');
      expect(useMoleculeStore.getState().measurements.length).toBe(0);
    });

    it('clears all measurements', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule('A', 5), 'A');

      useMoleculeStore.getState().addMeasurement({
        id: 'meas-1',
        type: 'distance',
        atomIndices: [0, 1],
        atomRefs: [
          { structureId: id, atomIndex: 0 },
          { structureId: id, atomIndex: 1 },
        ],
        value: 1.5,
        unit: '\u00C5',
      });
      useMoleculeStore.getState().addMeasurement({
        id: 'meas-2',
        type: 'distance',
        atomIndices: [1, 2],
        atomRefs: [
          { structureId: id, atomIndex: 1 },
          { structureId: id, atomIndex: 2 },
        ],
        value: 1.5,
        unit: '\u00C5',
      });

      expect(useMoleculeStore.getState().measurements.length).toBe(2);

      useMoleculeStore.getState().clearMeasurements();
      expect(useMoleculeStore.getState().measurements.length).toBe(0);
    });
  });

  describe('labels', () => {
    it('adds and removes labels', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule(), 'A');

      useMoleculeStore.getState().addLabel(id, 0, 'Carbon #1');
      const labels = useMoleculeStore.getState().labels;
      expect(labels.length).toBe(1);
      expect(labels[0].text).toBe('Carbon #1');
      expect(labels[0].structureId).toBe(id);

      useMoleculeStore.getState().removeLabel(labels[0].id);
      expect(useMoleculeStore.getState().labels.length).toBe(0);
    });

    it('clears all labels', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule(), 'A');
      useMoleculeStore.getState().addLabel(id, 0, 'Label 1');
      useMoleculeStore.getState().addLabel(id, 1, 'Label 2');

      expect(useMoleculeStore.getState().labels.length).toBe(2);

      useMoleculeStore.getState().clearLabels();
      expect(useMoleculeStore.getState().labels.length).toBe(0);
    });
  });

  describe('undo/redo', () => {
    it('undoes and redoes addStructure', () => {
      useMoleculeStore.getState().addStructure(createMockMolecule(), 'A');
      expect(useMoleculeStore.getState().structures.size).toBe(1);

      temporalStore.getState().undo();
      expect(useMoleculeStore.getState().structures.size).toBe(0);

      temporalStore.getState().redo();
      expect(useMoleculeStore.getState().structures.size).toBe(1);
    });

    it('undoes label addition', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule(), 'A');
      useMoleculeStore.getState().addLabel(id, 0, 'Test');

      expect(useMoleculeStore.getState().labels.length).toBe(1);

      temporalStore.getState().undo();
      expect(useMoleculeStore.getState().labels.length).toBe(0);
    });

    describe('steps', () => {
      const store = () => useMoleculeStore.getState();
      const steps = () => temporalStore.getState().pastStates.length;

      /** Write one structure through setState, as an action would (zundo wraps setState too). */
      function replaceStructure(id: string, update: (s: Structure) => Structure) {
        const structures = new Map(store().structures);
        structures.set(id, update(structures.get(id)!));
        useMoleculeStore.setState({ structures });
      }

      it('adds one step per representation, colour scheme, visibility and component change', () => {
        const id = store().addStructure(createMockMolecule(), 'A');
        const structure = () => store().structures.get(id)!;
        let before = steps();

        const rep = structure().representation === 'stick' ? 'spacefill' : 'stick';
        store().setStructureRepresentation(id, rep);
        expect(steps()).toBe(before + 1);
        before = steps();

        const scheme = structure().colorScheme === 'chain' ? 'cpk' : 'chain';
        store().setStructureColorScheme(id, scheme);
        expect(steps()).toBe(before + 1);
        before = steps();

        store().setStructureVisibility(id, false);
        expect(steps()).toBe(before + 1);
        before = steps();

        const component = structure().componentSettings[0];
        store().updateStructureComponentSetting(id, component.type, { visible: !component.visible });
        expect(steps()).toBe(before + 1);
        before = steps();

        store().updateStructureComponentSetting(id, component.type, { representation: 'spacefill' });
        expect(steps()).toBe(before + 1);
      });

      it('adds no step for a repeat of the same value', () => {
        const id = store().addStructure(createMockMolecule(), 'A');
        store().setStructureRepresentation(id, 'stick');
        const before = steps();
        store().setStructureRepresentation(id, 'stick');
        store().setStructureVisibility(id, store().structures.get(id)!.visible);
        expect(steps()).toBe(before);
      });

      it('adds no step when only componentSettings atomIndices change', () => {
        const id = store().addStructure(createMockMolecule(), 'A');
        const before = steps();
        replaceStructure(id, (s) => ({
          ...s,
          componentSettings: s.componentSettings.map((cs) => ({ ...cs, atomIndices: [2, 1, 0, 99] })),
        }));
        expect(store().structures.get(id)!.componentSettings[0].atomIndices).toEqual([2, 1, 0, 99]);
        expect(steps()).toBe(before);
      });

      it('leaves an uploaded file text out of the comparison', () => {
        const source = { type: 'inline' as const, format: 'pdb' as const, data: 'ATOM  '.repeat(200_000) };
        const id = store().addStructure(createMockMolecule(), 'A', source);
        let before = steps();

        replaceStructure(id, (s) => ({ ...s, source: { ...source, data: 'HETATM'.repeat(200_000) } }));
        expect(steps()).toBe(before);

        const rep = store().structures.get(id)!.representation === 'stick' ? 'spacefill' : 'stick';
        store().setStructureRepresentation(id, rep);
        expect(steps()).toBe(before + 1);
        before = steps();

        // A transient write (hover) still adds nothing
        store().setHoveredAtom(null, null, null, null);
        expect(steps()).toBe(before);
      });
    });
  });
});

describe('applyShareableSession with skipped structures', () => {
  it('drops measurements that reference a structure that was not restored', () => {
    const kept = {
      id: 'orig-a',
      source: { type: 'rcsb' as const, id: '1CRN' },
      name: '1CRN',
      representation: 'cartoon' as const,
      colorScheme: 'chain' as const,
      componentSettings: [],
      visible: true,
    };
    const measurement = (id: string, structureId: string) => ({
      id,
      type: 'distance' as const,
      atomRefs: [
        { structureId, atomIndex: 0 },
        { structureId, atomIndex: 1 },
      ],
      atomIndices: [0, 1],
      value: 1.5,
      label: '1.5',
    });
    useMoleculeStore.getState().applyShareableSession({
      structures: [{ molecule: createMockMolecule('1CRN'), source: kept.source, shareableStructure: kept }],
      skipped: ['Missing'],
      layoutMode: 'overlay',
      camera: null,
      measurements: [measurement('m1', 'orig-a'), measurement('m2', 'orig-missing')] as never,
      labels: [],
      surfaceSettings: { type: 'vdw', opacity: 0.7, probeRadius: 1.4, wireframe: false, visible: false, color: '#ffffff' },
      autoRotate: false,
      sourceStructures: [kept],
    });
    const state = useMoleculeStore.getState();
    expect(state.measurements.map((m) => m.id)).toEqual(['m1']);
    expect(state.structures.has(state.measurements[0].atomRefs[0].structureId)).toBe(true);
  });
});

describe('loadSavedMolecule', () => {
  beforeEach(() => {
    localStorage.clear();
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  const savedMeasurement = (id: string, refs: [string, number][]): Measurement => ({
    id,
    type: 'distance',
    atomIndices: refs.map(([, atomIndex]) => atomIndex),
    atomRefs: refs.map(([structureId, atomIndex]) => ({ structureId, atomIndex })),
    value: 1.5,
    unit: 'Å',
  });

  it('points saved measurements at the loaded structure, not the structure they were saved from', async () => {
    const entry = saveMolecule(createMockMolecule('Saved', 4), [
      savedMeasurement('m1', [['old-id', 0], ['old-id', 1]]),
    ]);

    await useMoleculeStore.getState().loadSavedMolecule(entry.id);

    const state = useMoleculeStore.getState();
    expect(state.measurements).toHaveLength(1);
    expect(state.measurements[0].atomRefs).toEqual([
      { structureId: state.activeStructureId, atomIndex: 0 },
      { structureId: state.activeStructureId, atomIndex: 1 },
    ]);
  });

  it('migrates measurements saved with atom indices only', async () => {
    const legacy = { ...savedMeasurement('m1', [['', 1], ['', 2]]), atomRefs: undefined };
    const entry = saveMolecule(createMockMolecule('Saved', 4), [legacy as unknown as Measurement]);

    await useMoleculeStore.getState().loadSavedMolecule(entry.id);

    const state = useMoleculeStore.getState();
    expect(state.measurements[0].atomRefs).toEqual([
      { structureId: state.activeStructureId, atomIndex: 1 },
      { structureId: state.activeStructureId, atomIndex: 2 },
    ]);
  });

  it('drops measurements that spanned several structures, since only one was saved', async () => {
    const entry = saveMolecule(createMockMolecule('Saved', 4), [
      savedMeasurement('same', [['a', 0], ['a', 1]]),
      savedMeasurement('cross', [['a', 0], ['b', 1]]),
    ]);

    await useMoleculeStore.getState().loadSavedMolecule(entry.id);

    expect(useMoleculeStore.getState().measurements.map((m) => m.id)).toEqual(['same']);
  });

  it('drops stored aromatic rings so they are detected again', async () => {
    const stale = {
      ...createMockMolecule('Saved', 4),
      aromaticRings: [{ atomIndices: [0, 1, 2, 3], center: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 1 }],
    };
    const entry = saveMolecule(stale);

    await useMoleculeStore.getState().loadSavedMolecule(entry.id);

    const { structures, activeStructureId } = useMoleculeStore.getState();
    const loaded = structures.get(activeStructureId!);
    expect(loaded?.aromaticRingsDetected).toBe(false);
    expect(loaded?.molecule.aromaticRings).toBeUndefined();
  });

  it('recomputes a dihedral stored with the old sign and keeps matching distances', async () => {
    const entry = saveMolecule(createDihedralMolecule(), [
      { ...savedMeasurement('dih', [['old-id', 0], ['old-id', 1], ['old-id', 2], ['old-id', 3]]), type: 'dihedral', value: 90, unit: '°' },
      { ...savedMeasurement('dist', [['old-id', 0], ['old-id', 1]]), value: 1 },
    ]);

    await useMoleculeStore.getState().loadSavedMolecule(entry.id);

    const values = Object.fromEntries(useMoleculeStore.getState().measurements.map((m) => [m.id, m.value]));
    expect(values.dih).toBeCloseTo(-90, 6);
    expect(values.dist).toBe(1);
  });

  it('drops measurements taken on another structure, whose values do not match these atoms', async () => {
    // Older saves kept every measurement in the scene, not only the saved structure's.
    // Atoms 0 and 1 of the saved molecule are 1.5 Å apart; 'other' was measured elsewhere.
    const entry = saveMolecule(createMockMolecule('Saved', 4), [
      savedMeasurement('own', [['a', 0], ['a', 1]]),
      { ...savedMeasurement('other', [['b', 0], ['b', 1]]), value: 2.4 },
    ]);

    await useMoleculeStore.getState().loadSavedMolecule(entry.id);

    expect(useMoleculeStore.getState().measurements.map((m) => m.id)).toEqual(['own']);
  });
});

describe('saveMoleculeToStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it("saves only the active structure's measurements", () => {
    const store = useMoleculeStore.getState();
    const a = store.addStructure(createMockMolecule('A', 4), 'A');
    const b = store.addStructure(createMockMolecule('B', 4), 'B');
    const distance = (id: string, refs: [string, number][]): Measurement => ({
      id,
      type: 'distance',
      atomIndices: refs.map(([, i]) => i),
      atomRefs: refs.map(([structureId, atomIndex]) => ({ structureId, atomIndex })),
      value: 1.5,
      unit: 'Å',
    });
    store.addMeasurement(distance('on-a', [[a, 0], [a, 1]]));
    store.addMeasurement(distance('on-b', [[b, 0], [b, 1]]));
    store.addMeasurement(distance('across', [[a, 0], [b, 1]]));
    store.setActiveStructure(a);

    useMoleculeStore.getState().saveMoleculeToStorage('A only');

    const { loadedMoleculeId } = useMoleculeStore.getState();
    expect(loadMolecule(loadedMoleculeId!)?.measurements.map((m) => m.id)).toEqual(['on-a']);
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

describe('applyShareableSession measurement values', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('recomputes dihedrals, keeps distances and keeps dihedrals whose atoms are missing', () => {
    const shared = {
      id: 'orig-a',
      source: { type: 'rcsb' as const, id: '1CRN' },
      name: 'D',
      representation: 'ball-and-stick' as const,
      colorScheme: 'cpk' as const,
      componentSettings: [],
      visible: true,
    };
    const measurement = (id: string, type: string, atomIndices: number[], value: number) => ({
      id,
      type,
      atomRefs: atomIndices.map((atomIndex) => ({ structureId: 'orig-a', atomIndex })),
      atomIndices,
      value,
      unit: type === 'distance' ? 'Å' : '°',
    });
    useMoleculeStore.getState().applyShareableSession({
      structures: [{ molecule: createDihedralMolecule(), source: shared.source, shareableStructure: shared }],
      skipped: [],
      layoutMode: 'overlay',
      camera: null,
      measurements: [
        measurement('dih', 'dihedral', [0, 1, 2, 3], 90),
        measurement('dist', 'distance', [0, 1], 9.99),
        measurement('lost', 'dihedral', [0, 1, 2, 40], 12.5),
      ] as never,
      labels: [],
      surfaceSettings: { type: 'vdw', opacity: 0.7, probeRadius: 1.4, wireframe: false, visible: false, color: '#ffffff' },
      autoRotate: false,
      sourceStructures: [shared],
    });

    const values = Object.fromEntries(useMoleculeStore.getState().measurements.map((m) => [m.id, m.value]));
    expect(values.dih).toBeCloseTo(-90, 6);
    expect(values.dist).toBe(9.99);
    expect(values.lost).toBe(12.5);
  });
});
