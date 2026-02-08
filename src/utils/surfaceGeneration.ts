import type { Atom } from '../types';
import { EDGE_VERTICES, TRI_TABLE, EDGE_TABLE } from './marchingCubesTable';
import { getVdwRadius } from '../constants/elements';
import { laplacianSmooth } from './meshSmoothing';
import { computeGaussianDensityGPU, isGPUDensitySupported, MAX_ATOMS as GPU_MAX_ATOMS } from './gpuDensity';

export interface SurfaceOptions {
  probeRadius?: number;
  resolution?: number;
  type: 'vdw' | 'sas';
}

export interface SurfaceData {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  nearestAtomIndices: Int32Array;
}

interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

interface SDFResult {
  sdf: Float32Array;
  atomOwner: Int32Array;
  w: number;
  h: number;
  d: number;
  bounds: Bounds;
  step: number;
}

const DEFAULT_PROBE_RADIUS = 1.4; // Water molecule radius in Angstroms
const MAX_GRID_CELLS = 120; // Max cells per dimension for high-quality surfaces
const MAX_SURFACE_ATOMS = 100_000; // Bail out above this count

function emptySurface(): SurfaceData {
  return {
    vertices: new Float32Array(0),
    normals: new Float32Array(0),
    indices: new Uint32Array(0),
    nearestAtomIndices: new Int32Array(0),
  };
}

// Gaussian density parameters for smooth surface blending
const GAUSSIAN_BETA = 2.0;      // Sharpness: higher = tighter surface around atoms
const DENSITY_ISOVALUE = 0.5;   // Surface threshold: density > 0.5 = inside

/**
 * Calculate bounding box for atoms including their radii
 */
function calculateBounds(atoms: Atom[], atomRadii: number[]): Bounds {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    const r = atomRadii[i];
    minX = Math.min(minX, atom.x - r);
    minY = Math.min(minY, atom.y - r);
    minZ = Math.min(minZ, atom.z - r);
    maxX = Math.max(maxX, atom.x + r);
    maxY = Math.max(maxY, atom.y + r);
    maxZ = Math.max(maxZ, atom.z + r);
  }

  // Padding for grid boundary
  const pad = 2;
  return {
    minX: minX - pad,
    minY: minY - pad,
    minZ: minZ - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    maxZ: maxZ + pad,
  };
}

/**
 * Generate molecular surface using EDT-based SDF computation
 *
 * This implementation uses Euclidean Distance Transform (EDT):
 * 1. Binary voxelization - mark inside/outside
 * 2. EDT to get distance to boundary
 * 3. Combine into signed field
 * 4. Extract isosurface using Marching Cubes
 *
 * Benefits:
 * - O(n) complexity for n voxels (very fast)
 * - Guaranteed to find union of all atoms (no missed atoms)
 * - No spatial acceleration needed (no O(n) fallback)
 */
export function generateSurface(
  atoms: Atom[],
  options: SurfaceOptions
): SurfaceData {
  const { probeRadius = DEFAULT_PROBE_RADIUS, resolution, type } = options;

  // Bail out for extremely large molecules
  if (atoms.length > MAX_SURFACE_ATOMS) {
    return emptySurface();
  }

  // Compute atom radii (with probe radius for SAS)
  const effectiveProbeRadius = type === 'sas' ? probeRadius : 0;
  const atomRadii = atoms.map((a) => getVdwRadius(a.element) + effectiveProbeRadius);

  // Calculate bounds with padding
  const bounds = calculateBounds(atoms, atomRadii);

  // Grid dimensions
  const sizeX = bounds.maxX - bounds.minX;
  const sizeY = bounds.maxY - bounds.minY;
  const sizeZ = bounds.maxZ - bounds.minZ;
  const maxSize = Math.max(sizeX, sizeY, sizeZ);

  // Molecule-size-aware adaptive resolution
  // Small molecules need finer resolution to capture atomic detail and avoid fragmentation
  // Large molecules can use coarser resolution for performance
  const adaptiveResolution =
    maxSize < 20 ? 0.4 :          // Small molecules (water, caffeine, ligands): high detail
    maxSize < 50 ? 0.6 :          // Medium molecules (peptides, small proteins): moderate detail
    atoms.length > 20000 ? 2.5 :  // Very large proteins: very coarse for performance
    atoms.length > 10000 ? 2.0 :  // Large proteins: coarse
    atoms.length > 5000 ? 1.5 :   // Medium-large proteins: reduced detail
    1.0;                           // Standard proteins: performance priority

  // Use user-specified resolution if provided, otherwise use adaptive
  const baseResolution = resolution ?? adaptiveResolution;

  // Cap grid size — smaller limit for large molecules to prevent excessive memory usage
  const effectiveMaxGrid = atoms.length > 5000 ? 80 : MAX_GRID_CELLS;
  const step = Math.max(baseResolution, maxSize / effectiveMaxGrid);

  // Compute SDF - use GPU for large proteins, CPU for small molecules
  const useGPU = isGPUDensitySupported() && atoms.length >= 500 && atoms.length <= GPU_MAX_ATOMS;

  let sdfResult: SDFResult;
  if (useGPU) {
    console.log('[Surface] Using GPU acceleration for density computation');
    try {
      sdfResult = computeGaussianDensityGPU(atoms, atomRadii, bounds, step);
    } catch (e) {
      console.warn('[Surface] GPU density failed, falling back to CPU:', e);
      sdfResult = computeSignedDistanceField(atoms, atomRadii, bounds, step);
    }
  } else {
    sdfResult = computeSignedDistanceField(atoms, atomRadii, bounds, step);
  }

  // Extract isosurface at distance = 0
  const surface = extractIsosurface(sdfResult, 0);

  // Apply Laplacian smoothing to eliminate blocky/faceted appearance
  return laplacianSmooth(surface, 2, 0.5);
}

interface SpatialGrid {
  cells: (number[] | undefined)[];
  dimX: number;
  dimY: number;
  dimZ: number;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

/**
 * Build flat-array spatial grid for fast atom lookups.
 * Uses integer indexing instead of string keys for zero allocation overhead.
 * Atoms are inserted into ±1 neighboring cells (27 cells per atom).
 */
function buildSpatialGrid(
  atoms: Atom[],
  atomRadii: number[],
  bounds: Bounds
): SpatialGrid {
  let maxRadius = 2.0;
  for (let i = 0; i < atomRadii.length; i++) {
    if (atomRadii[i] > maxRadius) maxRadius = atomRadii[i];
  }
  const cellSize = maxRadius * 2.5;

  // +4 padding (2 on each side) to safely handle ±1 lookups at grid edges
  const dimX = Math.ceil((bounds.maxX - bounds.minX) / cellSize) + 4;
  const dimY = Math.ceil((bounds.maxY - bounds.minY) / cellSize) + 4;
  const dimZ = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize) + 4;
  // Offset so that cell 0 maps to -2 in raw coordinates (2-cell padding)
  const offsetX = bounds.minX;
  const offsetY = bounds.minY;
  const offsetZ = bounds.minZ;

  const cells = new Array<number[] | undefined>(dimX * dimY * dimZ);

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    // Center cell for this atom (+2 for padding offset)
    const cx0 = Math.floor((atom.x - offsetX) / cellSize) + 2;
    const cy0 = Math.floor((atom.y - offsetY) / cellSize) + 2;
    const cz0 = Math.floor((atom.z - offsetZ) / cellSize) + 2;

    // Insert into ±1 neighboring cells (3×3×3 = 27 cells per atom)
    for (let dcx = -1; dcx <= 1; dcx++) {
      const gx = cx0 + dcx;
      if (gx < 0 || gx >= dimX) continue;
      for (let dcy = -1; dcy <= 1; dcy++) {
        const gy = cy0 + dcy;
        if (gy < 0 || gy >= dimY) continue;
        for (let dcz = -1; dcz <= 1; dcz++) {
          const gz = cz0 + dcz;
          if (gz < 0 || gz >= dimZ) continue;
          const idx = gz * dimX * dimY + gy * dimX + gx;
          if (!cells[idx]) {
            cells[idx] = [i];
          } else {
            cells[idx]!.push(i);
          }
        }
      }
    }
  }

  return { cells, dimX, dimY, dimZ, cellSize, offsetX, offsetY, offsetZ };
}

/**
 * Compute Gaussian density at a point from nearby atoms
 *
 * density(p) = Σ exp(-β × (|p - atom| / radius)²)
 *
 * Unlike hard sphere SDF, Gaussian density:
 * - Sums contributions from overlapping atoms (smooth blending)
 * - Creates continuous gradient (no sharp edges)
 * - Produces smoother surfaces at atom intersections
 */
function computeGaussianDensity(
  vx: number,
  vy: number,
  vz: number,
  atoms: Atom[],
  atomRadii: number[],
  nearbyAtomIndices: number[]
): { density: number; nearestAtom: number } {
  let density = 0;
  let nearestAtom = 0;
  let minDist = Infinity;

  for (const i of nearbyAtomIndices) {
    const atom = atoms[i];
    const dx = vx - atom.x;
    const dy = vy - atom.y;
    const dz = vz - atom.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const r = atomRadii[i];

    // Gaussian contribution: peaks at atom center, falls off with distance
    const normalizedDist = dist / r;
    density += Math.exp(-GAUSSIAN_BETA * normalizedDist * normalizedDist);

    // Track nearest atom for per-vertex coloring
    if (dist < minDist) {
      minDist = dist;
      nearestAtom = i;
    }
  }

  return { density, nearestAtom };
}

/**
 * Compute signed distance field using direct sampling with spatial acceleration
 *
 * For each voxel, compute the minimum signed distance to any atom surface.
 * Uses spatial hash grid to only check nearby atoms (O(1) average case per voxel).
 */
function computeSignedDistanceField(
  atoms: Atom[],
  atomRadii: number[],
  bounds: Bounds,
  step: number
): SDFResult {
  const w = Math.ceil((bounds.maxX - bounds.minX) / step);
  const h = Math.ceil((bounds.maxY - bounds.minY) / step);
  const d = Math.ceil((bounds.maxZ - bounds.minZ) / step);
  const size = w * h * d;
  const wh = w * h;

  const sdf = new Float32Array(size);
  const atomOwner = new Int32Array(size);

  console.log(`[Surface Debug] Grid: ${w}×${h}×${d} (${size} voxels), Step: ${step.toFixed(3)}Å`);
  console.log(`[Surface Debug] Computing SDF for ${atoms.length} atoms...`);

  // Build spatial acceleration structure
  const spatialGrid = buildSpatialGrid(atoms, atomRadii, bounds);
  const { cells, dimX, dimY, dimZ, cellSize, offsetX, offsetY, offsetZ } = spatialGrid;
  const dimXY = dimX * dimY;

  console.log(`[Surface Debug] Built spatial grid with cell size ${cellSize.toFixed(2)}Å, dims ${dimX}×${dimY}×${dimZ}`);

  // Use Gaussian density for small molecules (smoother), hard spheres for large (faster)
  const useGaussianDensity = atoms.length < 1000;
  console.log(`[Surface Debug] Using ${useGaussianDensity ? 'Gaussian density' : 'hard sphere'} SDF`);

  let fallbackCount = 0;

  // Pre-allocated dedup structures to avoid per-voxel Set/Array allocations
  const visited = new Uint8Array(atoms.length);
  let visitGen = 0;
  const nearbyBuffer: number[] = [];

  // For each voxel, compute minimum signed distance to any atom surface
  for (let iz = 0; iz < d; iz++) {
    const vz = bounds.minZ + (iz + 0.5) * step;

    for (let iy = 0; iy < h; iy++) {
      const vy = bounds.minY + (iy + 0.5) * step;

      for (let ix = 0; ix < w; ix++) {
        const vx = bounds.minX + (ix + 0.5) * step;
        const idx = iz * wh + iy * w + ix;

        // Get cell coordinates for this voxel (+2 for padding offset)
        const cellX = Math.floor((vx - offsetX) / cellSize) + 2;
        const cellY = Math.floor((vy - offsetY) / cellSize) + 2;
        const cellZ = Math.floor((vz - offsetZ) / cellSize) + 2;

        // Collect nearby atom indices using ±1 lookup (27 cells)
        visitGen++;
        if (visitGen > 255) { visited.fill(0); visitGen = 1; }
        nearbyBuffer.length = 0;
        for (let dcx = -1; dcx <= 1; dcx++) {
          const gx = cellX + dcx;
          if (gx < 0 || gx >= dimX) continue;
          for (let dcy = -1; dcy <= 1; dcy++) {
            const gy = cellY + dcy;
            if (gy < 0 || gy >= dimY) continue;
            for (let dcz = -1; dcz <= 1; dcz++) {
              const gz = cellZ + dcz;
              if (gz < 0 || gz >= dimZ) continue;
              const cellIdx = gz * dimXY + gy * dimX + gx;
              const atomIndices = cells[cellIdx];
              if (atomIndices) {
                for (const i of atomIndices) {
                  if (visited[i] !== visitGen) {
                    visited[i] = visitGen;
                    nearbyBuffer.push(i);
                  }
                }
              }
            }
          }
        }
        const nearbyAtomIndices = nearbyBuffer;

        let signedDist: number;
        let nearestAtom: number;

        if (nearbyAtomIndices.length > 0) {
          if (useGaussianDensity) {
            // Gaussian density (smooth blending for small molecules)
            const { density, nearestAtom: nearest } = computeGaussianDensity(
              vx, vy, vz, atoms, atomRadii, nearbyAtomIndices
            );
            nearestAtom = nearest;
            // Convert density to signed distance:
            // density > ISOVALUE = inside (negative), density < ISOVALUE = outside (positive)
            signedDist = DENSITY_ISOVALUE - density;
          } else {
            // Hard sphere SDF (faster for large proteins)
            let minDist = Infinity;
            nearestAtom = 0;
            for (const i of nearbyAtomIndices) {
              const atom = atoms[i];
              const dx = vx - atom.x;
              const dy = vy - atom.y;
              const dz = vz - atom.z;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              const sd = dist - atomRadii[i];
              if (Math.abs(sd) < Math.abs(minDist)) {
                minDist = sd;
                nearestAtom = i;
              }
            }
            signedDist = minDist;
          }
        } else {
          // No nearby atoms within ±1 cells (~2×cellSize ≈ 9-10Å).
          // This voxel is far outside the molecular surface — set large positive SDF.
          // Atom radii are at most ~2Å, so anything >9Å away is definitely outside.
          fallbackCount++;
          signedDist = 100;
          nearestAtom = 0;
        }

        sdf[idx] = signedDist;
        atomOwner[idx] = nearestAtom;
      }
    }
  }

  // Debug: analyze SDF distribution
  let minSDF = Infinity, maxSDF = -Infinity;
  let negativeCount = 0, zeroCount = 0, positiveCount = 0;
  for (let i = 0; i < size; i++) {
    if (sdf[i] < -0.1) negativeCount++;
    else if (sdf[i] > 0.1) positiveCount++;
    else zeroCount++;
    minSDF = Math.min(minSDF, sdf[i]);
    maxSDF = Math.max(maxSDF, sdf[i]);
  }

  console.log(`[Surface Debug] SDF range: [${minSDF.toFixed(2)}, ${maxSDF.toFixed(2)}] Å`);
  console.log(`[Surface Debug] Distribution: ${negativeCount} negative, ${zeroCount} near-zero, ${positiveCount} positive`);
  console.log(`[Surface Debug] Fallback triggered for ${fallbackCount} voxels (${(fallbackCount/size*100).toFixed(1)}%)`);

  return { sdf, atomOwner, w, h, d, bounds, step };
}

/**
 * Calculate normal from SDF gradient using central differences
 */
function calcNormalFromSDF(
  sdf: Float32Array,
  w: number,
  h: number,
  d: number,
  ix: number,
  iy: number,
  iz: number
): [number, number, number] {
  const wh = w * h;

  // Clamp indices to valid range
  const ix0 = Math.max(0, ix - 1);
  const ix1 = Math.min(w - 1, ix + 1);
  const iy0 = Math.max(0, iy - 1);
  const iy1 = Math.min(h - 1, iy + 1);
  const iz0 = Math.max(0, iz - 1);
  const iz1 = Math.min(d - 1, iz + 1);

  // Central differences
  const base = iz * wh + iy * w;
  const nx = sdf[base + ix1] - sdf[base + ix0];
  const ny = sdf[iz * wh + iy1 * w + ix] - sdf[iz * wh + iy0 * w + ix];
  const nz = sdf[iz1 * wh + iy * w + ix] - sdf[iz0 * wh + iy * w + ix];

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return [0, 1, 0];
  return [nx / len, ny / len, nz / len];
}

/**
 * Interpolate normal at a point between two grid vertices
 */
function interpolateNormal(
  sdf: Float32Array,
  w: number,
  h: number,
  d: number,
  ix0: number,
  iy0: number,
  iz0: number,
  ix1: number,
  iy1: number,
  iz1: number,
  t: number
): [number, number, number] {
  const n0 = calcNormalFromSDF(sdf, w, h, d, ix0, iy0, iz0);
  const n1 = calcNormalFromSDF(sdf, w, h, d, ix1, iy1, iz1);

  // Linear interpolation of normals
  const nx = n0[0] + t * (n1[0] - n0[0]);
  const ny = n0[1] + t * (n1[1] - n0[1]);
  const nz = n0[2] + t * (n1[2] - n0[2]);

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return [0, 1, 0];
  return [nx / len, ny / len, nz / len];
}

/**
 * Extract isosurface using Marching Cubes
 */
function extractIsosurface(
  sdfResult: SDFResult,
  isovalue: number
): SurfaceData {
  const { sdf, atomOwner, w, h, d, bounds, step } = sdfResult;
  const wh = w * h;

  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const atomIndices: number[] = [];
  const vertexMap = new Map<string, number>();

  // Corner offsets for marching cubes (in grid coordinates)
  const cornerOffsets = [
    [0, 0, 0], // 0
    [1, 0, 0], // 1
    [1, 1, 0], // 2
    [0, 1, 0], // 3
    [0, 0, 1], // 4
    [1, 0, 1], // 5
    [1, 1, 1], // 6
    [0, 1, 1], // 7
  ];

  const addVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    nearestAtomIndex: number
  ): number => {
    // Use rounded integer coordinates instead of toFixed(4) for faster hashing
    const kx = Math.round(x * 10000);
    const ky = Math.round(y * 10000);
    const kz = Math.round(z * 10000);
    const key = `${kx},${ky},${kz}`;
    if (vertexMap.has(key)) {
      return vertexMap.get(key)!;
    }
    const index = vertices.length / 3;
    vertices.push(x, y, z);
    normals.push(nx, ny, nz);
    atomIndices.push(nearestAtomIndex);
    vertexMap.set(key, index);
    return index;
  };

  // Process each cell
  for (let iz = 0; iz < d - 1; iz++) {
    for (let iy = 0; iy < h - 1; iy++) {
      for (let ix = 0; ix < w - 1; ix++) {
        // Get SDF values at the 8 corners
        const cornerIndices = cornerOffsets.map(
          ([dx, dy, dz]) => (iz + dz) * wh + (iy + dy) * w + (ix + dx)
        );
        const v = cornerIndices.map((idx) => sdf[idx] - isovalue);

        // Build cube index
        let cubeIndex = 0;
        for (let i = 0; i < 8; i++) {
          if (v[i] < 0) cubeIndex |= 1 << i;
        }

        // Skip if entirely inside or outside
        if (cubeIndex === 0 || cubeIndex === 255) continue;

        // Check edge mask
        const edgeMask = EDGE_TABLE[cubeIndex];
        if (edgeMask === 0) continue;

        // Get triangles
        const triangles = TRI_TABLE[cubeIndex];
        if (!triangles || triangles.length === 0) continue;

        // Corner world positions
        const corners = cornerOffsets.map(([dx, dy, dz]) => [
          bounds.minX + (ix + dx) * step,
          bounds.minY + (iy + dy) * step,
          bounds.minZ + (iz + dz) * step,
        ]);

        // Corner grid indices
        const cornerGridIndices = cornerOffsets.map(([dx, dy, dz]) => [
          ix + dx,
          iy + dy,
          iz + dz,
        ]);

        // Process triangles
        for (let i = 0; i < triangles.length; i += 3) {
          const triIndices: number[] = [];

          for (let j = 0; j < 3; j++) {
            const edge = triangles[i + j];
            if (edge === undefined || edge < 0) break;

            const [e0, e1] = EDGE_VERTICES[edge];
            const c0 = corners[e0];
            const c1 = corners[e1];
            const g0 = cornerGridIndices[e0];
            const g1 = cornerGridIndices[e1];
            const v0 = v[e0];
            const v1 = v[e1];

            // Interpolate position along edge
            const t = v0 / (v0 - v1);
            const px = c0[0] + t * (c1[0] - c0[0]);
            const py = c0[1] + t * (c1[1] - c0[1]);
            const pz = c0[2] + t * (c1[2] - c0[2]);

            // Interpolate normal
            const [nx, ny, nz] = interpolateNormal(
              sdf,
              w,
              h,
              d,
              g0[0],
              g0[1],
              g0[2],
              g1[0],
              g1[1],
              g1[2],
              t
            );

            // Get nearest atom from the corner closer to surface
            let nearestAtomIndex =
              Math.abs(v0) < Math.abs(v1)
                ? atomOwner[cornerIndices[e0]]
                : atomOwner[cornerIndices[e1]];

            // Fallback: if the closer corner has no owner, try the other corner
            if (nearestAtomIndex === -1) {
              nearestAtomIndex =
                Math.abs(v0) < Math.abs(v1)
                  ? atomOwner[cornerIndices[e1]]
                  : atomOwner[cornerIndices[e0]];
            }

            // If still no owner, default to first atom (shouldn't happen often)
            if (nearestAtomIndex === -1) {
              nearestAtomIndex = 0;
            }

            triIndices.push(addVertex(px, py, pz, nx, ny, nz, nearestAtomIndex));
          }

          if (triIndices.length === 3) {
            indices.push(triIndices[0], triIndices[1], triIndices[2]);
          }
        }
      }
    }
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    nearestAtomIndices: new Int32Array(atomIndices),
  };
}

export function calculateMolecularSurfaceArea(surface: SurfaceData): number {
  let area = 0;
  const vertices = surface.vertices;
  const indices = surface.indices;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const ax = vertices[i1] - vertices[i0];
    const ay = vertices[i1 + 1] - vertices[i0 + 1];
    const az = vertices[i1 + 2] - vertices[i0 + 2];
    const bx = vertices[i2] - vertices[i0];
    const by = vertices[i2 + 1] - vertices[i0 + 1];
    const bz = vertices[i2 + 2] - vertices[i0 + 2];

    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;

    area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
  }

  return area;
}
