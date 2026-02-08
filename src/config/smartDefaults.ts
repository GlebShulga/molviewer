import type { RepresentationType, ColorScheme } from '../store/moleculeStore';
import type { MoleculeComponentType } from '../utils/moleculeTypeClassifier';

export interface SmartDefaultConfig {
  representation: RepresentationType;
  colorScheme: ColorScheme;
  visible: boolean;
}

/**
 * Default visualization settings for each molecule component type
 */
export const SMART_DEFAULTS: Record<MoleculeComponentType, SmartDefaultConfig> = {
  protein: {
    representation: 'cartoon',
    colorScheme: 'secondaryStructure',
    visible: true,
  },
  dna: {
    representation: 'cartoon',
    colorScheme: 'rainbow',
    visible: true,
  },
  rna: {
    representation: 'cartoon',
    colorScheme: 'rainbow',
    visible: true,
  },
  ligand: {
    representation: 'ball-and-stick',
    colorScheme: 'cpk',
    visible: true,
  },
  water: {
    representation: 'spacefill',
    colorScheme: 'cpk',
    visible: false, // Hidden by default - water often comprises 50%+ of atoms
  },
  ion: {
    representation: 'spacefill',
    colorScheme: 'cpk',
    visible: true,
  },
};

/**
 * Fallback representation when Cartoon is not available (no backbone data)
 */
export const CARTOON_FALLBACK_REPRESENTATION: RepresentationType = 'ball-and-stick';

/**
 * Display names for component types (for UI)
 */
export const COMPONENT_TYPE_LABELS: Record<MoleculeComponentType, string> = {
  protein: 'Protein',
  dna: 'DNA',
  rna: 'RNA',
  ligand: 'Ligand',
  water: 'Water',
  ion: 'Ions',
};

/**
 * Order of component types in UI
 */
export const COMPONENT_TYPE_ORDER: MoleculeComponentType[] = [
  'protein',
  'dna',
  'rna',
  'ligand',
  'ion',
  'water',
];
