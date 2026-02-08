import type { Atom } from '../types';

/**
 * 3D Spatial Hash Grid for O(n) neighbor lookups.
 *
 * Instead of O(n²) pairwise comparisons for bond inference,
 * this enables O(n) lookups by hashing atoms into a 3D grid.
 *
 * Cell size is set to the maximum bond length (~3Å), so each
 * atom only needs to check its own cell and 26 neighboring cells.
 */
export class SpatialHashGrid {
  private cellSize: number;
  private cells: Map<string, number[]>;
  private atoms: Atom[];

  /**
   * @param cellSize Grid cell size in Angstroms (default 3.0Å for max bond length)
   */
  constructor(cellSize: number = 3.0) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.atoms = [];
  }

  /**
   * Hash a 3D position to a cell key.
   */
  private hash(x: number, y: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }

  /**
   * Build the spatial index from an array of atoms.
   * O(n) time complexity.
   */
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

  /**
   * Get all atom indices within the search radius of a given atom.
   * Checks the atom's cell and all 26 neighboring cells.
   *
   * @param atomIndex Index of the query atom
   * @param searchRadius Maximum distance to search (default: cellSize)
   * @returns Array of neighbor atom indices (excludes the query atom)
   */
  getNeighbors(atomIndex: number, searchRadius?: number): number[] {
    const atom = this.atoms[atomIndex];
    if (!atom) return [];

    const radius = searchRadius ?? this.cellSize;
    const neighbors: number[] = [];

    // Get the cell coordinates for this atom
    const cx = Math.floor(atom.x / this.cellSize);
    const cy = Math.floor(atom.y / this.cellSize);
    const cz = Math.floor(atom.z / this.cellSize);

    // Check all 27 cells (self + 26 neighbors)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cellAtoms = this.cells.get(key);

          if (cellAtoms) {
            for (const neighborIndex of cellAtoms) {
              if (neighborIndex === atomIndex) continue;

              // Distance check
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

  /**
   * Get all atom indices within a search radius of a given position.
   * Useful for spatial queries not tied to a specific atom.
   */
  getNeighborsAt(x: number, y: number, z: number, searchRadius: number): number[] {
    const neighbors: number[] = [];

    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);

    // Determine how many cells to check based on search radius
    const cellRange = Math.ceil(searchRadius / this.cellSize);

    for (let dx = -cellRange; dx <= cellRange; dx++) {
      for (let dy = -cellRange; dy <= cellRange; dy++) {
        for (let dz = -cellRange; dz <= cellRange; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cellAtoms = this.cells.get(key);

          if (cellAtoms) {
            for (const atomIndex of cellAtoms) {
              const atom = this.atoms[atomIndex];
              const distX = x - atom.x;
              const distY = y - atom.y;
              const distZ = z - atom.z;
              const distSq = distX * distX + distY * distY + distZ * distZ;

              if (distSq <= searchRadius * searchRadius) {
                neighbors.push(atomIndex);
              }
            }
          }
        }
      }
    }

    return neighbors;
  }

  /**
   * Get statistics about the spatial index.
   */
  getStats(): { totalCells: number; atomsPerCell: number; maxAtomsInCell: number } {
    let maxAtoms = 0;
    let totalAtoms = 0;

    for (const atoms of this.cells.values()) {
      totalAtoms += atoms.length;
      maxAtoms = Math.max(maxAtoms, atoms.length);
    }

    return {
      totalCells: this.cells.size,
      atomsPerCell: this.cells.size > 0 ? totalAtoms / this.cells.size : 0,
      maxAtomsInCell: maxAtoms,
    };
  }

  /**
   * Clear the spatial index.
   */
  clear(): void {
    this.cells.clear();
    this.atoms = [];
  }
}

/**
 * Create and build a spatial index for a set of atoms.
 * Convenience function for one-shot usage.
 */
export function createSpatialIndex(atoms: Atom[], cellSize: number = 3.0): SpatialHashGrid {
  const grid = new SpatialHashGrid(cellSize);
  grid.build(atoms);
  return grid;
}
