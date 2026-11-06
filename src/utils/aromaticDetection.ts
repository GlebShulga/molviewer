import type { Atom, Bond, AromaticRing, Molecule } from '../types';
import { AROMATIC_DETECTION_THRESHOLD } from '../config/rendering';

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

const AROMATIC_ELEMENTS = new Set(['C', 'N', 'O', 'S']);

/** Order-independent key for the bond between two atoms. */
function bondKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Keys of the bonds that close a ring (consecutive atoms, last back to first). */
function ringBondKeys(ring: RingCandidate): string[] {
  const { atomIndices } = ring;
  return atomIndices.map((a, i) => bondKey(a, atomIndices[(i + 1) % atomIndices.length]));
}

function otherAtom(bond: Bond, atom: number): number {
  return bond.atom1Index === atom ? bond.atom2Index : bond.atom1Index;
}

/**
 * Hückel check on one 5- or 6-membered ring of C, N, O and S.
 *
 * A ring whose bonds are all flagged aromatic (SDF bond type 4) is aromatic.
 * Otherwise each ring atom contributes π electrons by the first rule that applies:
 * 1. a double (or flagged) bond to a ring partner, meaning an atom of this
 *    ring or of a fused ring already found aromatic: 1
 * 2. any other double bond (C=O, exocyclic C=C, S(=O)2): 0
 * 3. N, O or S without a positive charge, or any atom with a -1 formal charge
 *    (the carbanion of cyclopentadienide), with single bonds only (lone pair): 2
 * 4. any other atom with single bonds only (a neutral carbon, a quaternary N+,
 *    a carbocation): the ring is not aromatic.
 * The ring is aromatic when the total is exactly 6. Counting aromatic fused
 * partners lets either Kekulé form of naphthalene or indole pass for both
 * rings, while an o-quinoid ring next to a non-aromatic one (2H-indene) fails.
 *
 * Rule 4 is deliberately strict: Cp ligands drawn as radicals (PubChem's
 * convention for ferrocene, CID 10219726) or as anions without their charge
 * are not marked, since such a ring has 5 π electrons as drawn. Loosening
 * rule 4 to catch them would mark cyclopentadiene and cyclohexadienes again.
 *
 * Only 5- and 6-membered rings are candidates, so azulene's five-ring is not
 * marked either: the double bond into its seven-ring counts 0 here.
 */
function isAromaticRing(
  ring: RingCandidate,
  atoms: Atom[],
  bondByKey: Map<string, Bond>,
  bondsOfAtom: Map<number, Bond[]>,
  partners: Set<number>
): boolean {
  const { atomIndices } = ring;
  if (atomIndices.length < 5 || atomIndices.length > 6) return false;
  if (!atomIndices.every(idx => AROMATIC_ELEMENTS.has(atoms[idx].element))) return false;

  if (ringBondKeys(ring).every(key => bondByKey.get(key)?.isAromatic)) return true;

  let electrons = 0;
  for (const idx of atomIndices) {
    const own = bondsOfAtom.get(idx) ?? [];
    if (own.some(b => (b.order === 2 || b.isAromatic) && partners.has(otherAtom(b, idx)))) {
      electrons += 1;
    } else if (own.some(b => b.order === 2)) {
      // A double bond out of the ring system gives this ring no π electrons
    } else if (
      atoms[idx].formalCharge === -1 ||
      (atoms[idx].element !== 'C' && (atoms[idx].formalCharge ?? 0) <= 0)
    ) {
      electrons += 2;
    } else {
      return false;
    }
  }
  return electrons === 6;
}

/**
 * Calculate ring geometry (center, normal, radius).
 */
function calculateRingGeometry(
  atomIndices: number[],
  atoms: Atom[]
): Pick<AromaticRing, 'center' | 'normal' | 'radius'> {
  // Plain math rather than THREE.Vector3: the store runs this on every load,
  // and three.js should stay out of the startup bundle.
  // Calculate center
  const center = { x: 0, y: 0, z: 0 };
  atomIndices.forEach(idx => {
    center.x += atoms[idx].x;
    center.y += atoms[idx].y;
    center.z += atoms[idx].z;
  });
  center.x /= atomIndices.length;
  center.y /= atomIndices.length;
  center.z /= atomIndices.length;

  // Calculate normal using Newell's method for better accuracy with non-planar rings
  const normal = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < atomIndices.length; i++) {
    const curr = atoms[atomIndices[i]];
    const next = atoms[atomIndices[(i + 1) % atomIndices.length]];

    normal.x += (curr.y - next.y) * (curr.z + next.z);
    normal.y += (curr.z - next.z) * (curr.x + next.x);
    normal.z += (curr.x - next.x) * (curr.y + next.y);
  }
  // Same as Vector3.normalize(): a zero vector stays zero.
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  normal.x /= length;
  normal.y /= length;
  normal.z /= length;

  // Calculate average radius
  let radius = 0;
  atomIndices.forEach(idx => {
    radius += Math.hypot(atoms[idx].x - center.x, atoms[idx].y - center.y, atoms[idx].z - center.z);
  });
  radius /= atomIndices.length;

  return { center, normal, radius };
}

/**
 * Main function to detect aromatic rings in a molecule.
 */
export function detectAromaticRings(molecule: Molecule): AromaticRing[] {
  const { atoms, bonds } = molecule;

  // Without a double or flagged bond no ring can pass: every atom either fails
  // rule 4 or gives 2 electrons, so a ring counts 10 or 12, never 6. Skip the ring search.
  // This covers proteins from PDB/mmCIF, whose bonds are all order 1.
  if (atoms.length === 0 || !bonds.some(b => b.order === 2 || b.isAromatic)) {
    return [];
  }

  // Find candidate rings (5-6 membered)
  const candidates = findRings(atoms, bonds, 5, 6);

  const bondByKey = new Map<string, Bond>();
  const bondsOfAtom = new Map<number, Bond[]>();
  for (const bond of bonds) {
    bondByKey.set(bondKey(bond.atom1Index, bond.atom2Index), bond);
    for (const idx of [bond.atom1Index, bond.atom2Index]) {
      const list = bondsOfAtom.get(idx);
      if (list) list.push(bond);
      else bondsOfAtom.set(idx, [bond]);
    }
  }

  // Candidates fused to each one (sharing a bond with it)
  const candidateBonds = candidates.map(c => new Set(ringBondKeys(c)));
  const fused = candidates.map((_, i) =>
    candidates
      .map((__, j) => j)
      .filter(j => j !== i && [...candidateBonds[j]].some(key => candidateBonds[i].has(key)))
  );

  // Ring partners are the ring's own atoms plus those of fused rings already
  // found aromatic, so passes repeat until nothing changes: the first finds
  // rings that are aromatic on their own bonds, later ones the rings that need
  // a double bond into such a neighbour (naphthalene's second ring).
  const aromatic = candidates.map(() => false);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [i, candidate] of candidates.entries()) {
      if (aromatic[i]) continue;
      const partners = new Set(candidate.atomIndices);
      for (const j of fused[i]) {
        if (aromatic[j]) candidates[j].atomIndices.forEach(idx => partners.add(idx));
      }
      if (isAromaticRing(candidate, atoms, bondByKey, bondsOfAtom, partners)) {
        aromatic[i] = true;
        changed = true;
      }
    }
  }

  return candidates
    .filter((_, i) => aromatic[i])
    .map(candidate => ({
      atomIndices: candidate.atomIndices,
      ...calculateRingGeometry(candidate.atomIndices, atoms),
    }));
}

/**
 * The rings a representation drawing only some atoms should show: those whose
 * atoms are all among them. Without a subset every ring is kept. This keeps a
 * structure drawn as several components from drawing each ring once per
 * component, or drawing the rings of a hidden component.
 */
export function ringsWithin(rings: AromaticRing[], atomIndices: number[] | undefined): AromaticRing[] {
  // No subset, or nothing to filter (every protein): skip building the atom set
  if (!atomIndices || rings.length === 0) return rings;
  const subset = new Set(atomIndices);
  return rings.filter(ring => ring.atomIndices.every(idx => subset.has(idx)));
}

/**
 * Number of aromatic rings, for the Saved panel's count. A stored list is
 * used as is (loads drop stored lists, so one present was detected in this
 * session); otherwise detection runs, unless the molecule is over the size
 * where the viewer skips it too.
 */
export function countAromaticRings(molecule: Molecule): number {
  if (molecule.aromaticRings !== undefined) return molecule.aromaticRings.length;
  if (molecule.atoms.length > AROMATIC_DETECTION_THRESHOLD) return 0;
  return detectAromaticRings(molecule).length;
}
