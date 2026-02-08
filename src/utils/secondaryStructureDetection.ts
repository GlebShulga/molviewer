import type { Molecule, SecondaryStructure } from '../types';

interface BackboneAtoms {
  residueNumber: number;
  chainId: string;
  n?: { x: number; y: number; z: number };
  ca?: { x: number; y: number; z: number };
  c?: { x: number; y: number; z: number };
}

/**
 * Calculate dihedral angle (in degrees) between four points
 */
function calculateDihedral(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  p3: { x: number; y: number; z: number },
  p4: { x: number; y: number; z: number }
): number {
  // Vectors
  const b1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
  const b2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
  const b3 = { x: p4.x - p3.x, y: p4.y - p3.y, z: p4.z - p3.z };

  // Cross products
  const n1 = {
    x: b1.y * b2.z - b1.z * b2.y,
    y: b1.z * b2.x - b1.x * b2.z,
    z: b1.x * b2.y - b1.y * b2.x,
  };
  const n2 = {
    x: b2.y * b3.z - b2.z * b3.y,
    y: b2.z * b3.x - b2.x * b3.z,
    z: b2.x * b3.y - b2.y * b3.x,
  };

  // Normalize
  const n1Len = Math.sqrt(n1.x * n1.x + n1.y * n1.y + n1.z * n1.z);
  const n2Len = Math.sqrt(n2.x * n2.x + n2.y * n2.y + n2.z * n2.z);

  if (n1Len < 0.0001 || n2Len < 0.0001) return 0;

  n1.x /= n1Len; n1.y /= n1Len; n1.z /= n1Len;
  n2.x /= n2Len; n2.y /= n2Len; n2.z /= n2Len;

  // Dot product for cos(angle)
  const cosAngle = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;

  // Calculate sign using cross product
  const b2Len = Math.sqrt(b2.x * b2.x + b2.y * b2.y + b2.z * b2.z);
  const b2Norm = { x: b2.x / b2Len, y: b2.y / b2Len, z: b2.z / b2Len };
  const m = n1.y * b2Norm.z - n1.z * b2Norm.y;
  const sinSign = n2.x * m + n2.y * (n1.z * b2Norm.x - n1.x * b2Norm.z) + n2.z * (n1.x * b2Norm.y - n1.y * b2Norm.x);

  const angle = Math.atan2(sinSign, cosAngle);
  return angle * (180 / Math.PI);
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
 * Extract backbone atoms (N, CA, C) grouped by residue
 */
function extractBackboneAtoms(molecule: Molecule): Map<string, BackboneAtoms> {
  const backboneMap = new Map<string, BackboneAtoms>();

  for (const atom of molecule.atoms) {
    if (!atom.residueNumber || !atom.chainId || !atom.name) continue;

    const key = `${atom.chainId}-${atom.residueNumber}`;
    let backbone = backboneMap.get(key);

    if (!backbone) {
      backbone = {
        residueNumber: atom.residueNumber,
        chainId: atom.chainId,
      };
      backboneMap.set(key, backbone);
    }

    const atomName = atom.name.trim().toUpperCase();
    const pos = { x: atom.x, y: atom.y, z: atom.z };

    if (atomName === 'N') backbone.n = pos;
    else if (atomName === 'CA') backbone.ca = pos;
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

  // Get sorted residue keys by chain and residue number
  const sortedKeys = Array.from(backboneMap.keys()).sort((a, b) => {
    const [chainA, resNumA] = a.split('-');
    const [chainB, resNumB] = b.split('-');
    if (chainA !== chainB) return chainA.localeCompare(chainB);
    return parseInt(resNumA) - parseInt(resNumB);
  });

  // Calculate phi/psi angles for each residue
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const curr = backboneMap.get(key)!;
    const prevKey = sortedKeys[i - 1];
    const nextKey = sortedKeys[i + 1];

    // Get previous residue (same chain)
    const prev = prevKey?.startsWith(curr.chainId + '-')
      ? backboneMap.get(prevKey)
      : undefined;

    // Get next residue (same chain)
    const next = nextKey?.startsWith(curr.chainId + '-')
      ? backboneMap.get(nextKey)
      : undefined;

    // Need all atoms present
    if (!curr.n || !curr.ca || !curr.c) {
      residueSSMap.set(key, 'coil');
      continue;
    }

    let phi: number | undefined;
    let psi: number | undefined;

    // Calculate phi if we have previous residue C
    if (prev?.c) {
      phi = calculateDihedral(prev.c, curr.n, curr.ca, curr.c);
    }

    // Calculate psi if we have next residue N
    if (next?.n) {
      psi = calculateDihedral(curr.n, curr.ca, curr.c, next.n);
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
    const currChain = key.split('-')[0];

    // Check neighbors in same chain
    let sameCount = 1;

    // Count consecutive same-type residues
    for (let j = i - 1; j >= 0; j--) {
      const pKey = sortedKeys[j];
      if (!pKey.startsWith(currChain + '-')) break;
      if (residueSSMap.get(pKey) !== curr) break;
      sameCount++;
    }
    for (let j = i + 1; j < sortedKeys.length; j++) {
      const nKey = sortedKeys[j];
      if (!nKey.startsWith(currChain + '-')) break;
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
    if (!atom.residueNumber || !atom.chainId) continue;
    const key = `${atom.chainId}-${atom.residueNumber}`;
    atom.secondaryStructure = smoothedSSMap.get(key);
  }
}
