/**
 * UI configuration constants.
 */

export const LAYOUT = {
  sidebarWidth: 300,
  headerHeight: 56,
} as const;

export const ANIMATION = {
  duration: '0.2s',
  easing: 'ease',
} as const;

export const TOOLTIP = {
  offsetX: 10,
  offsetY: 10,
} as const;

export interface SampleMolecule {
  name: string;
  file: string;
  description: string;
  category: 'small-molecule' | 'protein' | 'nucleic-acid' | 'complex';
  /** If fetched from RCSB, store the PDB ID for URL sharing */
  pdbId?: string;
}

export const SAMPLE_MOLECULES: readonly SampleMolecule[] = [
  // Small molecules (bundled locally)
  { name: 'Caffeine', file: '/sample-molecules/caffeine.pdb', description: 'Stimulant alkaloid', category: 'small-molecule' },
  { name: 'Aspirin', file: '/sample-molecules/aspirin.sdf', description: 'Anti-inflammatory drug', category: 'small-molecule' },
  { name: 'Water', file: '/sample-molecules/water.xyz', description: 'H\u2082O molecule', category: 'small-molecule' },
  // Proteins (fetched from RCSB)
  { name: 'Crambin', file: 'rcsb:1CRN', description: 'Small plant protein (46 residues)', category: 'protein', pdbId: '1CRN' },
  { name: 'Ubiquitin', file: 'rcsb:1UBQ', description: 'Regulatory protein (76 residues)', category: 'protein', pdbId: '1UBQ' },
  { name: 'Hemoglobin', file: 'rcsb:4HHB', description: 'Oxygen transport tetramer', category: 'protein', pdbId: '4HHB' },
  { name: 'Lysozyme', file: 'rcsb:1HEW', description: 'Antimicrobial enzyme', category: 'protein', pdbId: '1HEW' },
  // Nucleic acids
  { name: 'B-DNA', file: 'rcsb:1BNA', description: 'Classic DNA double helix', category: 'nucleic-acid', pdbId: '1BNA' },
  // Complexes
  { name: 'SARS-CoV-2 Mpro', file: 'rcsb:6LU7', description: 'COVID main protease with inhibitor', category: 'complex', pdbId: '6LU7' },
] as const;
