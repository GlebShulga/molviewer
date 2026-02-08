import * as THREE from 'three';
import type { Molecule, AssemblyTransform } from '../types';

/**
 * Symmetry detection and assembly utilities for large molecular structures.
 *
 * Virus capsids and other symmetric structures can have 60+ identical copies
 * of an asymmetric unit. By detecting this symmetry, we can store only the
 * unique atoms and render with GPU instancing for massive memory/performance gains.
 *
 * Example: HIV capsid
 * - 68M atoms total
 * - ~1M unique atoms (asymmetric unit)
 * - 60 icosahedral transformations
 * - Result: 60x memory reduction, 60x fewer atoms to process
 */

/**
 * Types of biological symmetry commonly found in molecular structures.
 */
export type SymmetryType =
  | 'icosahedral' // 60-fold (virus capsids)
  | 'helical' // Variable (filaments, tubes)
  | 'cyclic' // N-fold rotational (Cn symmetry)
  | 'dihedral' // 2N-fold (Dn symmetry)
  | 'tetrahedral' // 12-fold (T symmetry)
  | 'octahedral' // 24-fold (O symmetry)
  | 'crystallographic' // Crystal unit cell
  | 'none';

/**
 * Detected symmetry information.
 */
export interface DetectedSymmetry {
  /** Type of symmetry */
  type: SymmetryType;
  /** Number of symmetric copies */
  copyCount: number;
  /** Indices of atoms in the asymmetric unit */
  asymmetricUnitAtomIndices: number[];
  /** Transformation matrices for each copy */
  transforms: THREE.Matrix4[];
  /** Chain IDs included in asymmetric unit */
  asymmetricUnitChains: string[];
  /** Estimated memory savings as fraction (0-1) */
  memorySavings: number;
}

/**
 * Convert assembly transform matrix (row-major 16 elements) to THREE.Matrix4.
 */
export function assemblyTransformToMatrix4(transform: AssemblyTransform): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  // PDB BIOMT is row-major, THREE.Matrix4 is column-major
  // We need to transpose
  m.set(
    transform.matrix[0], transform.matrix[4], transform.matrix[8], transform.matrix[12],
    transform.matrix[1], transform.matrix[5], transform.matrix[9], transform.matrix[13],
    transform.matrix[2], transform.matrix[6], transform.matrix[10], transform.matrix[14],
    transform.matrix[3], transform.matrix[7], transform.matrix[11], transform.matrix[15]
  );
  return m;
}

/**
 * Detect symmetry from parsed BIOMT assembly information.
 *
 * @param molecule - Molecule with parsed assembly information
 * @param assemblyId - Which assembly to use (default: first one)
 * @returns Detected symmetry or null if no usable symmetry found
 */
export function detectSymmetryFromAssembly(
  molecule: Molecule,
  assemblyId?: string
): DetectedSymmetry | null {
  if (!molecule.assemblies || molecule.assemblies.length === 0) {
    return null;
  }

  // Find the requested assembly or use the first one
  const assembly = assemblyId
    ? molecule.assemblies.find((a) => a.id === assemblyId)
    : molecule.assemblies[0];

  if (!assembly || assembly.transforms.length <= 1) {
    return null; // No symmetry benefit with 1 or fewer transforms
  }

  // Get all unique chain IDs from transforms
  const allChainIds = new Set<string>();
  for (const transform of assembly.transforms) {
    for (const chainId of transform.chainIds) {
      allChainIds.add(chainId);
    }
  }

  // If no chain IDs specified, use all chains in molecule
  let asymmetricUnitChains: string[];
  if (allChainIds.size === 0) {
    asymmetricUnitChains = [...new Set(molecule.atoms.map((a) => a.chainId).filter(Boolean))] as string[];
  } else {
    asymmetricUnitChains = [...allChainIds];
  }

  // Get atom indices for asymmetric unit (first copy's chains)
  const asymmetricUnitAtomIndices: number[] = [];
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    if (asymmetricUnitChains.includes(atom.chainId || '')) {
      asymmetricUnitAtomIndices.push(i);
    }
  }

  // If no atoms match, use all atoms as asymmetric unit
  if (asymmetricUnitAtomIndices.length === 0) {
    for (let i = 0; i < molecule.atoms.length; i++) {
      asymmetricUnitAtomIndices.push(i);
    }
  }

  // Convert transforms to THREE.Matrix4
  const transforms = assembly.transforms.map(assemblyTransformToMatrix4);

  // Detect symmetry type from copy count
  const type = detectSymmetryType(transforms.length);

  // Calculate memory savings
  const totalAtoms = asymmetricUnitAtomIndices.length * transforms.length;
  const actualAtoms = molecule.atoms.length;
  const memorySavings = actualAtoms > 0
    ? 1 - (asymmetricUnitAtomIndices.length / Math.max(actualAtoms, totalAtoms))
    : 0;

  return {
    type,
    copyCount: transforms.length,
    asymmetricUnitAtomIndices,
    transforms,
    asymmetricUnitChains,
    memorySavings: Math.max(0, memorySavings),
  };
}

/**
 * Detect symmetry type from number of copies.
 */
function detectSymmetryType(copyCount: number): SymmetryType {
  if (copyCount === 60) return 'icosahedral';
  if (copyCount === 24) return 'octahedral';
  if (copyCount === 12) return 'tetrahedral';
  if (copyCount >= 2 && copyCount <= 20) return 'cyclic';
  if (copyCount > 20 && copyCount !== 60 && copyCount !== 24) return 'helical';
  return 'none';
}

/**
 * Check if using instancing is worthwhile for this molecule.
 *
 * @param molecule - Molecule to check
 * @param minCopyCount - Minimum copies needed to use instancing (default: 2)
 * @param minMemorySavings - Minimum memory savings fraction (default: 0.3 = 30%)
 */
export function shouldUseInstancing(
  molecule: Molecule,
  minCopyCount: number = 2,
  minMemorySavings: number = 0.3
): boolean {
  const symmetry = detectSymmetryFromAssembly(molecule);
  if (!symmetry) return false;

  return (
    symmetry.copyCount >= minCopyCount &&
    symmetry.memorySavings >= minMemorySavings
  );
}

/**
 * Get asymmetric unit atoms from molecule.
 */
export function getAsymmetricUnitAtoms(
  molecule: Molecule,
  symmetry: DetectedSymmetry
): typeof molecule.atoms {
  return symmetry.asymmetricUnitAtomIndices.map((i) => molecule.atoms[i]);
}

/**
 * Transform a position using a transformation matrix.
 */
export function transformPosition(
  position: { x: number; y: number; z: number },
  matrix: THREE.Matrix4
): THREE.Vector3 {
  const v = new THREE.Vector3(position.x, position.y, position.z);
  v.applyMatrix4(matrix);
  return v;
}

/**
 * Estimate total atom count after applying all transforms.
 */
export function estimateTotalAtomCount(molecule: Molecule): number {
  const symmetry = detectSymmetryFromAssembly(molecule);
  if (!symmetry) return molecule.atoms.length;

  return symmetry.asymmetricUnitAtomIndices.length * symmetry.copyCount;
}

/**
 * Get human-readable description of symmetry.
 */
export function getSymmetryDescription(symmetry: DetectedSymmetry): string {
  const typeNames: Record<SymmetryType, string> = {
    icosahedral: 'Icosahedral (60-fold)',
    helical: 'Helical',
    cyclic: `Cyclic C${symmetry.copyCount}`,
    dihedral: `Dihedral D${symmetry.copyCount / 2}`,
    tetrahedral: 'Tetrahedral (12-fold)',
    octahedral: 'Octahedral (24-fold)',
    crystallographic: 'Crystallographic',
    none: 'No symmetry',
  };

  return `${typeNames[symmetry.type]}, ${symmetry.copyCount} copies, ${Math.round(symmetry.memorySavings * 100)}% memory savings`;
}
