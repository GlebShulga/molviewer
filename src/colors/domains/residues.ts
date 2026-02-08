/**
 * Amino acid colors based on biochemical properties
 */
export const RESIDUE_PROPERTY_COLORS = {
  /** Hydrophobic residues - warm orange tones */
  hydrophobic: '#ffb347',
  /** Polar uncharged residues - green tones */
  polar: '#98fb98',
  /** Positively charged residues - blue tones */
  positive: '#87ceeb',
  /** Negatively charged residues - red tones */
  negative: '#ff6b6b',
  /** Special residues */
  glycine: '#c0c0c0',
  proline: '#dda0dd',
} as const;

/**
 * Map of residue three-letter codes to property colors
 */
export const RESIDUE_TYPE_COLORS: Record<string, string> = {
  // Hydrophobic
  ALA: RESIDUE_PROPERTY_COLORS.hydrophobic,
  VAL: RESIDUE_PROPERTY_COLORS.hydrophobic,
  LEU: RESIDUE_PROPERTY_COLORS.hydrophobic,
  ILE: RESIDUE_PROPERTY_COLORS.hydrophobic,
  MET: RESIDUE_PROPERTY_COLORS.hydrophobic,
  PHE: RESIDUE_PROPERTY_COLORS.hydrophobic,
  TRP: RESIDUE_PROPERTY_COLORS.hydrophobic,
  // Polar
  SER: RESIDUE_PROPERTY_COLORS.polar,
  THR: RESIDUE_PROPERTY_COLORS.polar,
  ASN: RESIDUE_PROPERTY_COLORS.polar,
  GLN: RESIDUE_PROPERTY_COLORS.polar,
  TYR: RESIDUE_PROPERTY_COLORS.polar,
  CYS: RESIDUE_PROPERTY_COLORS.polar,
  // Positively charged
  LYS: RESIDUE_PROPERTY_COLORS.positive,
  ARG: RESIDUE_PROPERTY_COLORS.positive,
  HIS: RESIDUE_PROPERTY_COLORS.positive,
  // Negatively charged
  ASP: RESIDUE_PROPERTY_COLORS.negative,
  GLU: RESIDUE_PROPERTY_COLORS.negative,
  // Special
  GLY: RESIDUE_PROPERTY_COLORS.glycine,
  PRO: RESIDUE_PROPERTY_COLORS.proline,
};

/**
 * DNA/RNA nucleotide base colors
 */
export const NUCLEOTIDE_COLORS: Record<string, string> = {
  // DNA bases
  DA: '#ff6b6b',  // Adenine - red
  DT: '#87ceeb',  // Thymine - blue
  DC: '#98fb98',  // Cytosine - green
  DG: '#ffb347',  // Guanine - orange
  // RNA bases
  A: '#ff6b6b',
  U: '#87ceeb',   // Uracil replaces Thymine
  C: '#98fb98',
  G: '#ffb347',
};

/**
 * Combined residue colors (amino acids + nucleotides)
 */
export const ALL_RESIDUE_COLORS: Record<string, string> = {
  ...RESIDUE_TYPE_COLORS,
  ...NUCLEOTIDE_COLORS,
};
