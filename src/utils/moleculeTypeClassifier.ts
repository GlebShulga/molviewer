import type { Atom, Molecule } from '../types';
import type { RepresentationType, ColorScheme } from '../store/moleculeStore';
import { isAminoAcid, analyzeResidues, type Residue } from './residueAnalysis';

export type MoleculeComponentType = 'protein' | 'dna' | 'rna' | 'ligand' | 'water' | 'ion';

export interface MoleculeComponent {
  type: MoleculeComponentType;
  atomIndices: number[];
  residueFilter?: Set<string>; // For Cartoon filtering: "chainId:residueNumber"
}

export interface MoleculeClassification {
  components: MoleculeComponent[];
  primaryType: MoleculeComponentType;
  hasMultipleTypes: boolean;
}

export interface ComponentSettings {
  type: MoleculeComponentType;
  atomIndices: number[];
  residueFilter?: Set<string>; // For Cartoon
  representation: RepresentationType;
  colorScheme: ColorScheme;
  visible: boolean;
}

// DNA residue names (unambiguous deoxy-nucleotides)
const DNA_RESIDUES = new Set(['DA', 'DT', 'DC', 'DG', 'DU']);

// RNA residue names (need additional validation)
const RNA_RESIDUES = new Set(['A', 'U', 'C', 'G']);

// Water residue names
const WATER_RESIDUES = new Set(['HOH', 'WAT', 'H2O', 'SOL', 'TIP', 'TIP3', 'TIP4', 'SPC']);

// Ion elements
const ION_ELEMENTS = new Set([
  'Na', 'Cl', 'K', 'Ca', 'Mg', 'Zn', 'Fe', 'Mn', 'Cu', 'Co', 'Ni',
  'Br', 'I', 'Li', 'Cd', 'Hg'
]);

/**
 * Check if a residue is RNA by looking for nucleotide backbone atoms
 */
function isRNAResidue(residueAtoms: Atom[], residueName: string): boolean {
  if (!RNA_RESIDUES.has(residueName.toUpperCase())) return false;

  // Must have phosphate backbone (P atom) OR ribose atoms (O2', C1', etc.)
  const hasPhosphate = residueAtoms.some(a => a.name === 'P');
  const hasRibose = residueAtoms.some(a =>
    a.name?.includes("'") || // O2', O3', O5', C1', etc.
    a.name === 'O2*' || a.name === 'O3*' // Alternative naming
  );

  return hasPhosphate || hasRibose;
}

/**
 * Check if a residue is an ion (single-atom residue with ion element)
 */
function isIon(residueAtoms: Atom[]): boolean {
  if (residueAtoms.length !== 1) return false;
  return ION_ELEMENTS.has(residueAtoms[0].element);
}

/**
 * Check if a residue is water
 */
function isWater(residueName: string): boolean {
  return WATER_RESIDUES.has(residueName.toUpperCase());
}

/**
 * Check if a residue is DNA
 */
function isDNA(residueName: string): boolean {
  return DNA_RESIDUES.has(residueName.toUpperCase());
}

/**
 * Classify a residue into a molecule component type
 */
function classifyResidue(residue: Residue): MoleculeComponentType {
  const residueName = residue.name.toUpperCase();

  // Check in order of specificity
  if (isWater(residueName)) return 'water';
  if (isIon(residue.atoms)) return 'ion';
  if (isDNA(residueName)) return 'dna';
  if (isRNAResidue(residue.atoms, residueName)) return 'rna';
  if (isAminoAcid(residueName)) return 'protein';

  // Fallback to ligand for unknown residues
  return 'ligand';
}

/**
 * Classify a molecule into its component types
 */
export function classifyMolecule(molecule: Molecule): MoleculeClassification {
  const chains = analyzeResidues(molecule.atoms);

  // Group atoms by component type
  const componentMap = new Map<MoleculeComponentType, {
    atomIndices: number[];
    residueKeys: Set<string>;
  }>();

  // Initialize all component types
  const types: MoleculeComponentType[] = ['protein', 'dna', 'rna', 'ligand', 'water', 'ion'];
  for (const type of types) {
    componentMap.set(type, { atomIndices: [], residueKeys: new Set() });
  }

  // Build a map from atom index to original molecule index
  // Since analyzeResidues uses atoms array, the startIndex should correspond to the original index
  for (const chain of chains) {
    for (const residue of chain.residues) {
      const type = classifyResidue(residue);
      const component = componentMap.get(type)!;

      // Add atom indices for this residue
      for (let i = 0; i < residue.atoms.length; i++) {
        component.atomIndices.push(residue.startIndex + i);
      }

      // Add residue key for Cartoon filtering
      component.residueKeys.add(`${residue.chainId}:${residue.number}`);
    }
  }

  // Build components array (only include non-empty components)
  const components: MoleculeComponent[] = [];
  let maxCount = 0;
  let primaryType: MoleculeComponentType = 'ligand';

  for (const [type, data] of componentMap) {
    if (data.atomIndices.length > 0) {
      components.push({
        type,
        atomIndices: data.atomIndices,
        residueFilter: data.residueKeys.size > 0 ? data.residueKeys : undefined,
      });

      // Track primary type (most atoms)
      if (data.atomIndices.length > maxCount) {
        maxCount = data.atomIndices.length;
        primaryType = type;
      }
    }
  }

  // Determine if we have multiple distinct types
  // (water and ions don't count as "multiple types" by themselves)
  const significantTypes = components.filter(c =>
    c.type !== 'water' && c.type !== 'ion' && c.atomIndices.length > 0
  );
  const hasMultipleTypes = significantTypes.length > 1;

  return {
    components,
    primaryType,
    hasMultipleTypes,
  };
}

/**
 * Priority order for determining primary type when multiple types exist
 */
const TYPE_PRIORITY: MoleculeComponentType[] = ['protein', 'dna', 'rna', 'ligand', 'ion', 'water'];

/**
 * Get the component with the highest priority (for determining overall molecule type)
 */
export function getPrimaryComponent(classification: MoleculeClassification): MoleculeComponent | null {
  for (const type of TYPE_PRIORITY) {
    const component = classification.components.find(c => c.type === type);
    if (component && component.atomIndices.length > 0) {
      return component;
    }
  }
  return classification.components[0] || null;
}