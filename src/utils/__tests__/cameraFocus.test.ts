import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { viewerHandle } from '../viewerHandle';
import { cameraFocusedOn, focusCameraOnAtom } from '../cameraFocus';
import type { MoleculeViewerHandle } from '../../components/viewer/MoleculeViewer';
import type { CameraSnapshot } from '../../types/session';

describe('cameraFocusedOn', () => {
  it('moves target and position together, keeping direction, distance and zoom', () => {
    const before: CameraSnapshot = { position: [10, 0, 0], target: [0, 0, 0], zoom: 2 };
    expect(cameraFocusedOn(before, [1, 2, 3])).toEqual({ position: [11, 2, 3], target: [1, 2, 3], zoom: 2 });
  });
});

describe('focusCameraOnAtom', () => {
  let snapshot: CameraSnapshot;
  const apply = vi.fn((s: CameraSnapshot) => { snapshot = s; });

  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
    snapshot = { position: [0, 0, 50], target: [0, 0, 0], zoom: 1 };
    apply.mockClear();
    viewerHandle.set({ getCameraSnapshot: () => snapshot, applyCameraSnapshot: apply } as unknown as MoleculeViewerHandle);
  });
  afterEach(() => viewerHandle.set(null));

  function addTwoStructures() {
    const molecule = (name: string) => ({
      name,
      atoms: [{ id: 0, element: 'C', x: 0, y: 0, z: 0 }, { id: 1, element: 'O', x: 4, y: 5, z: 6 }],
      bonds: [],
    });
    const store = useMoleculeStore.getState();
    const a = store.addStructure(molecule('a'), 'a');
    const b = store.addStructure(molecule('b'), 'b');
    store.setLayoutMode('side-by-side');
    return { a, b };
  }

  it('centres the view on the atom, including its structure offset', () => {
    const { b } = addTwoStructures();
    const offset = useMoleculeStore.getState().structures.get(b)!.offset;
    expect(offset.some(v => v !== 0)).toBe(true);

    expect(focusCameraOnAtom(b, 1)).toBe(true);
    const point = [4 + offset[0], 5 + offset[1], 6 + offset[2]];
    expect(snapshot.target).toEqual(point);
    expect(snapshot.position).toEqual([point[0], point[1], point[2] + 50]);
  });

  it('does nothing for an unknown structure or atom', () => {
    const { a } = addTwoStructures();
    expect(focusCameraOnAtom('missing', 0)).toBe(false);
    expect(focusCameraOnAtom(a, 99)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
