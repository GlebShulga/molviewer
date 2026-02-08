import { Eye, EyeOff, X } from 'lucide-react';
import type { Structure } from '../../../types';
import styles from './StructureList.module.css';

// Map representation names to display labels
const REPRESENTATION_LABELS: Record<string, string> = {
  'ball-and-stick': 'Ball & Stick',
  'stick': 'Stick',
  'spacefill': 'Spacefill',
  'cartoon': 'Cartoon',
  'surface-vdw': 'VdW Surface',
  'surface-sas': 'SAS Surface',
};

// Map color scheme names to display labels
const COLOR_SCHEME_LABELS: Record<string, string> = {
  'cpk': 'CPK',
  'chain': 'Chain',
  'residueType': 'Residue',
  'bfactor': 'B-Factor',
  'rainbow': 'Rainbow',
  'secondaryStructure': 'Secondary',
};

export interface StructureListItemProps {
  structure: Structure;
  isActive: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onRemove: () => void;
}

export function StructureListItem({
  structure,
  isActive,
  onSelect,
  onToggleVisibility,
  onRemove,
}: StructureListItemProps) {
  const atomCount = structure.molecule.atoms.length;
  const representationLabel = REPRESENTATION_LABELS[structure.representation] || structure.representation;
  const colorSchemeLabel = COLOR_SCHEME_LABELS[structure.colorScheme] || structure.colorScheme;

  // Check if using smart defaults (component-based rendering)
  const useSmartDefaults = structure.classification?.hasMultipleTypes && structure.componentSettings.length > 0;

  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''} ${!structure.visible ? styles.hidden : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.itemContent}>
        <div className={styles.itemHeader}>
          <span className={styles.activeIndicator}>{isActive ? '\u25CF' : '\u25CB'}</span>
          <span className={styles.name} title={structure.name}>
            {structure.name}
          </span>
        </div>
        <div className={styles.itemMeta}>
          {useSmartDefaults ? (
            <span>Smart Defaults</span>
          ) : (
            <span>{representationLabel} \u2022 {colorSchemeLabel}</span>
          )}
          <span className={styles.atomCount}>{atomCount.toLocaleString()} atoms</span>
        </div>
      </div>

      <div className={styles.itemActions} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.actionButton}
          onClick={onToggleVisibility}
          title={structure.visible ? 'Hide structure' : 'Show structure'}
        >
          {structure.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          className={`${styles.actionButton} ${styles.danger}`}
          onClick={onRemove}
          title="Remove structure"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
