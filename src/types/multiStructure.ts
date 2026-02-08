import type { Molecule } from './molecule';
import type { MoleculeClassification, ComponentSettings } from '../utils/moleculeTypeClassifier';

export type RepresentationType = 'ball-and-stick' | 'stick' | 'spacefill' | 'cartoon' | 'surface-vdw' | 'surface-sas';
export type ColorScheme = 'cpk' | 'chain' | 'residueType' | 'bfactor' | 'rainbow' | 'secondaryStructure';
export type MeasurementMode = 'none' | 'distance' | 'angle' | 'dihedral';
export type LayoutMode = 'overlay' | 'side-by-side';

// Maximum number of structures allowed for performance
export const MAX_STRUCTURES = 10;

/**
 * Qualified atom reference - references an atom within a specific structure
 */
export interface QualifiedAtomRef {
  structureId: string;
  atomIndex: number;
}

/**
 * A single molecular structure with its own settings
 */
export interface Structure {
  id: string;
  name: string;
  molecule: Molecule;
  visible: boolean;
  representation: RepresentationType;
  colorScheme: ColorScheme;
  componentSettings: ComponentSettings[];
  classification: MoleculeClassification | null;
  aromaticRingsDetected: boolean;
  /** Position offset for side-by-side layout */
  offset: [number, number, number];
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  atomIndex: number | null;
  structureId?: string;
  chainId?: string;
  residueName?: string;
  residueNumber?: number;
}

export interface Label3D {
  id: string;
  structureId: string;
  atomIndex: number;
  text: string;
}
