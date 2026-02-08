export type SecondaryStructure = 'helix' | 'sheet' | 'coil';

export interface Atom {
  id: number;
  element: string;
  x: number;
  y: number;
  z: number;
  residueName?: string;
  residueNumber?: number;
  chainId?: string;
  serial?: number;
  name?: string;
  occupancy?: number;
  tempFactor?: number;
  secondaryStructure?: SecondaryStructure;
}

export interface Bond {
  atom1Index: number;
  atom2Index: number;
  order: 1 | 2 | 3;
  isAromatic?: boolean;
}

export interface AromaticRing {
  atomIndices: number[];
  center: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  radius: number;
}

/**
 * Biological assembly transformation matrix.
 * Used for symmetric assemblies like virus capsids.
 */
export interface AssemblyTransform {
  /** Assembly ID (e.g., "1", "2") */
  assemblyId: string;
  /** Operator ID within assembly */
  operatorId: number;
  /** Chain IDs this transform applies to */
  chainIds: string[];
  /** 4x4 transformation matrix (row-major, 16 elements) */
  matrix: number[];
}

/**
 * Biological assembly definition.
 */
export interface BiologicalAssembly {
  /** Assembly ID */
  id: string;
  /** Human-readable name (e.g., "complete icosahedral assembly") */
  name?: string;
  /** Transformation operators */
  transforms: AssemblyTransform[];
  /** Total number of copies (transforms.length) */
  copyCount: number;
}

export interface Molecule {
  name: string;
  atoms: Atom[];
  bonds: Bond[];
  aromaticRings?: AromaticRing[];
  /** Biological assembly information from BIOMT records */
  assemblies?: BiologicalAssembly[];
}

export interface AtomSelection {
  atomIds: Set<number>;
}

export interface HoverState {
  atomId: number | null;
  position: { x: number; y: number } | null;
}
