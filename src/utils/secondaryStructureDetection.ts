import type { Molecule, SecondaryStructure } from '../types';
import { dihedralAngle } from './measurements';
import { chainKey } from './residueAnalysis';

interface BackboneAtoms {
  residueNumber: number;
  chainId: string;
  n?: { x: number; y: number; z: number };
  ca?: { x: number; y: number; z: number };
  c?: { x: number; y: number; z: number };
}

/**
 * Determine secondary structure based on phi/psi angles
 * Ramachandran plot regions:
 * - Alpha helix: phi ≈ -60°, psi ≈ -45° (with tolerance)
 * - Beta sheet: phi ≈ -120°, psi ≈ +120° (with tolerance)
 */
function classifyFromAngles(phi: number, psi: number): SecondaryStructure {
  // Alpha helix region
  const helixPhi = -60;
  const helixPsi = -45;
  const helixTolerance = 40;

  if (
    Math.abs(phi - helixPhi) < helixTolerance &&
    Math.abs(psi - helixPsi) < helixTolerance
  ) {
    return 'helix';
  }

  // Beta sheet region (extended)
  const sheetPhiRange = { min: -180, max: -60 };
  const sheetPsiRange = { min: 90, max: 180 };
  const sheetPsiRange2 = { min: -180, max: -150 }; // wrap-around

  if (
    phi >= sheetPhiRange.min && phi <= sheetPhiRange.max &&
    ((psi >= sheetPsiRange.min && psi <= sheetPsiRange.max) ||
     (psi >= sheetPsiRange2.min && psi <= sheetPsiRange2.max))
  ) {
    return 'sheet';
  }

  return 'coil';
}

/**
 * Key of a residue: chain and number, joined with '|' so a negative number
 * ("A|-3") can't be confused with the separator. Keys are never parsed back.
 */
function residueKeyOf(chainId: string, residueNumber: number): string {
  return `${chainId}|${residueNumber}`;
}

/**
 * Extract backbone atoms (N, CA, C) grouped by residue. Residue 0 counts, a
 * blank chain is chainKey's 'Unknown', and CA is an alpha carbon only when
 * its element is C (a calcium ion is often named CA too).
 */
function extractBackboneAtoms(molecule: Molecule): Map<string, BackboneAtoms> {
  const backboneMap = new Map<string, BackboneAtoms>();

  for (const atom of molecule.atoms) {
    if (atom.residueNumber === undefined || !atom.name) continue;

    const chainId = chainKey(atom);
    const key = residueKeyOf(chainId, atom.residueNumber);
    let backbone = backboneMap.get(key);

    if (!backbone) {
      backbone = {
        residueNumber: atom.residueNumber,
        chainId,
      };
      backboneMap.set(key, backbone);
    }

    const atomName = atom.name.trim().toUpperCase();
    const pos = { x: atom.x, y: atom.y, z: atom.z };

    if (atomName === 'N') backbone.n = pos;
    else if (atomName === 'CA' && atom.element?.toUpperCase() === 'C') backbone.ca = pos;
    else if (atomName === 'C') backbone.c = pos;
  }

  return backboneMap;
}

/**
 * Detect secondary structure using backbone dihedral angles (phi/psi)
 * This is a fallback for PDB files without HELIX/SHEET records.
 *
 * Phi angle: C(i-1) - N(i) - CA(i) - C(i)
 * Psi angle: N(i) - CA(i) - C(i) - N(i+1)
 */
export function detectSecondaryStructure(molecule: Molecule): void {
  // Check if any atoms already have SS assigned
  const hasExistingSS = molecule.atoms.some(a => a.secondaryStructure !== undefined);
  if (hasExistingSS) return;

  const backboneMap = extractBackboneAtoms(molecule);
  const residueSSMap = new Map<string, SecondaryStructure>();

  // Residue keys sorted by chain, then residue number (read from the entries, not from the keys)
  const sortedKeys = Array.from(backboneMap.keys()).sort((a, b) => {
    const ra = backboneMap.get(a)!;
    const rb = backboneMap.get(b)!;
    if (ra.chainId !== rb.chainId) return ra.chainId.localeCompare(rb.chainId);
    return ra.residueNumber - rb.residueNumber;
  });
  const chainOf = (key: string | undefined) => (key === undefined ? undefined : backboneMap.get(key)?.chainId);

  // Calculate phi/psi angles for each residue
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const curr = backboneMap.get(key)!;
    const prevKey = sortedKeys[i - 1];
    const nextKey = sortedKeys[i + 1];

    // Previous and next residue, in the same chain only
    const prev = chainOf(prevKey) === curr.chainId ? backboneMap.get(prevKey) : undefined;
    const next = chainOf(nextKey) === curr.chainId ? backboneMap.get(nextKey) : undefined;

    // Need all atoms present
    if (!curr.n || !curr.ca || !curr.c) {
      residueSSMap.set(key, 'coil');
      continue;
    }

    let phi: number | undefined;
    let psi: number | undefined;

    // Calculate phi if we have previous residue C
    if (prev?.c) {
      phi = dihedralAngle(prev.c, curr.n, curr.ca, curr.c);
    }

    // Calculate psi if we have next residue N
    if (next?.n) {
      psi = dihedralAngle(curr.n, curr.ca, curr.c, next.n);
    }

    // Classify based on angles
    if (phi !== undefined && psi !== undefined) {
      residueSSMap.set(key, classifyFromAngles(phi, psi));
    } else {
      residueSSMap.set(key, 'coil');
    }
  }

  // Smooth the assignments (isolated assignments are likely noise)
  // Require at least 3 consecutive residues for helix, 2 for sheet
  const smoothedSSMap = new Map<string, SecondaryStructure>();

  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const curr = residueSSMap.get(key)!;
    const currChain = chainOf(key);

    // Check neighbors in same chain
    let sameCount = 1;

    // Count consecutive same-type residues
    for (let j = i - 1; j >= 0; j--) {
      const pKey = sortedKeys[j];
      if (chainOf(pKey) !== currChain) break;
      if (residueSSMap.get(pKey) !== curr) break;
      sameCount++;
    }
    for (let j = i + 1; j < sortedKeys.length; j++) {
      const nKey = sortedKeys[j];
      if (chainOf(nKey) !== currChain) break;
      if (residueSSMap.get(nKey) !== curr) break;
      sameCount++;
    }

    // Apply minimum length requirements
    if (curr === 'helix' && sameCount < 3) {
      smoothedSSMap.set(key, 'coil');
    } else if (curr === 'sheet' && sameCount < 2) {
      smoothedSSMap.set(key, 'coil');
    } else {
      smoothedSSMap.set(key, curr);
    }
  }

  // Assign to atoms
  for (const atom of molecule.atoms) {
    if (atom.residueNumber === undefined) continue;
    atom.secondaryStructure = smoothedSSMap.get(residueKeyOf(chainKey(atom), atom.residueNumber));
  }
}
