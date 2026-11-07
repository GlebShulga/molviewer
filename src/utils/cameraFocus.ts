import { useMoleculeStore } from '../store/moleculeStore';
import type { CameraSnapshot } from '../types/session';
import { viewerHandle } from './viewerHandle';

/** The same view, moved so that it looks at `point` (direction, distance and zoom kept). */
export function cameraFocusedOn(snapshot: CameraSnapshot, point: [number, number, number]): CameraSnapshot {
  const shift = point.map((v, i) => v - snapshot.target[i]);
  return {
    position: [snapshot.position[0] + shift[0], snapshot.position[1] + shift[1], snapshot.position[2] + shift[2]],
    target: point,
    zoom: snapshot.zoom,
  };
}

/**
 * Centres the view on one atom, at its place in the scene (atom plus its
 * structure's layout offset). False when the atom or the viewer is missing.
 */
export function focusCameraOnAtom(structureId: string, atomIndex: number): boolean {
  const structure = useMoleculeStore.getState().structures.get(structureId);
  const atom = structure?.molecule.atoms[atomIndex];
  const handle = viewerHandle.get();
  const snapshot = handle?.getCameraSnapshot();
  if (!structure || !atom || !handle || !snapshot) return false;
  const [ox, oy, oz] = structure.offset;
  handle.applyCameraSnapshot(cameraFocusedOn(snapshot, [atom.x + ox, atom.y + oy, atom.z + oz]));
  return true;
}
