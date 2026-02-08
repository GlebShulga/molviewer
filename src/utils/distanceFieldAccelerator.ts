import type { Atom } from '../types';
import { getVdwRadius } from '../constants/elements';

/**
 * Distance Field Accelerator using a uniform grid for O(1) spatial lookups.
 *
 * Instead of checking every atom for every grid point (O(n) per query),
 * we use a spatial hash grid to only check nearby atoms (O(1) average case).
 */

export interface DistanceFieldResult {
  distance: number;
  nearestAtomIndex: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export class DistanceFieldAccelerator {
  private atoms: Atom[];
  private atomRadii: number[];
  private gridCellSize: number;
  private gridCells: Map<string, number[]>;
  private bounds: Bounds;

  constructor(atoms: Atom[], probeRadius: number = 0) {
    this.atoms = atoms;

    // Pre-compute atom radii
    this.atomRadii = atoms.map((a) => getVdwRadius(a.element) + probeRadius);

    // Find maximum radius for cell size
    const maxRadius = Math.max(...this.atomRadii, 2.0);

    // Cell size should be at least the maximum atom radius
    // This ensures each atom affects at most 27 cells (3x3x3 neighborhood)
    this.gridCellSize = maxRadius * 2;

    // Calculate bounds with padding
    this.bounds = this.calculateBounds(probeRadius);

    // Build spatial hash grid
    this.gridCells = this.buildGrid();
  }

  private calculateBounds(padding: number): Bounds {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      const radius = this.atomRadii[i];
      minX = Math.min(minX, atom.x - radius);
      minY = Math.min(minY, atom.y - radius);
      minZ = Math.min(minZ, atom.z - radius);
      maxX = Math.max(maxX, atom.x + radius);
      maxY = Math.max(maxY, atom.y + radius);
      maxZ = Math.max(maxZ, atom.z + radius);
    }

    // Add some extra padding for the grid
    const pad = 2 + padding;
    return {
      minX: minX - pad,
      minY: minY - pad,
      minZ: minZ - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
      maxZ: maxZ + pad,
    };
  }

  private buildGrid(): Map<string, number[]> {
    const cells = new Map<string, number[]>();

    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      const radius = this.atomRadii[i];

      // Find all cells that this atom's sphere overlaps
      const minCellX = Math.floor(
        (atom.x - radius - this.bounds.minX) / this.gridCellSize
      );
      const maxCellX = Math.floor(
        (atom.x + radius - this.bounds.minX) / this.gridCellSize
      );
      const minCellY = Math.floor(
        (atom.y - radius - this.bounds.minY) / this.gridCellSize
      );
      const maxCellY = Math.floor(
        (atom.y + radius - this.bounds.minY) / this.gridCellSize
      );
      const minCellZ = Math.floor(
        (atom.z - radius - this.bounds.minZ) / this.gridCellSize
      );
      const maxCellZ = Math.floor(
        (atom.z + radius - this.bounds.minZ) / this.gridCellSize
      );

      // Add atom to all overlapping cells
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        for (let cy = minCellY; cy <= maxCellY; cy++) {
          for (let cz = minCellZ; cz <= maxCellZ; cz++) {
            const key = `${cx},${cy},${cz}`;
            if (!cells.has(key)) {
              cells.set(key, []);
            }
            cells.get(key)!.push(i);
          }
        }
      }
    }

    return cells;
  }

  /**
   * Sample the distance field at a point and return the distance and nearest atom
   */
  sample(x: number, y: number, z: number): DistanceFieldResult {
    // Get the cell for this point
    const cellX = Math.floor((x - this.bounds.minX) / this.gridCellSize);
    const cellY = Math.floor((y - this.bounds.minY) / this.gridCellSize);
    const cellZ = Math.floor((z - this.bounds.minZ) / this.gridCellSize);

    let minDist = Infinity;
    let nearestAtomIndex = 0;

    // Check the current cell and neighboring cells (3x3x3 neighborhood)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
          const atomIndices = this.gridCells.get(key);
          if (!atomIndices) continue;

          for (const i of atomIndices) {
            const atom = this.atoms[i];
            const adx = x - atom.x;
            const ady = y - atom.y;
            const adz = z - atom.z;
            const dist = Math.sqrt(adx * adx + ady * ady + adz * adz) - this.atomRadii[i];
            if (dist < minDist) {
              minDist = dist;
              nearestAtomIndex = i;
            }
          }
        }
      }
    }

    // If no atoms found in neighborhood (shouldn't happen for valid points),
    // fall back to checking all atoms
    if (minDist === Infinity) {
      for (let i = 0; i < this.atoms.length; i++) {
        const atom = this.atoms[i];
        const dx = x - atom.x;
        const dy = y - atom.y;
        const dz = z - atom.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) - this.atomRadii[i];
        if (dist < minDist) {
          minDist = dist;
          nearestAtomIndex = i;
        }
      }
    }

    return { distance: minDist, nearestAtomIndex };
  }

  /**
   * Sample just the distance (faster if you don't need the nearest atom)
   */
  sampleDistance(x: number, y: number, z: number): number {
    return this.sample(x, y, z).distance;
  }

  /**
   * Calculate gradient (normal) at a point using finite differences
   */
  calcNormal(x: number, y: number, z: number): [number, number, number] {
    const eps = 0.01;
    const nx = this.sampleDistance(x + eps, y, z) - this.sampleDistance(x - eps, y, z);
    const ny = this.sampleDistance(x, y + eps, z) - this.sampleDistance(x, y - eps, z);
    const nz = this.sampleDistance(x, y, z + eps) - this.sampleDistance(x, y, z - eps);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len === 0) return [0, 1, 0];
    return [nx / len, ny / len, nz / len];
  }

  getBounds(): Bounds {
    return this.bounds;
  }

  getAtomRadius(index: number): number {
    return this.atomRadii[index];
  }
}

/**
 * Precomputed data structure for surface vertex coloring
 * Maps vertex positions to their nearest atom indices
 */
export class SurfaceColorAccelerator {
  private nearestAtomIndices: Map<string, number>;

  constructor() {
    this.nearestAtomIndices = new Map();
  }

  /**
   * Store the nearest atom index for a vertex
   */
  setNearestAtom(x: number, y: number, z: number, atomIndex: number): void {
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    this.nearestAtomIndices.set(key, atomIndex);
  }

  /**
   * Get the nearest atom index for a vertex (or -1 if not found)
   */
  getNearestAtom(x: number, y: number, z: number): number {
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    return this.nearestAtomIndices.get(key) ?? -1;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.nearestAtomIndices.clear();
  }
}
