import React, { useEffect, useMemo } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import { useMoleculeStore } from '../store/moleculeStore';
import { noteFrameDrawn, noteStructureCommitted, noteStructureUnmounted } from '../utils/loadTracking';
import { selectVisibleStructureIds, selectStructureRenderData } from '../store/selectors';
import { StructureRepresentation } from './StructureRepresentation';

interface StructureRendererProps {
  structureId: string;
  surfaceSettings: {
    type: 'vdw' | 'sas';
    opacity: number;
    color: string;
    wireframe: boolean;
    probeRadius: number;
    visible: boolean;
  };
}

/**
 * Renders a single structure with its own store subscription.
 * Only re-renders when this specific structure's render data changes.
 */
const StructureRenderer = React.memo(function StructureRenderer({
  structureId,
  surfaceSettings,
}: StructureRendererProps) {
  // Create a memoized selector for this specific structure
  const selector = useMemo(() => selectStructureRenderData(structureId), [structureId]);
  const structureData = useMoleculeStore(selector);

  // The geometry is built once this commits: the next frame drawn shows a
  // new load (src/utils/loadTracking.ts). Keyed by the molecule: a reopened
  // saved session keeps this renderer (same id). The scene draws on demand,
  // so ask for that frame.
  const invalidate = useThree((state) => state.invalidate);
  const molecule = structureData?.molecule;
  useEffect(() => {
    if (!molecule) return;
    noteStructureCommitted(structureId, molecule);
    invalidate();
  }, [structureId, molecule, invalidate]);
  useEffect(() => () => noteStructureUnmounted(structureId), [structureId]);

  // Don't render if structure is hidden or removed
  if (!structureData) return null;

  return (
    <group position={structureData.offset}>
      <StructureRepresentation
        structureData={structureData}
        surfaceSettings={surfaceSettings}
      />
    </group>
  );
});

/**
 * Renders all visible structures with their layout offsets.
 * Uses ID-based subscriptions for efficient re-renders:
 * - Parent only re-renders when the list of visible IDs changes
 * - Each child only re-renders when its specific structure data changes
 */
export const MultiStructureRenderer = React.memo(function MultiStructureRenderer() {
  // Subscribe only to the list of visible structure IDs (stable array reference)
  const visibleStructureIds = useMoleculeStore(selectVisibleStructureIds);

  // After each frame React Three Fiber draws: a committed load is now on screen
  useEffect(() => addAfterEffect(noteFrameDrawn), []);
  // surfaceSettings is a shallow object that changes rarely
  const surfaceSettings = useMoleculeStore(state => state.surfaceSettings);

  return (
    <>
      {visibleStructureIds.map((id) => (
        <StructureRenderer
          key={id}
          structureId={id}
          surfaceSettings={surfaceSettings}
        />
      ))}
    </>
  );
});
