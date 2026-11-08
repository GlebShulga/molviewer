import type { Atom, Molecule } from '../types';
import type { RepresentationType, ColorScheme } from '../store/moleculeStore';
import {
  isAminoAcid,
  isWater,
  analyzeResidues,
  residueKey,
  DNA_RESIDUES,
  RNA_RESIDUES,
  NUCLEIC_ACID_RESIDUES,
  type Residue,
} from './residueAnalysis';
import { hasBackboneData, isAlphaCarbon } from './backboneExtraction';
import { SMART_DEFAULTS, CARTOON_FALLBACK_REPRESENTATION } from '../config/smartDefaults';
import { normalizeElementSymbol } from '../constants';
import { availableColor, isComponentStyleLimited } from './representationAvailability';
import { calculateColorSchemeContext, type ColorSchemeContext } from './atomColor';

export type MoleculeComponentType = 'protein' | 'dna' | 'rna' | 'ligand' | 'water' | 'ion';

export interface MoleculeComponent {
  type: MoleculeComponentType;
  atomIndices: number[];
  residueFilter?: Set<string>; // For Cartoon filtering: residueKey(), e.g. "A:52A"
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
  // XYZ files keep symbols as written ("ZN"); the set holds "Zn"
  return ION_ELEMENTS.has(normalizeElementSymbol(residueAtoms[0].element));
}

/**
 * Check if a residue is DNA
 */
function isDNA(residueName: string): boolean {
  return DNA_RESIDUES.has(residueName.toUpperCase());
}

/** Longest N-C distance read as a peptide bond (1.33 Å in proteins). */
const PEPTIDE_BOND_MAX = 2.0;

function named(atom: Atom, name: string): boolean {
  return atom.name?.trim().toUpperCase() === name;
}

function withinPeptideBond(a: Atom, b: Atom): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz <= PEPTIDE_BOND_MAX * PEPTIDE_BOND_MAX;
}

/**
 * Whether a residue that isn't one of the 20 standard amino acids is part
 * of a peptide chain: modified (MSE) and simulation-named (HIE, CYX) amino
 * acids, and the residues of non-standard peptides (cyclosporin, D-peptides).
 * It needs atoms named N and C, an alpha carbon, and a peptide bond: its N
 * within PEPTIDE_BOND_MAX of a C of the residue just before it in the file,
 * or its C of an N of the residue just after it. The bond keeps out ligands
 * with amino-acid atom names (SAM, SAH), which Cartoon would drop as a lone
 * residue, so nothing would draw them.
 * File order, not residue numbers, so chainless segments that restart their
 * numbering link too; distance, not molecule.bonds, so sessions saved by
 * builds that skipped bond inference for files with CONECT records classify
 * the same.
 */
function inPeptideChain(
  residue: Residue,
  atoms: Atom[],
  residueOfAtom: (index: number) => Residue | undefined
): boolean {
  if (NUCLEIC_ACID_RESIDUES.has(residue.name.toUpperCase())) return false;
  if (
    !residue.atoms.some((a) => named(a, 'N')) ||
    !residue.atoms.some((a) => named(a, 'C')) ||
    !residue.atoms.some(isAlphaCarbon)
  ) {
    return false;
  }
  // The residue the file lists next to atom `index`, `step` -1 (before) or +1 (after)
  const neighbour = (index: number, step: number): Residue | undefined => {
    let i = index + step;
    while (i >= 0 && i < atoms.length && residueOfAtom(i) === residue) i += step;
    return i >= 0 && i < atoms.length ? residueOfAtom(i) : undefined;
  };
  for (const index of residue.atomIndices) {
    const atom = atoms[index];
    const [step, partner] = named(atom, 'N') ? [-1, 'C'] : named(atom, 'C') ? [1, 'N'] : [0, ''];
    if (!step) continue;
    const other = neighbour(index, step);
    if (other?.atoms.some((a) => named(a, partner) && withinPeptideBond(a, atom))) return true;
  }
  return false;
}

/**
 * Classify a residue into a molecule component type
 */
function classifyResidue(residue: Residue, peptideLinked: (residue: Residue) => boolean): MoleculeComponentType {
  const residueName = residue.name.toUpperCase();

  // Check in order of specificity
  if (isWater(residueName)) return 'water';
  if (isIon(residue.atoms)) return 'ion';
  if (isDNA(residueName)) return 'dna';
  if (isRNAResidue(residue.atoms, residueName)) return 'rna';
  if (isAminoAcid(residueName) || peptideLinked(residue)) return 'protein';

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

  // Which residue each atom is in, for the peptide-link check: built only
  // when a residue needs it (a residue outside the 20 standard amino acids)
  let residueAt: (Residue | undefined)[] | undefined;
  const residueOfAtom = (index: number): Residue | undefined => {
    if (!residueAt) {
      residueAt = new Array<Residue | undefined>(molecule.atoms.length);
      for (const chain of chains) {
        for (const residue of chain.residues) {
          for (const i of residue.atomIndices) residueAt[i] = residue;
        }
      }
    }
    return residueAt[index];
  };
  const peptideLinked = (residue: Residue) => inPeptideChain(residue, molecule.atoms, residueOfAtom);

  for (const chain of chains) {
    for (const residue of chain.residues) {
      const type = classifyResidue(residue, peptideLinked);
      const component = componentMap.get(type)!;

      // Add atom indices for this residue (not contiguous when the file splits it).
      // A loop, not push(...): an XYZ file is one residue of every atom, and
      // spreading 150k+ arguments overflows the call stack.
      for (const index of residue.atomIndices) component.atomIndices.push(index);

      // Add residue key for Cartoon filtering
      component.residueKeys.add(residueKey(residue.chainId, residue.number, residue.insertionCode));
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
/**
 * Component settings for a classification, with the smart defaults for each
 * type. Cartoon falls back when the molecule has no backbone to trace, for
 * every polymer (protein, DNA, RNA), and so does a color scheme the buttons
 * would grey out for the style shown instead (availableColor): a protein's
 * Secondary structure without a backbone or helix and sheet records.
 */
export function generateComponentSettings(
  classification: MoleculeClassification,
  molecule: Molecule
): ComponentSettings[] {
  const hasBB = hasBackboneData(molecule);
  // Walks every atom: computed once, and only when Cartoon fell back
  let colorContext: ColorSchemeContext | undefined;
  return classification.components.map((component) => {
    const defaults = SMART_DEFAULTS[component.type];
    const cartoonFellBack = defaults.representation === 'cartoon' && !hasBB;
    let representation = cartoonFellBack ? CARTOON_FALLBACK_REPRESENTATION : defaults.representation;
    // What would start in Ball & Stick or Stick over the atom-style limit
    // starts in Spacefill instead (styleLimitFallback). Without a backbone
    // the whole structure counts, as the buttons count it (ligands, and a
    // protein Cartoon can't trace). With one the polymer is in Cartoon, and
    // a ligand set beside it counts its own atoms: a few ligands stay in
    // Ball & Stick, a set over the limit is drawn in Spacefill.
    const atomCount = hasBB ? component.atomIndices.length : molecule.atoms.length;
    if (isComponentStyleLimited(representation, atomCount)) {
      representation = 'spacefill';
    }
    const colorScheme = cartoonFellBack
      ? availableColor(defaults.colorScheme, representation, (colorContext ??= calculateColorSchemeContext(molecule)))
      : defaults.colorScheme;
    return {
      type: component.type,
      atomIndices: component.atomIndices,
      residueFilter: component.residueFilter,
      representation,
      colorScheme,
      visible: defaults.visible,
    };
  });
}

/** The parts of a component's settings a user chooses (and a session or share link keeps). */
export type ComponentStyle = Pick<ComponentSettings, 'type' | 'representation' | 'colorScheme' | 'visible'>;

/** A component's style alone, as sessions and share links store it (atom lists come from the molecule on load). */
export function componentStyle(cs: ComponentStyle): ComponentStyle {
  return { type: cs.type, representation: cs.representation, colorScheme: cs.colorScheme, visible: cs.visible };
}

/**
 * Fresh settings (from classifying the molecule as loaded now) with the
 * saved style of each type that still exists. Atom lists and the residue
 * filter always come from the fresh classification; for a type saved twice
 * the first entry wins; saved types the molecule no longer has are dropped.
 */
export function mergeComponentSettings(fresh: ComponentSettings[], saved: ComponentStyle[]): ComponentSettings[] {
  return fresh.map((cs) => {
    const style = saved.find((s) => s.type === cs.type);
    return style
      ? { ...cs, representation: style.representation, colorScheme: style.colorScheme, visible: style.visible }
      : cs;
  });
}

/** Classify a molecule and merge a saved style into the result. */
export function restoreComponentSettings(
  molecule: Molecule,
  saved: ComponentStyle[]
): { classification: MoleculeClassification; componentSettings: ComponentSettings[] } {
  const classification = classifyMolecule(molecule);
  return {
    classification,
    componentSettings: mergeComponentSettings(generateComponentSettings(classification, molecule), saved),
  };
}
