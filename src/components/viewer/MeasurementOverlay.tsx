import { useMemo, memo } from 'react';
import { Line } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import type { Atom, Structure, QualifiedAtomRef } from '../../types';
import type { Measurement, MeasurementType } from '../../utils/measurements';
import { formatMeasurement } from '../../utils/measurements';
import { DEFAULT_MEASUREMENT_COLORS, type MeasurementColors } from '../../colors';
import { DistanceMeasurement, AngleMeasurement, DihedralMeasurement } from './measurements';
import { useMoleculeStore } from '../../store/moleculeStore';

export type { MeasurementColors };

/** Number of atoms required for each measurement type */
const REQUIRED_ATOM_COUNTS: Record<MeasurementType, number> = {
  distance: 2,
  angle: 3,
  dihedral: 4,
};

export interface MeasurementOverlayProps {
  colors?: MeasurementColors;
}

/**
 * Resolves an atom from a qualified reference, applying structure offset
 */
function resolveAtomWithOffset(
  ref: QualifiedAtomRef,
  getStructure: (id: string) => Structure | undefined
): Atom | null {
  const structure = getStructure(ref.structureId);
  if (!structure) return null;
  const atom = structure.molecule.atoms[ref.atomIndex];
  if (!atom) return null;

  // Apply structure offset to get world-space position
  return {
    ...atom,
    x: atom.x + structure.offset[0],
    y: atom.y + structure.offset[1],
    z: atom.z + structure.offset[2],
  };
}

function SelectedAtomIndicator({ atom }: { atom: Atom }) {
  return (
    <mesh position={[atom.x, atom.y, atom.z]}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
    </mesh>
  );
}

function SelectionPreview({
  fromAtom,
  toAtom,
  color,
}: {
  fromAtom: Atom;
  toAtom: Atom;
  color: string;
}) {
  const points = useMemo(
    () => [
      new THREE.Vector3(fromAtom.x, fromAtom.y, fromAtom.z),
      new THREE.Vector3(toAtom.x, toAtom.y, toAtom.z),
    ],
    [fromAtom, toAtom]
  );

  return (
    <Line
      points={points}
      color={color}
      lineWidth={2}
      dashed
      dashSize={0.2}
      gapSize={0.1}
      transparent
      opacity={0.7}
    />
  );
}

export const MeasurementOverlay = memo(function MeasurementOverlay({
  colors = DEFAULT_MEASUREMENT_COLORS,
}: MeasurementOverlayProps) {
  // Subscribe to measurement-related state internally
  const {
    measurements,
    selectedAtoms,
    hoveredAtomIndex,
    hoveredStructureId,
    measurementMode,
    highlightedMeasurementId,
  } = useMoleculeStore(useShallow((state) => ({
    measurements: state.measurements,
    selectedAtoms: state.selectedAtoms,
    hoveredAtomIndex: state.hoveredAtomIndex,
    hoveredStructureId: state.hoveredStructureId,
    measurementMode: state.measurementMode,
    highlightedMeasurementId: state.highlightedMeasurementId,
  })));

  // Get the stable getStructure method from store
  const getStructure = useMoleculeStore(state => state.getStructure);

  // Determine preview line color based on measurement mode
  const previewColor = colors[measurementMode as MeasurementType] ?? colors.distance;

  // Resolve selected atoms using getStructure
  const resolvedSelectedAtoms = useMemo(() => {
    if (selectedAtoms.length === 0) return [];
    return selectedAtoms
      .map(ref => resolveAtomWithOffset(ref, getStructure))
      .filter((a): a is Atom => a !== null);
  }, [selectedAtoms, getStructure]);

  // Resolve hovered atom
  const resolvedHoveredAtom = useMemo(() => {
    if (hoveredAtomIndex === null || !hoveredStructureId) return null;
    return resolveAtomWithOffset(
      { structureId: hoveredStructureId, atomIndex: hoveredAtomIndex },
      getStructure
    );
  }, [hoveredStructureId, hoveredAtomIndex, getStructure]);

  // Check if hovered atom is already selected
  const isHoveredSelected = useMemo(() => {
    if (hoveredAtomIndex === null || !hoveredStructureId) return false;
    return selectedAtoms.some(
      ref => ref.structureId === hoveredStructureId && ref.atomIndex === hoveredAtomIndex
    );
  }, [selectedAtoms, hoveredAtomIndex, hoveredStructureId]);

  // Show preview line when in measurement mode, have selected atoms, and hovering a different atom
  const showPreview = measurementMode !== 'none' &&
                      resolvedSelectedAtoms.length > 0 &&
                      resolvedHoveredAtom !== null &&
                      !isHoveredSelected;

  const lastSelectedAtom = showPreview ? resolvedSelectedAtoms[resolvedSelectedAtoms.length - 1] : null;

  // Resolve measurement atoms using getStructure
  const resolveMeasurementAtoms = useMemo(() => (measurement: Measurement): Atom[] => {
    if (measurement.atomRefs && measurement.atomRefs.length > 0) {
      return measurement.atomRefs
        .map(ref => resolveAtomWithOffset(ref, getStructure))
        .filter((a): a is Atom => a !== null);
    }
    // Legacy fallback - measurements without atomRefs shouldn't exist anymore
    return [];
  }, [getStructure]);

  return (
    <group>
      {/* Show preview line from last selected atom to hovered atom */}
      {showPreview && lastSelectedAtom && resolvedHoveredAtom && (
        <SelectionPreview
          fromAtom={lastSelectedAtom}
          toAtom={resolvedHoveredAtom}
          color={previewColor}
        />
      )}

      {/* Show selected atoms */}
      {resolvedSelectedAtoms.map((atom, idx) => (
        <SelectedAtomIndicator key={`selected-${idx}`} atom={atom} />
      ))}

      {/* Render measurements */}
      {measurements.map((measurement) => {
        const measurementAtoms = resolveMeasurementAtoms(measurement);
        const label = formatMeasurement(measurement);
        const isHighlighted = measurement.id === highlightedMeasurementId;

        // Skip if we couldn't resolve all atoms
        const requiredCount = REQUIRED_ATOM_COUNTS[measurement.type];
        if (measurementAtoms.length < requiredCount) return null;

        switch (measurement.type) {
          case 'distance':
            return (
              <DistanceMeasurement
                key={measurement.id}
                atom1={measurementAtoms[0]}
                atom2={measurementAtoms[1]}
                label={label}
                color={colors.distance}
                isHighlighted={isHighlighted}
              />
            );
          case 'angle':
            return (
              <AngleMeasurement
                key={measurement.id}
                atom1={measurementAtoms[0]}
                atom2={measurementAtoms[1]}
                atom3={measurementAtoms[2]}
                label={label}
                color={colors.angle}
                isHighlighted={isHighlighted}
              />
            );
          case 'dihedral':
            return (
              <DihedralMeasurement
                key={measurement.id}
                atom1={measurementAtoms[0]}
                atom2={measurementAtoms[1]}
                atom3={measurementAtoms[2]}
                atom4={measurementAtoms[3]}
                label={label}
                color={colors.dihedral}
                isHighlighted={isHighlighted}
              />
            );
        }
      })}
    </group>
  );
});
