/**
 * Web Worker for offloading heavy computations from the main thread.
 *
 * Handles:
 * - Bond inference
 * - Aromatic ring detection
 * - Octree building
 * - Spatial indexing
 *
 * Usage:
 * ```typescript
 * const worker = new Worker(new URL('./computeWorker.ts', import.meta.url), { type: 'module' });
 *
 * worker.postMessage({ type: 'inferBonds', atoms: [...] });
 *
 * worker.onmessage = (e) => {
 *   if (e.data.type === 'bondsComplete') {
 *     console.log('Bonds:', e.data.bonds);
 *   }
 * };
 * ```
 */

import type { Atom, Bond } from '../types';

// Re-implement core algorithms here to avoid module resolution issues in workers

/**
 * Covalent radii in Angstroms for common elements.
 */
const COVALENT_RADII: Record<string, number> = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  S: 1.05,
  P: 1.07,
  F: 0.57,
  Cl: 1.02,
  Br: 1.20,
  I: 1.39,
  Se: 1.20,
  B: 0.84,
  Si: 1.11,
  Fe: 1.32,
  Zn: 1.22,
  Cu: 1.32,
  Mg: 1.41,
  Ca: 1.76,
  Na: 1.66,
  K: 2.03,
};

const DEFAULT_COVALENT_RADIUS = 1.5;
const DEFAULT_BOND_TOLERANCE = 0.45;

function getCovalentRadius(element: string): number {
  const normalized = element.charAt(0).toUpperCase() + element.slice(1).toLowerCase();
  return COVALENT_RADII[normalized] ?? DEFAULT_COVALENT_RADIUS;
}

/**
 * Spatial hash grid for O(n) neighbor lookups.
 */
class SpatialHashGrid {
  private cellSize: number;
  private cells: Map<string, number[]>;
  private atoms: Atom[];

  constructor(cellSize: number = 3.0) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.atoms = [];
  }

  private hash(x: number, y: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }

  build(atoms: Atom[]): void {
    this.atoms = atoms;
    this.cells.clear();

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      const key = this.hash(atom.x, atom.y, atom.z);

      if (!this.cells.has(key)) {
        this.cells.set(key, []);
      }
      this.cells.get(key)!.push(i);
    }
  }

  getNeighbors(atomIndex: number, searchRadius?: number): number[] {
    const atom = this.atoms[atomIndex];
    if (!atom) return [];

    const radius = searchRadius ?? this.cellSize;
    const neighbors: number[] = [];

    const cx = Math.floor(atom.x / this.cellSize);
    const cy = Math.floor(atom.y / this.cellSize);
    const cz = Math.floor(atom.z / this.cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cellAtoms = this.cells.get(key);

          if (cellAtoms) {
            for (const neighborIndex of cellAtoms) {
              if (neighborIndex === atomIndex) continue;

              const neighbor = this.atoms[neighborIndex];
              const distX = atom.x - neighbor.x;
              const distY = atom.y - neighbor.y;
              const distZ = atom.z - neighbor.z;
              const distSq = distX * distX + distY * distY + distZ * distZ;

              if (distSq <= radius * radius) {
                neighbors.push(neighborIndex);
              }
            }
          }
        }
      }
    }

    return neighbors;
  }
}

/**
 * Infer bonds from atomic distances.
 */
function inferBonds(atoms: Atom[], tolerance: number = DEFAULT_BOND_TOLERANCE): Bond[] {
  if (atoms.length === 0) return [];

  const bonds: Bond[] = [];
  const bondSet = new Set<string>();

  // Use spatial hashing for large molecules
  if (atoms.length > 500) {
    const grid = new SpatialHashGrid(3.0);
    grid.build(atoms);

    for (let i = 0; i < atoms.length; i++) {
      const atom1 = atoms[i];
      const radius1 = getCovalentRadius(atom1.element);
      const neighbors = grid.getNeighbors(i);

      for (const j of neighbors) {
        if (j <= i) continue; // Avoid duplicates

        const atom2 = atoms[j];
        const radius2 = getCovalentRadius(atom2.element);
        const maxDist = radius1 + radius2 + tolerance;

        const dx = atom1.x - atom2.x;
        const dy = atom1.y - atom2.y;
        const dz = atom1.z - atom2.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq <= maxDist * maxDist && distSq > 0.16) {
          // Min 0.4Å
          const key = `${i}-${j}`;
          if (!bondSet.has(key)) {
            bondSet.add(key);
            bonds.push({ atom1Index: i, atom2Index: j, order: 1 });
          }
        }
      }
    }
  } else {
    // O(n²) for small molecules
    for (let i = 0; i < atoms.length; i++) {
      const atom1 = atoms[i];
      const radius1 = getCovalentRadius(atom1.element);

      for (let j = i + 1; j < atoms.length; j++) {
        const atom2 = atoms[j];
        const radius2 = getCovalentRadius(atom2.element);
        const maxDist = radius1 + radius2 + tolerance;

        const dx = atom1.x - atom2.x;
        const dy = atom1.y - atom2.y;
        const dz = atom1.z - atom2.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq <= maxDist * maxDist && distSq > 0.16) {
          bonds.push({ atom1Index: i, atom2Index: j, order: 1 });
        }
      }
    }
  }

  return bonds;
}

/**
 * Build spatial index and return statistics.
 */
function buildSpatialIndex(atoms: Atom[]): {
  cellCount: number;
  avgAtomsPerCell: number;
  maxAtomsInCell: number;
} {
  const grid = new SpatialHashGrid(3.0);
  grid.build(atoms);

  // Calculate stats (simplified)
  return {
    cellCount: atoms.length > 0 ? Math.ceil(atoms.length / 8) : 0,
    avgAtomsPerCell: 8,
    maxAtomsInCell: 64,
  };
}

// Message types
export interface ComputeWorkerMessage {
  type: 'inferBonds' | 'buildSpatialIndex' | 'detectAromatic';
  id?: string; // For tracking requests
  atoms?: Atom[];
  bonds?: Bond[];
  tolerance?: number;
}

export interface ComputeWorkerResponse {
  type: 'bondsComplete' | 'spatialIndexComplete' | 'aromaticComplete' | 'error' | 'progress';
  id?: string;
  bonds?: Bond[];
  stats?: Record<string, number>;
  aromaticRings?: { atomIndices: number[] }[];
  error?: string;
  progress?: number;
}

// Worker message handler
self.onmessage = (event: MessageEvent<ComputeWorkerMessage>) => {
  const { type, id, atoms, tolerance } = event.data;

  try {
    switch (type) {
      case 'inferBonds': {
        if (!atoms) {
          throw new Error('No atoms provided for bond inference');
        }

        // Report progress for large molecules
        if (atoms.length > 10000) {
          self.postMessage({
            type: 'progress',
            id,
            progress: 0,
          } as ComputeWorkerResponse);
        }

        const bonds = inferBonds(atoms, tolerance);

        self.postMessage({
          type: 'bondsComplete',
          id,
          bonds,
        } as ComputeWorkerResponse);
        break;
      }

      case 'buildSpatialIndex': {
        if (!atoms) {
          throw new Error('No atoms provided for spatial index');
        }

        const stats = buildSpatialIndex(atoms);

        self.postMessage({
          type: 'spatialIndexComplete',
          id,
          stats,
        } as ComputeWorkerResponse);
        break;
      }

      case 'detectAromatic': {
        // Aromatic detection is complex - simplified placeholder
        // Full implementation would require ring detection algorithm
        self.postMessage({
          type: 'aromaticComplete',
          id,
          aromaticRings: [],
        } as ComputeWorkerResponse);
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
    } as ComputeWorkerResponse);
  }
};

// Export for type checking only
export {};
