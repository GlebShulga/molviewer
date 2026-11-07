import type { Atom, Molecule, SecondaryStructure } from '../types';
import { chainKey, compareResidueIds } from './residueAnalysis';

export interface BackboneResidue {
  residueNumber: number;
  /** Insertion code: 52A follows 52 */
  insertionCode?: string;
  chainId: string;
  residueName: string;
  ca: { x: number; y: number; z: number };
  c?: { x: number; y: number; z: number };
  n?: { x: number; y: number; z: number };
  o?: { x: number; y: number; z: number };
  p?: { x: number; y: number; z: number }; // Phosphate atom for nucleic acids
  secondaryStructure: SecondaryStructure;
  atomIndex: number; // Index of CA/P atom for color reference
}

export interface BackboneChain {
  chainId: string;
  residues: BackboneResidue[];
}

// Nucleic acid residue names
const NUCLEIC_ACID_RESIDUES = new Set([
  'A', 'U', 'G', 'C',           // RNA
  'DA', 'DT', 'DC', 'DG', 'DU', // DNA
]);

/**
 * Extract backbone residues from a molecule.
 * Groups atoms by chain and residue, extracts CA (alpha carbon) positions for proteins
 * and P (phosphate) positions for nucleic acids.
 * Optionally extracts C, N, O for orientation calculations in proteins.
 */
export function extractBackbone(molecule: Molecule): BackboneChain[] {
  // Residues keyed by number and insertion code ("52", "52A")
  const chainMap = new Map<string, Map<string, BackboneResidue>>();

  for (let atomIndex = 0; atomIndex < molecule.atoms.length; atomIndex++) {
    const atom = molecule.atoms[atomIndex];

    // Skip atoms without residue info. Residue 0 is a real residue, and a
    // blank chain is the chain 'Unknown' (chainKey).
    if (atom.residueNumber === undefined || !atom.residueName || !atom.name) {
      continue;
    }

    const chainId = chainKey(atom);
    const resNum = atom.residueNumber;
    const resKey = `${resNum}${atom.insertionCode ?? ''}`;
    const atomName = atom.name.trim().toUpperCase();
    const isNucleicAcid = NUCLEIC_ACID_RESIDUES.has(atom.residueName.toUpperCase());

    // Only process backbone atoms (CA, C, N, O for proteins; P for nucleic acids)
    if (!['CA', 'C', 'N', 'O', 'P'].includes(atomName)) {
      continue;
    }

    // A calcium ion is often named CA too (isBackboneAtom)
    if (atomName === 'CA' && atom.element?.toUpperCase() !== 'C') {
      continue;
    }

    // Skip P atoms for non-nucleic acids
    if (atomName === 'P' && !isNucleicAcid) {
      continue;
    }

    // Get or create chain map
    if (!chainMap.has(chainId)) {
      chainMap.set(chainId, new Map());
    }
    const residueMap = chainMap.get(chainId)!;

    // Get or create residue entry
    if (!residueMap.has(resKey)) {
      residueMap.set(resKey, {
        residueNumber: resNum,
        ...(atom.insertionCode ? { insertionCode: atom.insertionCode } : {}),
        chainId,
        residueName: atom.residueName,
        ca: { x: 0, y: 0, z: 0 },
        secondaryStructure: atom.secondaryStructure || 'coil',
        atomIndex: -1,
      });
    }

    const residue = residueMap.get(resKey)!;
    const pos = { x: atom.x, y: atom.y, z: atom.z };

    switch (atomName) {
      case 'CA':
        residue.ca = pos;
        residue.atomIndex = atomIndex;
        // Update SS from CA atom (most reliable source)
        if (atom.secondaryStructure) {
          residue.secondaryStructure = atom.secondaryStructure;
        }
        break;
      case 'P':
        // Phosphate atom for nucleic acids
        residue.p = pos;
        if (residue.atomIndex < 0) {
          residue.atomIndex = atomIndex;
        }
        break;
      case 'C':
        residue.c = pos;
        break;
      case 'N':
        residue.n = pos;
        break;
      case 'O':
        residue.o = pos;
        break;
    }
  }

  // Convert to sorted arrays
  const chains: BackboneChain[] = [];

  for (const [chainId, residueMap] of chainMap) {
    const residues = Array.from(residueMap.values())
      // Filter out residues without backbone atom (CA for proteins, P for nucleic acids)
      .filter(r => r.atomIndex >= 0 || r.p !== undefined)
      // Sort by residue number, then insertion code
      .sort((a, b) => compareResidueIds(a.residueNumber, a.insertionCode, b.residueNumber, b.insertionCode));

    if (residues.length > 0) {
      chains.push({ chainId, residues });
    }
  }

  // Sort chains alphabetically
  chains.sort((a, b) => a.chainId.localeCompare(b.chainId));

  return chains;
}

/**
 * An atom Cartoon can trace: a protein's alpha carbon, or a nucleotide's
 * phosphorus (as extractBackbone takes P only in nucleic acids). Not a lipid's
 * P (POPC has one), and not a calcium ion, which PDB files also name CA; files
 * without an element column give a protein's CA the element C (the parsers
 * read it from the name).
 */
export function isBackboneAtom(atom: Atom): boolean {
  if (atom.residueNumber === undefined) return false;
  const name = atom.name?.trim().toUpperCase();
  if (name === 'CA') return atom.element?.toUpperCase() === 'C';
  if (name === 'P') return NUCLEIC_ACID_RESIDUES.has(atom.residueName?.toUpperCase() ?? '');
  return false;
}

/**
 * Check if a molecule has backbone data suitable for cartoon representation:
 * any atom Cartoon can trace (isBackboneAtom). Stops at the first one.
 */
export function hasBackboneData(molecule: Molecule): boolean {
  return molecule.atoms.some(isBackboneAtom);
}
