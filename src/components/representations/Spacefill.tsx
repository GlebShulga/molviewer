import { useMemo } from "react";
import * as THREE from "three";
import type { Molecule, Atom } from "../../types";
import { getVdwRadius } from "../../constants";
import { type ColorScheme } from "../../store/moleculeStore";
import { useRepresentationSetup } from "../../hooks";
import { SCALES, getQualityPreset } from "../../config";
import { getAtomColor } from "../../utils";
import { SelectableAtom } from "./SelectableAtom";
import { ImpostorAtoms, type AtomData } from "./ImpostorAtoms";

export interface SpacefillProps {
  molecule: Molecule;
  colorScheme?: ColorScheme;
  scale?: number;
  atomIndices?: number[]; // Filter to render only these atoms
  /** Structure ID for multi-structure support */
  structureId?: string;
}

interface AtomRenderData {
  atom: Atom;
  index: number;
  position: [number, number, number];
  color: THREE.Color;
  radius: number;
}

export function Spacefill({
  molecule,
  colorScheme = "cpk",
  scale = SCALES.spacefill,
  atomIndices,
  structureId,
}: SpacefillProps) {
  // Use shared representation setup hook
  const { effectiveStructureId, selectedAtomIndices, colorContext } =
    useRepresentationSetup(molecule, structureId);

  // Filter atoms if atomIndices is provided
  const filteredAtoms = useMemo(() => {
    if (!atomIndices) {
      return molecule.atoms.map((atom, index) => ({ atom, originalIndex: index }));
    }

    return atomIndices.map((originalIndex) => ({
      atom: molecule.atoms[originalIndex],
      originalIndex,
    })).filter(({ atom }) => atom !== undefined);
  }, [molecule.atoms, atomIndices]);

  // Determine if we should use impostors based on molecule size
  const qualityPreset = useMemo(
    () => getQualityPreset(molecule.atoms.length),
    [molecule.atoms.length]
  );
  const useImpostors = qualityPreset.useImpostors;

  // Atom data for SelectableAtom (tuple positions)
  const atomsData = useMemo<AtomRenderData[]>(() => {
    if (useImpostors) return []; // Skip if using impostors
    return filteredAtoms.map(({ atom, originalIndex }) => ({
      atom,
      index: originalIndex,
      position: [atom.x, atom.y, atom.z] as [number, number, number],
      color: new THREE.Color(getAtomColor(atom, colorScheme, colorContext)),
      radius: getVdwRadius(atom.element) * scale,
    }));
  }, [filteredAtoms, scale, colorScheme, colorContext, useImpostors]);

  // Atom data for ImpostorAtoms (Vector3 positions)
  const impostorAtomsData = useMemo<AtomData[]>(() => {
    if (!useImpostors) return []; // Skip if not using impostors
    return filteredAtoms.map(({ atom, originalIndex }) => ({
      atom,
      index: originalIndex,
      position: new THREE.Vector3(atom.x, atom.y, atom.z),
      color: new THREE.Color(getAtomColor(atom, colorScheme, colorContext)),
      radius: getVdwRadius(atom.element) * scale,
    }));
  }, [filteredAtoms, scale, colorScheme, colorContext, useImpostors]);

  return (
    <group>
      {/* Use impostors for large molecules, individual meshes for small */}
      {useImpostors ? (
        <ImpostorAtoms
          atomsData={impostorAtomsData}
          selectedIndices={selectedAtomIndices}
          structureId={effectiveStructureId}
        />
      ) : (
        atomsData.map((atomData) => (
          <SelectableAtom
            key={atomData.atom.id}
            atom={atomData.atom}
            atomIndex={atomData.index}
            position={atomData.position}
            radius={atomData.radius}
            color={atomData.color}
            selected={selectedAtomIndices.includes(atomData.index)}
            structureId={effectiveStructureId}
          />
        ))
      )}
    </group>
  );
}
