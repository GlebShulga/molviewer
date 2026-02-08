import * as THREE from 'three';
import type { Atom } from '../types';

/**
 * Octree-based spatial structure for hierarchical Level of Detail (LOD).
 *
 * Enables rendering of millions of atoms by clustering distant atoms
 * into representative spheres, reducing vertex count by 99%+ at far zoom.
 *
 * Key features:
 * - Hierarchical spatial partitioning (octree)
 * - Cluster aggregation (average position, color, bounding radius)
 * - Frustum culling support
 * - Adaptive LOD based on screen-space size
 *
 * @example
 * ```typescript
 * const octree = new MoleculeOctree(atoms, { maxAtomsPerLeaf: 64 });
 *
 * // Each frame:
 * const visible = octree.getVisibleData(camera, lodThreshold);
 * // visible.atoms - individual atoms to render
 * // visible.clusters - clusters to render as single spheres
 * ```
 */

export interface OctreeOptions {
  /** Maximum atoms per leaf node before splitting (default: 64) */
  maxAtomsPerLeaf?: number;
  /** Maximum tree depth (default: 10) */
  maxDepth?: number;
  /** Minimum node size in Angstroms (default: 1.0) */
  minNodeSize?: number;
}

export interface ClusterData {
  /** Cluster center (average of atom positions) */
  center: THREE.Vector3;
  /** Average color of atoms in cluster */
  color: THREE.Color;
  /** Bounding radius (distance from center to farthest atom + atom radius) */
  boundingRadius: number;
  /** Number of atoms in this cluster */
  atomCount: number;
  /** Indices of atoms in this cluster */
  atomIndices: number[];
}

export interface OctreeNode {
  /** Axis-aligned bounding box */
  bounds: THREE.Box3;
  /** Indices of atoms contained in this node (empty for internal nodes) */
  atomIndices: number[];
  /** Child nodes (null for leaf nodes) */
  children: OctreeNode[] | null;
  /** Precomputed cluster data for LOD rendering */
  cluster: ClusterData;
  /** Depth in tree (0 = root) */
  depth: number;
  /** Whether this is a leaf node */
  isLeaf: boolean;
}

export interface VisibleData {
  /** Individual atom indices to render at full detail */
  atoms: number[];
  /** Clusters to render as single representative spheres */
  clusters: ClusterData[];
}

/**
 * Octree for efficient spatial queries and LOD rendering.
 */
export class MoleculeOctree {
  private root: OctreeNode | null = null;
  private atomPositions: THREE.Vector3[] = [];
  private atomColors: THREE.Color[] = [];
  private atomRadii: number[] = [];
  private options: Required<OctreeOptions>;

  // Reusable objects for performance
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private tempSphere = new THREE.Sphere();
  private tempVector = new THREE.Vector3();

  constructor(options: OctreeOptions = {}) {
    this.options = {
      maxAtomsPerLeaf: options.maxAtomsPerLeaf ?? 64,
      maxDepth: options.maxDepth ?? 10,
      minNodeSize: options.minNodeSize ?? 1.0,
    };
  }

  /**
   * Build the octree from atom data.
   *
   * @param atoms - Array of atoms
   * @param positions - Pre-computed THREE.Vector3 positions
   * @param colors - Pre-computed THREE.Color for each atom
   * @param radii - Radius of each atom
   */
  build(
    atoms: Atom[],
    positions: THREE.Vector3[],
    colors: THREE.Color[],
    radii: number[]
  ): void {
    this.atomPositions = positions;
    this.atomColors = colors;
    this.atomRadii = radii;

    if (atoms.length === 0) {
      this.root = null;
      return;
    }

    // Compute bounding box of all atoms
    const bounds = new THREE.Box3();
    for (let i = 0; i < positions.length; i++) {
      bounds.expandByPoint(positions[i]);
    }

    // Expand bounds slightly to ensure all atoms fit
    bounds.expandByScalar(Math.max(...radii) * 2);

    // Make bounds cubic for uniform octree subdivision
    const size = bounds.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const center = bounds.getCenter(new THREE.Vector3());
    bounds.setFromCenterAndSize(center, new THREE.Vector3(maxSize, maxSize, maxSize));

    // Build tree recursively
    const allIndices = Array.from({ length: atoms.length }, (_, i) => i);
    this.root = this.buildNode(bounds, allIndices, 0);
  }

  private buildNode(bounds: THREE.Box3, indices: number[], depth: number): OctreeNode {
    // Compute cluster data for this node
    const cluster = this.computeCluster(indices);

    // Check termination conditions
    const size = bounds.getSize(this.tempVector);
    const shouldSplit =
      indices.length > this.options.maxAtomsPerLeaf &&
      depth < this.options.maxDepth &&
      size.x > this.options.minNodeSize;

    if (!shouldSplit) {
      // Create leaf node
      return {
        bounds: bounds.clone(),
        atomIndices: indices,
        children: null,
        cluster,
        depth,
        isLeaf: true,
      };
    }

    // Split into 8 children
    const center = bounds.getCenter(new THREE.Vector3());
    const children: OctreeNode[] = [];
    const childBounds: THREE.Box3[] = [];

    // Create 8 child bounding boxes
    for (let i = 0; i < 8; i++) {
      const xMin = (i & 1) === 0 ? bounds.min.x : center.x;
      const xMax = (i & 1) === 0 ? center.x : bounds.max.x;
      const yMin = (i & 2) === 0 ? bounds.min.y : center.y;
      const yMax = (i & 2) === 0 ? center.y : bounds.max.y;
      const zMin = (i & 4) === 0 ? bounds.min.z : center.z;
      const zMax = (i & 4) === 0 ? center.z : bounds.max.z;

      childBounds.push(
        new THREE.Box3(
          new THREE.Vector3(xMin, yMin, zMin),
          new THREE.Vector3(xMax, yMax, zMax)
        )
      );
    }

    // Partition atoms into children
    const childIndices: number[][] = [[], [], [], [], [], [], [], []];

    for (const idx of indices) {
      const pos = this.atomPositions[idx];
      const childIdx =
        (pos.x >= center.x ? 1 : 0) +
        (pos.y >= center.y ? 2 : 0) +
        (pos.z >= center.z ? 4 : 0);
      childIndices[childIdx].push(idx);
    }

    // Build non-empty children
    for (let i = 0; i < 8; i++) {
      if (childIndices[i].length > 0) {
        children.push(this.buildNode(childBounds[i], childIndices[i], depth + 1));
      }
    }

    return {
      bounds: bounds.clone(),
      atomIndices: [], // Internal nodes don't store atoms directly
      children: children.length > 0 ? children : null,
      cluster,
      depth,
      isLeaf: false,
    };
  }

  private computeCluster(indices: number[]): ClusterData {
    if (indices.length === 0) {
      return {
        center: new THREE.Vector3(),
        color: new THREE.Color(0x888888),
        boundingRadius: 0,
        atomCount: 0,
        atomIndices: [],
      };
    }

    // Compute average position
    const center = new THREE.Vector3();
    for (const idx of indices) {
      center.add(this.atomPositions[idx]);
    }
    center.divideScalar(indices.length);

    // Compute average color
    const color = new THREE.Color(0, 0, 0);
    for (const idx of indices) {
      color.add(this.atomColors[idx]);
    }
    color.multiplyScalar(1 / indices.length);

    // Compute bounding radius
    let maxDist = 0;
    for (const idx of indices) {
      const dist = center.distanceTo(this.atomPositions[idx]) + this.atomRadii[idx];
      maxDist = Math.max(maxDist, dist);
    }

    return {
      center: center.clone(),
      color: color.clone(),
      boundingRadius: maxDist,
      atomCount: indices.length,
      atomIndices: [...indices],
    };
  }

  /**
   * Get visible atoms and clusters based on camera and LOD threshold.
   *
   * @param camera - THREE.Camera for frustum culling and LOD calculation
   * @param lodThreshold - Screen-space size threshold (pixels) for LOD switching
   * @param enableFrustumCulling - Whether to cull nodes outside camera frustum
   * @returns Object with individual atoms and clusters to render
   */
  getVisibleData(
    camera: THREE.Camera,
    lodThreshold: number = 10,
    enableFrustumCulling: boolean = true
  ): VisibleData {
    const result: VisibleData = {
      atoms: [],
      clusters: [],
    };

    if (!this.root) return result;

    // Update frustum
    if (enableFrustumCulling) {
      this.projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    }

    // Traverse tree
    this.traverseNode(this.root, camera, lodThreshold, enableFrustumCulling, result);

    return result;
  }

  private traverseNode(
    node: OctreeNode,
    camera: THREE.Camera,
    lodThreshold: number,
    enableFrustumCulling: boolean,
    result: VisibleData
  ): void {
    // Frustum culling
    if (enableFrustumCulling) {
      this.tempSphere.set(node.cluster.center, node.cluster.boundingRadius);
      if (!this.frustum.intersectsSphere(this.tempSphere)) {
        return; // Node completely outside frustum
      }
    }

    // Calculate screen-space size
    const screenSize = this.getScreenSize(node.cluster.center, node.cluster.boundingRadius, camera);

    // LOD decision
    if (screenSize < lodThreshold || node.isLeaf) {
      if (node.isLeaf && screenSize >= lodThreshold) {
        // Leaf node with sufficient screen size - render individual atoms
        result.atoms.push(...node.atomIndices);
      } else {
        // Node too small on screen - render as cluster
        result.clusters.push(node.cluster);
      }
    } else {
      // Node large on screen - recurse into children
      if (node.children) {
        for (const child of node.children) {
          this.traverseNode(child, camera, lodThreshold, enableFrustumCulling, result);
        }
      }
    }
  }

  /**
   * Calculate the screen-space size of a sphere in pixels.
   */
  private getScreenSize(
    center: THREE.Vector3,
    radius: number,
    camera: THREE.Camera
  ): number {
    // Get distance from camera
    this.tempVector.copy(center);
    const distance = this.tempVector.sub(camera.position).length();

    if (distance === 0) return Infinity;

    // For perspective camera, calculate projected size
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspCamera = camera as THREE.PerspectiveCamera;
      const fov = perspCamera.fov * (Math.PI / 180);
      const height = 2 * Math.tan(fov / 2) * distance;
      const screenHeight = perspCamera.getFilmHeight?.() ?? 1080;
      return (radius / height) * screenHeight * 2;
    }

    // For orthographic camera
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const orthoCamera = camera as THREE.OrthographicCamera;
      const height = orthoCamera.top - orthoCamera.bottom;
      return (radius / height) * 1080 * 2; // Assume 1080p
    }

    return radius * 100; // Fallback
  }

  /**
   * Get statistics about the octree.
   */
  getStats(): {
    totalNodes: number;
    leafNodes: number;
    maxDepth: number;
    avgAtomsPerLeaf: number;
  } {
    if (!this.root) {
      return { totalNodes: 0, leafNodes: 0, maxDepth: 0, avgAtomsPerLeaf: 0 };
    }

    let totalNodes = 0;
    let leafNodes = 0;
    let maxDepth = 0;
    let totalAtomsInLeaves = 0;

    const traverse = (node: OctreeNode) => {
      totalNodes++;
      maxDepth = Math.max(maxDepth, node.depth);

      if (node.isLeaf) {
        leafNodes++;
        totalAtomsInLeaves += node.atomIndices.length;
      } else if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(this.root);

    return {
      totalNodes,
      leafNodes,
      maxDepth,
      avgAtomsPerLeaf: leafNodes > 0 ? totalAtomsInLeaves / leafNodes : 0,
    };
  }

  /**
   * Check if the octree has been built.
   */
  isBuilt(): boolean {
    return this.root !== null;
  }

  /**
   * Get the root node (for debugging/visualization).
   */
  getRoot(): OctreeNode | null {
    return this.root;
  }

  /**
   * Clear the octree.
   */
  clear(): void {
    this.root = null;
    this.atomPositions = [];
    this.atomColors = [];
    this.atomRadii = [];
  }
}

/**
 * Default LOD thresholds for different quality levels.
 */
export const LOD_THRESHOLDS = {
  /** High quality - more individual atoms, fewer clusters */
  high: 5,
  /** Medium quality - balanced */
  medium: 10,
  /** Low quality - more clusters, better performance */
  low: 20,
  /** Ultra low - maximum clustering */
  ultraLow: 50,
} as const;

/**
 * Estimate memory usage for octree with given atom count.
 */
export function estimateOctreeMemory(atomCount: number): number {
  // Rough estimate: ~100 bytes per node, ~1 node per 32 atoms on average
  const estimatedNodes = Math.ceil(atomCount / 32) * 2; // Internal nodes roughly double
  const bytesPerNode = 100;
  return estimatedNodes * bytesPerNode;
}
