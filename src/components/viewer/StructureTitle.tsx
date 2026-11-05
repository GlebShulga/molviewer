import { useMoleculeStore } from '../../store/moleculeStore';
import { selectActiveStructure } from '../../store/selectors';
import type { StructureSource } from '../../types';
import styles from './ViewerOverlays.module.css';

/** The ID people would look the structure up by, if it came from a database. */
export function structureSourceId(source: StructureSource | undefined): string | null {
  switch (source?.type) {
    case 'rcsb':
    case 'alphafold':
      return source.id;
    case 'pubchem':
      return `CID ${source.cid}`;
    default:
      return null;
  }
}

/**
 * The active structure's name over the viewer, whichever way it was loaded:
 * on phones the sheet that names it is closed. A tap opens its Molecule Info.
 * Landing pages show the "Details about X" pill in this place instead (App
 * decides).
 */
export function StructureTitle({ onOpenDetails }: { onOpenDetails: () => void }) {
  const structure = useMoleculeStore(selectActiveStructure);
  if (!structure) return null;

  const id = structureSourceId(structure.source);
  return (
    <button
      type="button"
      className={styles.titleChip}
      onClick={onOpenDetails}
      title={`${structure.name}: molecule info`}
      data-testid="structure-title"
    >
      <span className={styles.titleName}>{structure.name}</span>
      {id && id.toUpperCase() !== structure.name.toUpperCase() && <span className={styles.titleId}>{id}</span>}
    </button>
  );
}
