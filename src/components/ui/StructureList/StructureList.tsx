import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../../../store/moleculeStore';
import { CollapsibleSection } from '../CollapsibleSection';
import { StructureListItem } from './StructureListItem';
import styles from './StructureList.module.css';

export function StructureList() {
  const {
    structures,
    structureOrder,
    activeStructureId,
    layoutMode,
    setActiveStructure,
    setStructureVisibility,
    removeStructure,
    setLayoutMode,
  } = useMoleculeStore(useShallow(state => ({
    structures: state.structures,
    structureOrder: state.structureOrder,
    activeStructureId: state.activeStructureId,
    layoutMode: state.layoutMode,
    setActiveStructure: state.setActiveStructure,
    setStructureVisibility: state.setStructureVisibility,
    removeStructure: state.removeStructure,
    setLayoutMode: state.setLayoutMode,
  })));

  if (structureOrder.length === 0) {
    return null;
  }

  const title = structureOrder.length > 1
    ? `Structures (${structureOrder.length})`
    : 'Structures';

  return (
    <CollapsibleSection
      title={title}
      defaultOpen={true}
      storageKey="structures"
    >
      <div className={styles.structureList}>
        <div className={styles.items}>
          {structureOrder.map((id) => {
            const structure = structures.get(id);
            if (!structure) return null;

            return (
              <StructureListItem
                key={id}
                structure={structure}
                isActive={id === activeStructureId}
                onSelect={() => setActiveStructure(id)}
                onToggleVisibility={() => setStructureVisibility(id, !structure.visible)}
                onRemove={() => removeStructure(id)}
              />
            );
          })}
        </div>

        {structureOrder.length > 1 && (
          <div className={styles.layoutControls}>
            <span className={styles.layoutLabel}>Layout:</span>
            <div className={styles.layoutButtons}>
              <button
                className={`${styles.layoutButton} ${layoutMode === 'overlay' ? styles.active : ''}`}
                onClick={() => setLayoutMode('overlay')}
                title="Overlay structures at origin"
                aria-pressed={layoutMode === 'overlay'}
              >
                Overlay
              </button>
              <button
                className={`${styles.layoutButton} ${layoutMode === 'side-by-side' ? styles.active : ''}`}
                onClick={() => setLayoutMode('side-by-side')}
                title="Arrange structures side by side"
                aria-pressed={layoutMode === 'side-by-side'}
              >
                Side-by-Side
              </button>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
