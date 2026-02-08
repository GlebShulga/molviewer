import type { SurfaceData } from './surfaceGeneration';

/**
 * Build vertex adjacency list from triangle indices
 * For each vertex, find all vertices that share an edge with it
 */
function buildAdjacency(vertexCount: number, indices: Uint32Array): number[][] {
  const adjacency: Set<number>[] = Array.from(
    { length: vertexCount },
    () => new Set()
  );

  // Each triangle contributes 3 edges
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];

    // a-b edge
    adjacency[a].add(b);
    adjacency[b].add(a);
    // b-c edge
    adjacency[b].add(c);
    adjacency[c].add(b);
    // c-a edge
    adjacency[c].add(a);
    adjacency[a].add(c);
  }

  return adjacency.map(set => Array.from(set));
}

/**
 * Recompute vertex normals from triangle faces
 * Accumulates face normals to vertices, then normalizes
 */
function recomputeNormals(
  vertices: Float32Array,
  indices: Uint32Array
): Float32Array {
  const normals = new Float32Array(vertices.length);

  // Accumulate face normals to each vertex
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    // Edge vectors
    const ax = vertices[i1] - vertices[i0];
    const ay = vertices[i1 + 1] - vertices[i0 + 1];
    const az = vertices[i1 + 2] - vertices[i0 + 2];

    const bx = vertices[i2] - vertices[i0];
    const by = vertices[i2 + 1] - vertices[i0 + 1];
    const bz = vertices[i2 + 2] - vertices[i0 + 2];

    // Cross product = face normal (not normalized - area-weighted)
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    // Add to all three vertices of this triangle
    normals[i0] += nx;
    normals[i0 + 1] += ny;
    normals[i0 + 2] += nz;

    normals[i1] += nx;
    normals[i1 + 1] += ny;
    normals[i1 + 2] += nz;

    normals[i2] += nx;
    normals[i2 + 1] += ny;
    normals[i2 + 2] += nz;
  }

  // Normalize all vertex normals
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(
      normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2
    );
    if (len > 0) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }

  return normals;
}

/**
 * Laplacian mesh smoothing
 *
 * Moves each vertex toward the centroid of its neighbors:
 *   newPos = oldPos + λ × (avgNeighborPos - oldPos)
 *
 * @param surface - Input surface mesh
 * @param iterations - Number of smoothing passes (default: 2)
 * @param lambda - Smoothing factor 0-1 (default: 0.5, higher = more smoothing)
 * @returns Smoothed surface with recomputed normals
 */
export function laplacianSmooth(
  surface: SurfaceData,
  iterations: number = 2,
  lambda: number = 0.5
): SurfaceData {
  // Copy vertices (don't mutate original)
  const vertices = new Float32Array(surface.vertices);
  const vertexCount = vertices.length / 3;

  // Build adjacency once (doesn't change during smoothing)
  const adjacency = buildAdjacency(vertexCount, surface.indices);

  // Perform smoothing iterations
  for (let iter = 0; iter < iterations; iter++) {
    const newPositions = new Float32Array(vertices.length);

    for (let i = 0; i < vertexCount; i++) {
      const neighbors = adjacency[i];
      const i3 = i * 3;

      if (neighbors.length === 0) {
        // Isolated vertex - keep original position
        newPositions[i3] = vertices[i3];
        newPositions[i3 + 1] = vertices[i3 + 1];
        newPositions[i3 + 2] = vertices[i3 + 2];
        continue;
      }

      // Compute centroid of neighbors
      let avgX = 0, avgY = 0, avgZ = 0;
      for (const j of neighbors) {
        avgX += vertices[j * 3];
        avgY += vertices[j * 3 + 1];
        avgZ += vertices[j * 3 + 2];
      }
      avgX /= neighbors.length;
      avgY /= neighbors.length;
      avgZ /= neighbors.length;

      // Move vertex toward centroid
      newPositions[i3] = vertices[i3] + lambda * (avgX - vertices[i3]);
      newPositions[i3 + 1] = vertices[i3 + 1] + lambda * (avgY - vertices[i3 + 1]);
      newPositions[i3 + 2] = vertices[i3 + 2] + lambda * (avgZ - vertices[i3 + 2]);
    }

    // Update vertices for next iteration
    vertices.set(newPositions);
  }

  // Recompute normals after smoothing (positions changed)
  const normals = recomputeNormals(vertices, surface.indices);

  return {
    vertices,
    normals,
    indices: surface.indices,
    nearestAtomIndices: surface.nearestAtomIndices,
  };
}
