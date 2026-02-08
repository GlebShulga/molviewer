import { describe, it, expect, beforeEach } from 'vitest';
import { useMoleculeStore } from '../moleculeStore';
import {
  selectActiveStructure,
  selectTotalVisibleAtomCount,
  selectVisibleStructuresBoundingBox,
  selectHasStructures,
  selectVisibleStructures,
} from '../selectors';
import type { Molecule } from '../../types';

function createMockMolecule(name = 'Test', atomCount = 3): Molecule {
  const atoms = Array.from({ length: atomCount }, (_, i) => ({
    id: i,
    element: 'C',
    x: i * 1.5,
    y: i,
    z: -i,
    residueName: 'ALA',
    residueNumber: 1,
    chainId: 'A',
  }));

  return {
    name,
    atoms,
    bonds: [],
  };
}

describe('selectors', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
  });

  describe('selectActiveStructure', () => {
    it('returns null when no structures loaded', () => {
      const result = selectActiveStructure(useMoleculeStore.getState());
      expect(result).toBeNull();
    });

    it('returns active structure when loaded', () => {
      const id = useMoleculeStore.getState().addStructure(createMockMolecule('Protein A'), 'Protein A');
      const result = selectActiveStructure(useMoleculeStore.getState());

      expect(result).not.toBeNull();
      expect(result!.id).toBe(id);
      expect(result!.name).toBe('Protein A');
    });
  });

  describe('selectTotalVisibleAtomCount', () => {
    it('returns 0 when no structures', () => {
      expect(selectTotalVisibleAtomCount(useMoleculeStore.getState())).toBe(0);
    });

    it('counts atoms from visible structures', () => {
      const id1 = useMoleculeStore.getState().addStructure(createMockMolecule('A', 10), 'A');
      useMoleculeStore.getState().addStructure(createMockMolecule('B', 5), 'B');

      expect(selectTotalVisibleAtomCount(useMoleculeStore.getState())).toBe(15);

      // Hide first structure
      useMoleculeStore.getState().setStructureVisibility(id1, false);
      expect(selectTotalVisibleAtomCount(useMoleculeStore.getState())).toBe(5);
    });
  });

  describe('selectVisibleStructuresBoundingBox', () => {
    it('returns null when no structures', () => {
      expect(selectVisibleStructuresBoundingBox(useMoleculeStore.getState())).toBeNull();
    });

    it('calculates bounding box for visible structures', () => {
      useMoleculeStore.getState().addStructure(createMockMolecule('A', 3), 'A');
      const bb = selectVisibleStructuresBoundingBox(useMoleculeStore.getState());

      expect(bb).not.toBeNull();
      expect(bb!.minX).toBe(0);
      expect(bb!.maxX).toBe(3);   // 2 * 1.5
      expect(bb!.minY).toBe(0);
      expect(bb!.maxY).toBe(2);
    });
  });

  describe('selectHasStructures', () => {
    it('returns false when empty', () => {
      expect(selectHasStructures(useMoleculeStore.getState())).toBe(false);
    });

    it('returns true when structures exist', () => {
      useMoleculeStore.getState().addStructure(createMockMolecule(), 'A');
      expect(selectHasStructures(useMoleculeStore.getState())).toBe(true);
    });
  });

  describe('selectVisibleStructures', () => {
    it('returns only visible structures', () => {
      const id1 = useMoleculeStore.getState().addStructure(createMockMolecule('A'), 'A');
      useMoleculeStore.getState().addStructure(createMockMolecule('B'), 'B');

      useMoleculeStore.getState().setStructureVisibility(id1, false);

      const visible = selectVisibleStructures(useMoleculeStore.getState());
      expect(visible.length).toBe(1);
      expect(visible[0].name).toBe('B');
    });
  });
});
