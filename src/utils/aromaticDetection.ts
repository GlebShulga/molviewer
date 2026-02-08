import type { Atom, Bond, AromaticRing, Molecule } from '../types';
import * as THREE from 'three';

interface RingCandidate {
  atomIndices: number[];
}

/**
 * Build adjacency list from bonds.
 */
function buildAdjacencyList(atomCount: number, bonds: Bond[]): Map<number, number[]> {
  const adjacency = new Map<number, number[]>();

  for (let i = 0; i < atomCount; i++) {
    adjacency.set(i, []);
  }

  for (const bond of bonds) {
    adjacency.get(bond.atom1Index)?.push(bond.atom2Index);
    adjacency.get(bond.atom2Index)?.push(bond.atom1Index);
  }

  return adjacency;
}

/**
 * Find all rings of specified sizes using DFS.
 */
function findRings(
  atoms: Atom[],
  bonds: Bond[],
  minSize = 5,
  maxSize = 7
): RingCandidate[] {
  const adjacency = buildAdjacencyList(atoms.length, bonds);
  const rings: RingCandidate[] = [];
  const foundRings = new Set<string>();

  function dfs(
    current: number,
    start: number,
    path: number[],
    depth: number
  ): void {
    if (depth > maxSize) return;

    const neighbors = adjacency.get(current) || [];

    for (const neighbor of neighbors) {
      if (neighbor === start && depth >= minSize) {
        // Found a ring - normalize to detect duplicates
        const ringKey = [...path].sort((a, b) => a - b).join('-');
        if (!foundRings.has(ringKey)) {
          foundRings.add(ringKey);
          rings.push({ atomIndices: [...path] });
        }
      } else if (!path.includes(neighbor) && neighbor > start) {
        // Only explore neighbors with higher index to avoid duplicates
        dfs(neighbor, start, [...path, neighbor], depth + 1);
      }
    }
  }

  // Start DFS from each atom
  for (let i = 0; i < atoms.length; i++) {
    dfs(i, i, [i], 1);
  }

  return rings;
}

/**
 * Check if a ring is aromatic based on atom types.
 * Uses simplified rules: 5-6 membered rings with sp2-hybridizable atoms.
 */
function isAromaticRing(
  ring: RingCandidate,
  atoms: Atom[],
  bonds: Bond[]
): boolean {
  const { atomIndices } = ring;

  // Only consider 5 and 6 membered rings
  if (atomIndices.length < 5 || atomIndices.length > 6) return false;

  // Check if all atoms are sp2 hybridizable (C, N, O, S)
  const aromaticElements = new Set(['C', 'N', 'O', 'S']);
  const allAromaticElements = atomIndices.every(idx =>
    aromaticElements.has(atoms[idx].element)
  );

  if (!allAromaticElements) return false;

  // Check bonds between ring atoms - look for alternating pattern or aromatic flags
  let hasDoubleOrAromaticBond = false;

  for (let i = 0; i < atomIndices.length; i++) {
    const a1 = atomIndices[i];
    const a2 = atomIndices[(i + 1) % atomIndices.length];

    const bond = bonds.find(b =>
      (b.atom1Index === a1 && b.atom2Index === a2) ||
      (b.atom1Index === a2 && b.atom2Index === a1)
    );

    if (bond && (bond.isAromatic || bond.order === 2)) {
      hasDoubleOrAromaticBond = true;
      break;
    }
  }

  // For 6-membered all-carbon rings, assume benzene-like if it has any double bonds
  if (atomIndices.length === 6) {
    const allCarbon = atomIndices.every(idx => atoms[idx].element === 'C');
    if (allCarbon && hasDoubleOrAromaticBond) return true;
  }

  // For 5-membered rings with heteroatom, check for aromatic pattern
  if (atomIndices.length === 5 && hasDoubleOrAromaticBond) {
    const carbonCount = atomIndices.filter(idx => atoms[idx].element === 'C').length;
    const heteroCount = atomIndices.length - carbonCount;
    // Furan, pyrrole, thiophene patterns
    if (carbonCount >= 4 && heteroCount === 1) return true;
  }

  return hasDoubleOrAromaticBond;
}

/**
 * Calculate ring geometry (center, normal, radius).
 */
function calculateRingGeometry(
  atomIndices: number[],
  atoms: Atom[]
): { center: THREE.Vector3; normal: THREE.Vector3; radius: number } {
  // Calculate center
  const center = new THREE.Vector3();
  atomIndices.forEach(idx => {
    center.add(new THREE.Vector3(atoms[idx].x, atoms[idx].y, atoms[idx].z));
  });
  center.divideScalar(atomIndices.length);

  // Calculate normal using Newell's method for better accuracy with non-planar rings
  const normal = new THREE.Vector3();
  for (let i = 0; i < atomIndices.length; i++) {
    const curr = atoms[atomIndices[i]];
    const next = atoms[atomIndices[(i + 1) % atomIndices.length]];

    normal.x += (curr.y - next.y) * (curr.z + next.z);
    normal.y += (curr.z - next.z) * (curr.x + next.x);
    normal.z += (curr.x - next.x) * (curr.y + next.y);
  }
  normal.normalize();

  // Calculate average radius
  let radius = 0;
  atomIndices.forEach(idx => {
    const pos = new THREE.Vector3(atoms[idx].x, atoms[idx].y, atoms[idx].z);
    radius += center.distanceTo(pos);
  });
  radius /= atomIndices.length;

  return { center, normal, radius };
}

/**
 * Main function to detect aromatic rings in a molecule.
 */
export function detectAromaticRings(molecule: Molecule): AromaticRing[] {
  const { atoms, bonds } = molecule;

  if (atoms.length === 0 || bonds.length === 0) {
    return [];
  }

  // Find candidate rings (5-6 membered)
  const candidates = findRings(atoms, bonds, 5, 6);

  // Filter to aromatic rings only
  const aromaticRings: AromaticRing[] = [];

  for (const candidate of candidates) {
    if (isAromaticRing(candidate, atoms, bonds)) {
      const { center, normal, radius } = calculateRingGeometry(candidate.atomIndices, atoms);

      aromaticRings.push({
        atomIndices: candidate.atomIndices,
        center: { x: center.x, y: center.y, z: center.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        radius,
      });
    }
  }

  return aromaticRings;
}
