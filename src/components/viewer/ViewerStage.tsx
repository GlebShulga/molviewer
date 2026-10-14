import { useCallback, type Ref } from 'react';
import * as THREE from 'three';
import { MoleculeViewer, type MoleculeViewerHandle } from './MoleculeViewer';
import { MoleculeScene, type MoleculeSceneProps } from '../MoleculeScene';
import type { selectVisibleStructuresBoundingBox } from '../../store/selectors';

export interface ViewerStageProps {
  ref?: Ref<MoleculeViewerHandle>;
  autoRotate: boolean;
  backgroundColor: string;
  atomCount: number;
  /** Plain bounding box from the store; turned into THREE vectors here. */
  boundingBox: ReturnType<typeof selectVisibleStructuresBoundingBox>;
  measurementColors: MoleculeSceneProps['measurementColors'];
}

/**
 * The main app's 3D viewer and scene. App loads this module lazily
 * (see loadViewerStage) so three.js stays out of the startup bundle.
 */
export default function ViewerStage({
  ref,
  autoRotate,
  backgroundColor,
  atomCount,
  boundingBox,
  measurementColors,
}: ViewerStageProps) {
  // Convert bounding box data to THREE.Vector3 objects
  const getBoundingBox = useCallback(() => {
    if (!boundingBox) return null;
    const min = new THREE.Vector3(boundingBox.minX, boundingBox.minY, boundingBox.minZ);
    const max = new THREE.Vector3(boundingBox.maxX, boundingBox.maxY, boundingBox.maxZ);
    const center = new THREE.Vector3(boundingBox.centerX, boundingBox.centerY, boundingBox.centerZ);
    return { min, max, center };
  }, [boundingBox]);

  return (
    <MoleculeViewer
      ref={ref}
      autoRotate={autoRotate}
      backgroundColor={backgroundColor}
      atomCount={atomCount}
      getBoundingBox={getBoundingBox}
    >
      <MoleculeScene measurementColors={measurementColors} />
    </MoleculeViewer>
  );
}
