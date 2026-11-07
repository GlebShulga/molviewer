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
  // post-transition (Al: an AlF4- sits about 3 Å from its Mg2+) and lanthanides seen in structures
  'Al', 'Ga', 'In', 'Sn', 'Tl', 'Pb', 'Bi', 'Gd',
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
 * O(n) bond inference using spatial hash grid. getNeighbors looks at the 27
 * cells around an atom, so a cell must hold the longest bond it searches
 * for. Sized by the largest metal ion, one K+ or Cs+ would make every
 * protein atom search a much larger volume. So the grid is sized by the
 * largest non-metal radius (about 2.5 Å cells for a protein), and the
 * metals larger than that ("big", a few ions at most) search further on
 * their own. Two big atoms are both metals, which never bond.
 */
function inferBondsWithSpatialIndex(atoms: Atom[], radii: number[], metal: boolean[], tolerance: number): Bond[] {
  let rNormal = 0;
  for (let i = 0; i < atoms.length; i++) if (!metal[i] && radii[i] > rNormal) rNormal = radii[i];
  const big = radii.map((r, i) => metal[i] && r > rNormal);
  // Only metals: nothing to bond (and rNormal 0 would shrink the cells to the tolerance)
  if (big.every(Boolean)) return [];

  const grid = new SpatialHashGrid(2 * rNormal + tolerance);
  grid.build(atoms);

  const bonds: Bond[] = [];
  // Pass 1: pairs of non-big atoms, each found once (i < j), within the 27
  // cells. getNeighbors returns cell order, so each atom's few bonds are
  // sorted by partner: pass 1 alone is then in the O(n²) path's order.
  const atomBonds: Bond[] = [];
  for (let i = 0; i < atoms.length; i++) {
    if (big[i]) continue;
    atomBonds.length = 0;
    for (const j of grid.getNeighbors(i, radii[i] + rNormal + tolerance)) {
      if (j <= i || big[j]) continue;
      const bond = bondBetween(atoms, radii, metal, tolerance, i, j);
      if (bond) atomBonds.push(bond);
    }
    if (atomBonds.length > 1) atomBonds.sort((a, b) => a.atom2Index - b.atom2Index);
    for (const bond of atomBonds) bonds.push(bond);
  }
  const pass1Count = bonds.length;
  // Pass 2: each big atom with its non-big neighbours, over as many cells as its reach needs
  for (let b = 0; b < atoms.length; b++) {
    if (!big[b]) continue;
    const { x, y, z } = atoms[b];
    // Returns b itself too: big, so skipped
    for (const k of grid.getNeighborsAt(x, y, z, radii[b] + rNormal + tolerance)) {
      if (big[k]) continue;
      const bond = b < k ? bondBetween(atoms, radii, metal, tolerance, b, k) : bondBetween(atoms, radii, metal, tolerance, k, b);
      if (bond) bonds.push(bond);
    }
  }
  // Same order as the O(n²) path: pass 2's bonds go in among pass 1's
  if (bonds.length === pass1Count) return bonds;
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
