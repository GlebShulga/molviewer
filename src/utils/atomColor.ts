import type { Atom, Molecule } from '../types';
import type { ColorScheme } from '../store/moleculeStore';
import {
  getElementColor,
  getChainColor,
  ALL_RESIDUE_COLORS,
  SECONDARY_STRUCTURE_COLORS,
  RAINBOW_ENDPOINTS,
} from '../colors';

/**
 * Get color based on residue type (amino acid properties)
 * Falls back to CPK coloring for non-protein atoms
 */
function getResidueTypeColor(atom: Atom): string | null {
  if (!atom.residueName) return null;
  return ALL_RESIDUE_COLORS[atom.residueName.toUpperCase()] ?? null;
}

/**
 * Get color based on B-factor (temperature factor)
 * Blue (low) -> White (mid) -> Red (high)
 * Returns null for atoms without B-factor data (falls back to CPK)
 */
function getBFactorColor(atom: Atom, minBfactor: number, maxBfactor: number): string | null {
  if (atom.tempFactor === undefined) return null;

  const range = maxBfactor - minBfactor;
  if (range === 0) return '#ffffff';

  const normalized = (atom.tempFactor - minBfactor) / range;

  // Blue (0) -> White (0.5) -> Red (1)
  let r: number, g: number, b: number;

  if (normalized < 0.5) {
    // Blue to White
    const t = normalized * 2;
    r = Math.round(t * 255);
    g = Math.round(t * 255);
    b = 255;
  } else {
    // White to Red
    const t = (normalized - 0.5) * 2;
    r = 255;
    g = Math.round((1 - t) * 255);
    b = Math.round((1 - t) * 255);
  }

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get rainbow color based on residue sequence (N-terminus blue to C-terminus red)
 * Returns null for atoms without residue number (falls back to CPK)
 */
function getRainbowColor(atom: Atom, minResNum: number, maxResNum: number): string | null {
  if (atom.residueNumber === undefined) return null;

  const range = maxResNum - minResNum;
  if (range === 0) return RAINBOW_ENDPOINTS.cTerminus;

  const normalized = (atom.residueNumber - minResNum) / range;

  // HSL color wheel: 240 (blue) -> 0 (red)
  const hue = 240 * (1 - normalized);
  return `hsl(${hue}, 100%, 50%)`;
}

/**
 * Get color based on secondary structure type
 * Returns null for atoms without secondary structure data
 */
function getSecondaryStructureColor(atom: Atom): string | null {
  if (!atom.secondaryStructure) return null;
  return SECONDARY_STRUCTURE_COLORS[atom.secondaryStructure as keyof typeof SECONDARY_STRUCTURE_COLORS] ?? null;
}

export interface ColorSchemeContext {
  minBfactor?: number;
  maxBfactor?: number;
  minResNum?: number;
  maxResNum?: number;
  hasResidueData?: boolean;
  hasBfactorData?: boolean;
  hasResidueNumbers?: boolean;
  hasSecondaryStructure?: boolean;
  hasBackboneData?: boolean;
}

/**
 * Calculate color scheme context from molecule data
 */
export function calculateColorSchemeContext(molecule: Molecule): ColorSchemeContext {
  let minBfactor = Infinity;
  let maxBfactor = -Infinity;
  let minResNum = Infinity;
  let maxResNum = -Infinity;
  let hasResidueData = false;
  let hasBfactorData = false;
  let hasResidueNumbers = false;
  let hasSecondaryStructure = false;
  let hasBackboneData = false;

  for (const atom of molecule.atoms) {
    if (atom.tempFactor !== undefined) {
      hasBfactorData = true;
      minBfactor = Math.min(minBfactor, atom.tempFactor);
      maxBfactor = Math.max(maxBfactor, atom.tempFactor);
    }
    if (atom.residueNumber !== undefined) {
      hasResidueNumbers = true;
      minResNum = Math.min(minResNum, atom.residueNumber);
      maxResNum = Math.max(maxResNum, atom.residueNumber);
    }
    if (atom.residueName && ALL_RESIDUE_COLORS[atom.residueName.toUpperCase()]) {
      hasResidueData = true;
    }
    if (atom.secondaryStructure !== undefined) {
      hasSecondaryStructure = true;
    }
    // Check for backbone atoms (CA for proteins, P for nucleic acids - needed for cartoon representation)
    const atomName = atom.name?.trim().toUpperCase();
    if ((atomName === 'CA' || atomName === 'P') && atom.residueNumber !== undefined) {
      hasBackboneData = true;
    }
  }

  // B-factor coloring only makes sense if there's actual variation in values
  // (all zeros or uniform values means no meaningful data)
  const hasMeaningfulBfactorData = hasBfactorData && minBfactor !== maxBfactor;

  return {
    minBfactor: minBfactor === Infinity ? 0 : minBfactor,
    maxBfactor: maxBfactor === -Infinity ? 100 : maxBfactor,
    minResNum: minResNum === Infinity ? 1 : minResNum,
    maxResNum: maxResNum === -Infinity ? 1 : maxResNum,
    hasResidueData,
    hasBfactorData: hasMeaningfulBfactorData,
    hasResidueNumbers,
    hasSecondaryStructure,
    hasBackboneData,
  };
}

/**
 * Returns the appropriate color for an atom based on the color scheme.
 * Falls back to CPK (element-based) coloring when scheme-specific data is unavailable.
 */
export function getAtomColor(
  atom: Atom,
  colorScheme: ColorScheme,
  context?: ColorSchemeContext
): string {
  const cpkColor = getElementColor(atom.element);

  switch (colorScheme) {
    case 'chain':
      return getChainColor(atom.chainId);
    case 'residueType':
      return getResidueTypeColor(atom) ?? cpkColor;
    case 'bfactor':
      return getBFactorColor(
        atom,
        context?.minBfactor ?? 0,
        context?.maxBfactor ?? 100
      ) ?? cpkColor;
    case 'rainbow':
      return getRainbowColor(
        atom,
        context?.minResNum ?? 1,
        context?.maxResNum ?? 100
      ) ?? cpkColor;
    case 'secondaryStructure':
      return getSecondaryStructureColor(atom) ?? cpkColor;
    case 'cpk':
    default:
      return cpkColor;
  }
}
