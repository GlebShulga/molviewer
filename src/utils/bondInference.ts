import type { Atom, Bond } from '../types';
import { getCovalentRadius } from '../constants';
import { PARSER_CONFIG } from '../config';
import { SpatialHashGrid } from './spatialIndex';

/**
 * Maximum possible bond length for spatial indexing.
 * Based on largest covalent radii (Cs ~2.6Å) + tolerance.
 */
const MAX_BOND_LENGTH = 3.5;

/**
 * Threshold for switching to spatial indexing.
 * Below this, O(n²) is fast enough and avoids grid overhead.
 */
const SPATIAL_INDEX_THRESHOLD = 500;

/**
 * Infers bonds between atoms based on distance and covalent radii.
 * Two atoms are considered bonded if their distance is less than
 * the sum of their covalent radii plus a tolerance value.
 *
 * Uses spatial hashing for O(n) performance on large molecules (>500 atoms).
 * Falls back to O(n²) for small molecules where grid overhead isn't worth it.
 */
export function inferBondsFromDistance(
  atoms: Atom[],
  tolerance: number = PARSER_CONFIG.bondTolerance
): Bond[] {
  // Use spatial indexing for large molecules
  if (atoms.length > SPATIAL_INDEX_THRESHOLD) {
    return inferBondsWithSpatialIndex(atoms, tolerance);
  }

  // O(n²) for small molecules - avoids grid construction overhead
  return inferBondsNaive(atoms, tolerance);
}

/**
 * O(n) bond inference using spatial hash grid.
 * Each atom only checks neighbors within MAX_BOND_LENGTH.
 */
function inferBondsWithSpatialIndex(
  atoms: Atom[],
  tolerance: number
): Bond[] {
  const bonds: Bond[] = [];
  const bondSet = new Set<string>();
  const minDistance = PARSER_CONFIG.minBondDistance;

  // Build spatial index with cell size = max bond length
  const grid = new SpatialHashGrid(MAX_BOND_LENGTH);
  grid.build(atoms);

  for (let i = 0; i < atoms.length; i++) {
    const atom1 = atoms[i];
    const radius1 = getCovalentRadius(atom1.element);

    // Only check nearby atoms (O(1) per atom on average)
    const neighbors = grid.getNeighbors(i, MAX_BOND_LENGTH);

    for (const j of neighbors) {
      // Only process each pair once (i < j)
      if (j <= i) continue;

      const atom2 = atoms[j];
      const radius2 = getCovalentRadius(atom2.element);

      const dx = atom1.x - atom2.x;
      const dy = atom1.y - atom2.y;
      const dz = atom1.z - atom2.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const maxBondLength = radius1 + radius2 + tolerance;

      if (distance > minDistance && distance <= maxBondLength) {
        const bondKey = `${i}-${j}`;
        if (!bondSet.has(bondKey)) {
          bondSet.add(bondKey);
          bonds.push({
            atom1Index: i,
            atom2Index: j,
            order: 1,
          });
        }
      }
    }
  }

  return bonds;
}

/**
 * O(n²) bond inference for small molecules.
 * Simple and has no overhead for small atom counts.
 */
function inferBondsNaive(
  atoms: Atom[],
  tolerance: number
): Bond[] {
  const bonds: Bond[] = [];
  const bondSet = new Set<string>();
  const minDistance = PARSER_CONFIG.minBondDistance;

  for (let i = 0; i < atoms.length; i++) {
    const atom1 = atoms[i];
    const radius1 = getCovalentRadius(atom1.element);

    for (let j = i + 1; j < atoms.length; j++) {
      const atom2 = atoms[j];
      const radius2 = getCovalentRadius(atom2.element);

      const dx = atom1.x - atom2.x;
      const dy = atom1.y - atom2.y;
      const dz = atom1.z - atom2.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const maxBondLength = radius1 + radius2 + tolerance;

      if (distance > minDistance && distance <= maxBondLength) {
        const bondKey = `${i}-${j}`;
        if (!bondSet.has(bondKey)) {
          bondSet.add(bondKey);
          bonds.push({
            atom1Index: i,
            atom2Index: j,
            order: 1,
          });
        }
      }
    }
  }

  return bonds;
}
