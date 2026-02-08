import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useMoleculeStore, type Label3D as Label3DType } from '../../../store/moleculeStore';
import type { Atom } from '../../../types';
import styles from './Labels3D.module.css';

/** Vertical offset above atom for 3D label positioning */
const LABEL_Y_OFFSET = 0.8;

interface Label3DProps {
  label: Label3DType;
  atom: Atom;
  /** Offset to apply for the structure's position */
  structureOffset: [number, number, number];
  onDelete: (id: string) => void;
}

function Label3DComponent({ label, atom, structureOffset, onDelete }: Label3DProps) {
  // Offset the label slightly above the atom, applying structure offset
  const position: [number, number, number] = [
    atom.x + structureOffset[0],
    atom.y + structureOffset[1] + LABEL_Y_OFFSET,
    atom.z + structureOffset[2],
  ];

  return (
    <Html
      position={position}
      center
      distanceFactor={10}
      occlude={false}
      style={{ pointerEvents: 'auto' }}
    >
      <div className={styles.label3d}>
        <span className={styles.labelText}>{label.text}</span>
        <button
          className={styles.deleteButton}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(label.id);
          }}
          title="Remove label"
        >
          ×
        </button>
      </div>
    </Html>
  );
}

interface ResolvedLabel {
  label: Label3DType;
  atom: Atom;
  offset: [number, number, number];
}

export function Labels3D() {
  // Subscribe only to labels array - stable reference when unchanged
  const labels = useMoleculeStore(state => state.labels);
  const removeLabel = useMoleculeStore(state => state.removeLabel);
  // Get the stable getStructure method from store
  const getStructure = useMoleculeStore(state => state.getStructure);

  // Resolve labels using getStructure instead of subscribing to structures Map
  const validLabels = useMemo(() => {
    if (!labels || labels.length === 0) return [];

    const resolved: ResolvedLabel[] = [];
    for (const label of labels) {
      // Get the structure for this label using the stable method
      const structure = getStructure(label.structureId);
      if (!structure) continue;

      // Check if atom index is valid
      const atom = structure.molecule.atoms[label.atomIndex];
      if (!atom) continue;

      resolved.push({
        label,
        atom,
        offset: structure.offset,
      });
    }
    return resolved;
  }, [labels, getStructure]);

  if (validLabels.length === 0) {
    return null;
  }

  return (
    <group>
      {validLabels.map(({ label, atom, offset }) => (
        <Label3DComponent
          key={label.id}
          label={label}
          atom={atom}
          structureOffset={offset}
          onDelete={removeLabel}
        />
      ))}
    </group>
  );
}
