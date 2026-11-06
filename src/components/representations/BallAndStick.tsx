import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import type { Molecule, Atom } from "../../types";
import { getVdwRadius } from "../../constants";
import { useMoleculeStore, type ColorScheme } from "../../store/moleculeStore";
import { selectDetectAromaticRingsIfNeeded } from "../../store/selectors";
import { useRepresentationSetup } from "../../hooks";
import { SCALES, COLORS, getQualityPreset } from "../../config";
import { getAtomColor } from "../../utils";
import { SelectableAtom } from "./SelectableAtom";
import { ImpostorAtoms, type AtomData } from "./ImpostorAtoms";
import { AromaticRings } from "./AromaticRings";
import { InstancedBonds, writeSegmentMatrix } from "./InstancedBonds";

export interface BallAndStickProps {
  molecule: Molecule;
  colorScheme?: ColorScheme;
  atomScale?: number;
  bondRadius?: number;
  bondColor?: string;
  showAromaticRings?: boolean;
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

export function BallAndStick({
  molecule,
  colorScheme = "cpk",
  atomScale = SCALES.atom,
  bondRadius = SCALES.bondRadius,
  bondColor = COLORS.defaultBond,
  showAromaticRings = true,
  atomIndices,
  structureId,
}: BallAndStickProps) {
  // Use shared representation setup hook
  const { effectiveStructureId, selectedAtomIndices, colorContext } =
    useRepresentationSetup(molecule, structureId);

  // Aromatic ring detection is representation-specific
  const detectAromaticRingsIfNeeded = useMoleculeStore(selectDetectAromaticRingsIfNeeded);

  // Trigger lazy aromatic ring detection when needed
  useEffect(() => {
    if (showAromaticRings) {
      detectAromaticRingsIfNeeded();
    }
  }, [showAromaticRings, detectAromaticRingsIfNeeded]);

  // Filter atoms and bonds if atomIndices is provided
  const { filteredAtoms, filteredBonds } = useMemo(() => {
    if (!atomIndices) {
      return {
        filteredAtoms: molecule.atoms.map((atom, index) => ({ atom, originalIndex: index })),
        filteredBonds: molecule.bonds,
      };
    }

    const atomIndexSet = new Set(atomIndices);
    const filtered = atomIndices.map((originalIndex) => ({
      atom: molecule.atoms[originalIndex],
      originalIndex,
    })).filter(({ atom }) => atom !== undefined);

    // Only include bonds where BOTH atoms are in the filtered set
    const bonds = molecule.bonds.filter(
      (b) => atomIndexSet.has(b.atom1Index) && atomIndexSet.has(b.atom2Index)
    );

    return {
      filteredAtoms: filtered,
      filteredBonds: bonds,
    };
  }, [molecule.atoms, molecule.bonds, atomIndices]);

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
      radius: getVdwRadius(atom.element) * atomScale,
    }));
  }, [filteredAtoms, atomScale, colorScheme, colorContext, useImpostors]);

  // Atom data for ImpostorAtoms (Vector3 positions)
  const impostorAtomsData = useMemo<AtomData[]>(() => {
    if (!useImpostors) return []; // Skip if not using impostors
    return filteredAtoms.map(({ atom, originalIndex }) => ({
      atom,
      index: originalIndex,
      position: new THREE.Vector3(atom.x, atom.y, atom.z),
      color: new THREE.Color(getAtomColor(atom, colorScheme, colorContext)),
      radius: getVdwRadius(atom.element) * atomScale,
    }));
  }, [filteredAtoms, atomScale, colorScheme, colorContext, useImpostors]);

  // One matrix per bond (16 floats), for InstancedBonds
  const bondMatrices = useMemo(() => {
    const matrices = new Float32Array(filteredBonds.length * 16);
    let n = 0;
    for (const bond of filteredBonds) {
      const atom1 = molecule.atoms[bond.atom1Index];
      const atom2 = molecule.atoms[bond.atom2Index];
      if (!atom1 || !atom2) continue;
      writeSegmentMatrix(matrices, n++, atom1.x, atom1.y, atom1.z, atom2.x, atom2.y, atom2.z);
    }
    return n === filteredBonds.length ? matrices : matrices.slice(0, n * 16);
  }, [molecule.atoms, filteredBonds]);

  const bondGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(bondRadius, bondRadius, 1, 8);
  }, [bondRadius]);

  const bondMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: bondColor });
  }, [bondColor]);

  // Dispose previous geometry/material when they change or on unmount
  const prevBondGeomRef = useRef<THREE.BufferGeometry | null>(null);
  const prevBondMatRef = useRef<THREE.Material | null>(null);
  useEffect(() => {
    if (prevBondGeomRef.current && prevBondGeomRef.current !== bondGeometry) {
      prevBondGeomRef.current.dispose();
    }
    prevBondGeomRef.current = bondGeometry;
    return () => { prevBondGeomRef.current?.dispose(); };
  }, [bondGeometry]);
  useEffect(() => {
    if (prevBondMatRef.current && prevBondMatRef.current !== bondMaterial) {
      prevBondMatRef.current.dispose();
    }
    prevBondMatRef.current = bondMaterial;
    return () => { prevBondMatRef.current?.dispose(); };
  }, [bondMaterial]);

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

      <InstancedBonds matrices={bondMatrices} geometry={bondGeometry} material={bondMaterial} />

      {showAromaticRings && molecule.aromaticRings && (
        <AromaticRings rings={molecule.aromaticRings} />
      )}
    </group>
  );
}
