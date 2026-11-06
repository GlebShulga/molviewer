import { useEffect } from 'react';
import { useMoleculeStore } from '../store/moleculeStore';
import { selectDetectAromaticRingsIfNeeded } from '../store/selectors';

/**
 * Runs lazy aromatic ring detection for one structure while a representation
 * that draws ring markers (Ball & Stick, Stick) shows it.
 *
 * It follows the structure's aromaticRingsDetected flag, not only its ID: a
 * session loaded over the same structures (reloading the one on screen) keeps
 * the IDs, so the representation stays mounted while the load resets the flag
 * and drops the rings.
 */
export function useAromaticRingDetection(structureId: string, enabled: boolean): void {
  const detectAromaticRingsIfNeeded = useMoleculeStore(selectDetectAromaticRingsIfNeeded);
  const detected = useMoleculeStore(
    (state) => state.structures.get(structureId)?.aromaticRingsDetected ?? false
  );

  useEffect(() => {
    if (enabled && !detected) {
      detectAromaticRingsIfNeeded(structureId);
    }
  }, [enabled, detected, detectAromaticRingsIfNeeded, structureId]);
}
