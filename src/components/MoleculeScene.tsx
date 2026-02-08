import { useMoleculeStore } from '../store/moleculeStore';
import { selectHasStructures } from '../store/selectors';
import { MeasurementOverlay, Labels3D } from './viewer';
import { MultiStructureRenderer } from './MultiStructureRenderer';

export interface MoleculeSceneProps {
  measurementColors: {
    distance: string;
    angle: string;
    dihedral: string;
    outline: string;
  };
}

/**
 * Three.js scene composition for molecular visualization.
 * Renders all structures, measurements, and 3D labels.
 * Returns null if no structures are loaded.
 */
export function MoleculeScene({ measurementColors }: MoleculeSceneProps) {
  // Use selectHasStructures for the null check - returns primitive boolean
  const hasStructures = useMoleculeStore(selectHasStructures);

  if (!hasStructures) return null;

  return (
    <>
      <MultiStructureRenderer />
      <MeasurementOverlay colors={measurementColors} />
      <Labels3D />
    </>
  );
}
