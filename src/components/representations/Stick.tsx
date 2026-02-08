import { useMemo, useEffect, useRef } from "react";
import { createInstances } from "@react-three/drei";
import * as THREE from "three";
import type { Molecule, Atom } from "../../types";
import { useMoleculeStore, type ColorScheme } from "../../store/moleculeStore";
import { selectDetectAromaticRingsIfNeeded } from "../../store/selectors";
import { useRepresentationSetup } from "../../hooks";
import { SCALES, COLORS, getQualityPreset, AROMATIC_DETECTION_THRESHOLD } from "../../config";
import { getAtomColor } from "../../utils";
import { SelectableAtom } from "./SelectableAtom";
import { ImpostorAtoms, type AtomData } from "./ImpostorAtoms";
import { AromaticRings } from "./AromaticRings";

export interface StickProps {
  molecule: Molecule;
  colorScheme?: ColorScheme;
  bondRadius?: number;
  showAromaticRings?: boolean;
  atomIndices?: number[]; // Filter to render only these atoms
  /** Structure ID for multi-structure support */
  structureId?: string;
}

const [BondInstances, BondInstance] = createInstances();

interface HalfBondRenderData {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  color: THREE.Color;
}

interface AtomRenderData {
  atom: Atom;
  index: number;
  position: [number, number, number];
  color: THREE.Color;
}

export function Stick({
  molecule,
  colorScheme = "cpk",
  bondRadius = SCALES.stickRadius,
  showAromaticRings = true,
  atomIndices,
  structureId,
}: StickProps) {
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

  // Small spheres for atom selection (tuple positions)
  const atomsData = useMemo<AtomRenderData[]>(() => {
    if (useImpostors) return []; // Skip if using impostors
    return filteredAtoms.map(({ atom, originalIndex }) => ({
      atom,
      index: originalIndex,
      position: [atom.x, atom.y, atom.z] as [number, number, number],
      color: new THREE.Color(getAtomColor(atom, colorScheme, colorContext)),
    }));
  }, [filteredAtoms, colorScheme, colorContext, useImpostors]);

  // Atom data for ImpostorAtoms (Vector3 positions)
  const impostorAtomsData = useMemo<AtomData[]>(() => {
    if (!useImpostors) return []; // Skip if not using impostors
    return filteredAtoms.map(({ atom, originalIndex }) => ({
      atom,
      index: originalIndex,
      position: new THREE.Vector3(atom.x, atom.y, atom.z),
      color: new THREE.Color(getAtomColor(atom, colorScheme, colorContext)),
      radius: bondRadius * 1.5, // Same as SelectableAtom radius for Stick
    }));
  }, [filteredAtoms, colorScheme, colorContext, useImpostors, bondRadius]);

  const bondsData = useMemo<HalfBondRenderData[]>(() => {
    const halfBonds: HalfBondRenderData[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const isLargeMolecule = molecule.atoms.length > AROMATIC_DETECTION_THRESHOLD;

    for (const bond of filteredBonds) {
      const atom1 = molecule.atoms[bond.atom1Index];
      const atom2 = molecule.atoms[bond.atom2Index];

      if (!atom1 || !atom2) continue;

      const start = new THREE.Vector3(atom1.x, atom1.y, atom1.z);
      const end = new THREE.Vector3(atom2.x, atom2.y, atom2.z);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const direction = new THREE.Vector3().subVectors(end, start);
      const fullLength = direction.length();

      direction.normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);

      if (isLargeMolecule) {
        // Large molecules: single bond with uniform color (1 bond instead of 2 half-bonds)
        halfBonds.push({
          position: mid,
          quaternion,
          length: fullLength,
          color: new THREE.Color(COLORS.defaultBond),
        });
      } else {
        // Small molecules: two half-bonds with per-atom colors
        const halfLength = fullLength / 2;

        // First half (atom1 color)
        const firstHalfPos = new THREE.Vector3().addVectors(start, mid).multiplyScalar(0.5);
        halfBonds.push({
          position: firstHalfPos,
          quaternion: quaternion.clone(),
          length: halfLength,
          color: new THREE.Color(getAtomColor(atom1, colorScheme, colorContext)),
        });

        // Second half (atom2 color)
        const secondHalfPos = new THREE.Vector3().addVectors(mid, end).multiplyScalar(0.5);
        halfBonds.push({
          position: secondHalfPos,
          quaternion: quaternion.clone(),
          length: halfLength,
          color: new THREE.Color(getAtomColor(atom2, colorScheme, colorContext)),
        });
      }
    }

    return halfBonds;
  }, [molecule.atoms, filteredBonds, colorScheme, colorContext]);

  const bondGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(bondRadius, bondRadius, 1, 8);
  }, [bondRadius]);

  // Dispose previous geometry when it changes or on unmount
  const prevBondGeomRef = useRef<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    if (prevBondGeomRef.current && prevBondGeomRef.current !== bondGeometry) {
      prevBondGeomRef.current.dispose();
    }
    prevBondGeomRef.current = bondGeometry;
    return () => { prevBondGeomRef.current?.dispose(); };
  }, [bondGeometry]);

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
            radius={bondRadius * 1.5}
            color={atomData.color}
            selected={selectedAtomIndices.includes(atomData.index)}
            structureId={effectiveStructureId}
          />
        ))
      )}

      <BondInstances key={`${molecule.name}-${bondsData.length}`} limit={bondsData.length} geometry={bondGeometry}>
        <meshStandardMaterial />
        {bondsData.map((bond, index) => (
          <BondInstance
            key={index}
            position={bond.position}
            quaternion={bond.quaternion}
            scale={[1, bond.length, 1]}
            color={bond.color}
          />
        ))}
      </BondInstances>

      {showAromaticRings && molecule.aromaticRings && (
        <AromaticRings rings={molecule.aromaticRings} />
      )}
    </group>
  );
}
