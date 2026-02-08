import { describe, it, expect, beforeEach } from 'vitest';
import { useMoleculeStore, temporalStore } from '../moleculeStore';
import type { Molecule } from '../../types';

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

describe('moleculeStore', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    // Clear undo history
    temporalStore.getState().clear();
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
  });
});
