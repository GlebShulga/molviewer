import { useShallow } from 'zustand/react/shallow';
import { FileUpload, ControlPanel, SequenceViewer } from '../ui';
import { useMoleculeStore } from '../../store/moleculeStore';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const { structureOrder, activeStructureId, selectAtom } = useMoleculeStore(useShallow(state => ({
    structureOrder: state.structureOrder,
    activeStructureId: state.activeStructureId,
    selectAtom: state.selectAtom,
  })));

  // Check if we have any structures loaded
  const hasStructures = structureOrder.length > 0;

  const handleResidueClick = (atomIndices: number[]) => {
    if (atomIndices.length > 0 && activeStructureId) {
      // Use 2-arg signature with structureId
      selectAtom(activeStructureId, atomIndices[0]);
    }
  };

  return (
    <aside className={styles.sidebar} role="complementary" aria-label="Controls">
      <FileUpload />
      {hasStructures && (
        <SequenceViewer
          onResidueClick={handleResidueClick}
        />
      )}
      <ControlPanel />
    </aside>
  );
}
