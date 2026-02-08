import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import type { Atom } from '../../types';
import { useMoleculeStore } from '../../store/moleculeStore';

export interface SelectableAtomProps {
  atom: Atom;
  atomIndex: number;
  position: [number, number, number];
  radius: number;
  color: THREE.Color;
  selected?: boolean;
  /** Structure ID for multi-structure support. Falls back to active structure if not provided. */
  structureId?: string;
}

const EMISSIVE_SELECTED = new THREE.Color(0x44aaff);
const EMISSIVE_HOVERED = new THREE.Color(0xffffff);
const EMISSIVE_NONE = new THREE.Color(0x000000);

export function SelectableAtom({
  atom,
  atomIndex,
  position,
  radius,
  color,
  selected = false,
  structureId,
}: SelectableAtomProps) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const { gl } = useThree();

  const { setHoveredAtom, selectAtom, measurementMode, showContextMenu, activeStructureId } = useMoleculeStore(useShallow(state => ({
    setHoveredAtom: state.setHoveredAtom,
    selectAtom: state.selectAtom,
    measurementMode: state.measurementMode,
    showContextMenu: state.showContextMenu,
    activeStructureId: state.activeStructureId,
  })));

  // Use provided structureId or fall back to active structure
  const effectiveStructureId = structureId || activeStructureId || '';

  // Update emissive only when selection/hover state changes
  useEffect(() => {
    if (!materialRef.current) return;

    if (selected) {
      materialRef.current.emissive = EMISSIVE_SELECTED;
      materialRef.current.emissiveIntensity = 0.5;
    } else if (hovered) {
      materialRef.current.emissive = EMISSIVE_HOVERED;
      materialRef.current.emissiveIntensity = 0.2;
    } else {
      materialRef.current.emissive = EMISSIVE_NONE;
      materialRef.current.emissiveIntensity = 0;
    }
  }, [selected, hovered]);

  const handlePointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
    gl.domElement.style.cursor = measurementMode !== 'none' ? 'crosshair' : 'pointer';
    // Use 4-arg signature with structureId
    setHoveredAtom(atom, atomIndex, effectiveStructureId, { x: event.clientX, y: event.clientY });
  }, [atom, atomIndex, effectiveStructureId, gl.domElement.style, measurementMode, setHoveredAtom]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    gl.domElement.style.cursor = 'auto';
    setHoveredAtom(null, null, null, null);
  }, [gl.domElement.style, setHoveredAtom]);

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // Use 2-arg signature with structureId
    selectAtom(effectiveStructureId, atomIndex);
  }, [atomIndex, effectiveStructureId, selectAtom]);

  const handleContextMenu = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // Prevent default browser context menu
    event.nativeEvent.preventDefault();

    showContextMenu({
      x: event.clientX,
      y: event.clientY,
      atomIndex,
      structureId: effectiveStructureId,
      chainId: atom.chainId,
      residueName: atom.residueName,
      residueNumber: atom.residueNumber,
    });
  }, [atom, atomIndex, effectiveStructureId, showContextMenu]);

  // Memoize geometry to avoid recreation
  const geometry = useMemo(() => new THREE.SphereGeometry(radius, 32, 16), [radius]);

  return (
    <mesh
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      geometry={geometry}
    >
      <meshStandardMaterial ref={materialRef} color={color} />
    </mesh>
  );
}
