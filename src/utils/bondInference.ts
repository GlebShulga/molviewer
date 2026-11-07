import type { Atom, Bond } from '../types';
import { getCovalentRadius, normalizeElementSymbol } from '../constants';
import { PARSER_CONFIG } from '../config';
import { SpatialHashGrid } from './spatialIndex';

/**
 * Threshold for switching to spatial indexing.
 * Below this, O(n²) is fast enough and avoids grid overhead.
 */
const SPATIAL_INDEX_THRESHOLD = 500;

/**
 * Metals, for "no inferred bond between two metals": a K+ channel's
 * potassium ions sit 3.3 Å apart, which the radii alone would bond.
 * Metal-ligand and metal-halide bonds stay. Not ION_ELEMENTS (that holds
 * halides too), and not metalloids: As-As bonds are real.
 */
const METALS = new Set([
  // alkali and alkaline-earth
  'Li', 'Na', 'K', 'Rb', 'Cs', 'Be', 'Mg', 'Ca', 'Sr', 'Ba',
  // transition metals
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  // post-transition and lanthanides seen in structures
  'Sn', 'Gd',
]);

function isMetal(element: string): boolean {
  return METALS.has(normalizeElementSymbol(element));
}

/**
 * Infers bonds between atoms based on distance and covalent radii.
 * Two atoms are considered bonded if their distance is less than
 * the sum of their covalent radii plus a tolerance value, unless both are
 * metals.
 *
 * Uses spatial hashing for O(n) performance on large molecules (>500 atoms).
 * Falls back to O(n²) for small molecules where grid overhead isn't worth it.
 * Both paths bond exactly the same pairs.
 */
export function inferBondsFromDistance(
  atoms: Atom[],
  tolerance: number = PARSER_CONFIG.bondTolerance
): Bond[] {
  const radii = atoms.map((a) => getCovalentRadius(a.element));
  const metal = atoms.map((a) => isMetal(a.element));

  // Use spatial indexing for large molecules
  if (atoms.length > SPATIAL_INDEX_THRESHOLD) {
    return inferBondsWithSpatialIndex(atoms, radii, metal, tolerance);
  }

  // O(n²) for small molecules - avoids grid construction overhead
  return inferBondsNaive(atoms, radii, metal, tolerance);
}

/** Bond between atoms i and j, or null. */
function bondBetween(atoms: Atom[], radii: number[], metal: boolean[], tolerance: number, i: number, j: number): Bond | null {
  if (metal[i] && metal[j]) return null;
  const a = atoms[i];
  const b = atoms[j];
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance > PARSER_CONFIG.minBondDistance && distance <= radii[i] + radii[j] + tolerance) {
    return { atom1Index: i, atom2Index: j, order: 1 };
  }
  return null;
}

/**
 * O(n) bond inference using spatial hash grid. The cell size and search
 * radius are the longest bond this molecule's elements allow (2 × the
 * largest covalent radius present + tolerance), so no possible bond is
 * missed: about 2.5 Å for a protein, more with metals.
 */
function inferBondsWithSpatialIndex(atoms: Atom[], radii: number[], metal: boolean[], tolerance: number): Bond[] {
  // A loop, not Math.max(...radii): spreading 200,000+ atoms overflows the call stack
  let maxRadius = 0;
  for (const r of radii) if (r > maxRadius) maxRadius = r;
  const maxBondLength = 2 * maxRadius + tolerance;
  const grid = new SpatialHashGrid(maxBondLength);
  grid.build(atoms);

  const bonds: Bond[] = [];
  for (let i = 0; i < atoms.length; i++) {
    for (const j of grid.getNeighbors(i, maxBondLength)) {
      // Only process each pair once (i < j)
      if (j <= i) continue;
      const bond = bondBetween(atoms, radii, metal, tolerance, i, j);
      if (bond) bonds.push(bond);
    }
  }
  // Same order as the O(n²) path
  return bonds.sort((a, b) => a.atom1Index - b.atom1Index || a.atom2Index - b.atom2Index);
}

/**
 * O(n²) bond inference for small molecules.
 * Simple and has no overhead for small atom counts.
 */
function inferBondsNaive(atoms: Atom[], radii: number[], metal: boolean[], tolerance: number): Bond[] {
  const bonds: Bond[] = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const bond = bondBetween(atoms, radii, metal, tolerance, i, j);
      if (bond) bonds.push(bond);
    }
  }
  return bonds;
}
