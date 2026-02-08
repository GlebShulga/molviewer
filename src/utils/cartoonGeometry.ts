import * as THREE from 'three';
import type { SplinePoint } from './splineGeneration';

// Geometry parameters
const HELIX_RADIUS = 1.5;
const HELIX_SEGMENTS = 8;

const SHEET_WIDTH = 2.0;
const SHEET_THICKNESS = 0.5;
const ARROW_HEAD_WIDTH = 3.0;
const ARROW_HEAD_LENGTH = 3; // Number of spline points for arrow

const COIL_RADIUS = 0.3;
const COIL_SEGMENTS = 6;

/**
 * Generate tube geometry for helix representation.
 * Creates a smooth cylinder along the spline path.
 * @param splinePoints - Array of spline points defining the path
 * @param radius - Tube radius
 * @param radialSegments - Number of segments around the tube circumference
 * @param colors - Optional array of colors per spline point for vertex coloring
 */
export function generateHelixGeometry(
  splinePoints: SplinePoint[],
  radius: number = HELIX_RADIUS,
  radialSegments: number = HELIX_SEGMENTS,
  colors?: THREE.Color[]
): THREE.BufferGeometry {
  if (splinePoints.length < 2) {
    return new THREE.BufferGeometry();
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const vertexColors: number[] = [];
  const hasColors = colors && colors.length === splinePoints.length;

  const numPoints = splinePoints.length;

  // Generate vertices around each spline point
  for (let i = 0; i < numPoints; i++) {
    const sp = splinePoints[i];
    const color = hasColors ? colors[i] : null;

    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Position on circle perpendicular to tangent
      const offset = sp.normal.clone().multiplyScalar(cos * radius)
        .add(sp.binormal.clone().multiplyScalar(sin * radius));

      const vertex = sp.position.clone().add(offset);
      positions.push(vertex.x, vertex.y, vertex.z);

      // Normal points outward from tube center
      const normal = offset.clone().normalize();
      normals.push(normal.x, normal.y, normal.z);

      // Vertex color (same color for all vertices of this ring)
      if (color) {
        vertexColors.push(color.r, color.g, color.b);
      }
    }
  }

  // Generate indices for triangles
  const vertsPerRow = radialSegments + 1;
  for (let i = 0; i < numPoints - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * vertsPerRow + j;
      const b = a + 1;
      const c = a + vertsPerRow;
      const d = c + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (hasColors) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  }
  geometry.setIndex(indices);

  return geometry;
}

/**
 * Generate flat ribbon geometry with arrow head for sheet representation.
 * The arrow points in the C-terminus direction.
 * @param splinePoints - Array of spline points defining the path
 * @param width - Ribbon width
 * @param thickness - Ribbon thickness
 * @param arrowHeadWidth - Width of the arrow head
 * @param arrowHeadLength - Length of the arrow head in spline points
 * @param colors - Optional array of colors per spline point for vertex coloring
 */
export function generateSheetGeometry(
  splinePoints: SplinePoint[],
  width: number = SHEET_WIDTH,
  thickness: number = SHEET_THICKNESS,
  arrowHeadWidth: number = ARROW_HEAD_WIDTH,
  arrowHeadLength: number = ARROW_HEAD_LENGTH,
  colors?: THREE.Color[]
): THREE.BufferGeometry {
  if (splinePoints.length < 2) {
    return new THREE.BufferGeometry();
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const vertexColors: number[] = [];
  const hasColors = colors && colors.length === splinePoints.length;

  const numPoints = splinePoints.length;
  const arrowStart = Math.max(0, numPoints - arrowHeadLength);

  // For each point, create 4 vertices (top-left, top-right, bottom-right, bottom-left)
  for (let i = 0; i < numPoints; i++) {
    const sp = splinePoints[i];
    const color = hasColors ? colors[i] : null;

    // Calculate width at this point (wider at arrow head)
    let currentWidth = width;
    if (i >= arrowStart) {
      const arrowT = (i - arrowStart) / arrowHeadLength;
      currentWidth = width + (arrowHeadWidth - width) * (1 - arrowT);
    }
    // Taper to point at very end
    if (i === numPoints - 1) {
      currentWidth = 0.1;
    }

    const halfWidth = currentWidth / 2;
    const halfThickness = thickness / 2;

    // Four corners of the ribbon cross-section
    // Top-left
    const tl = sp.position.clone()
      .add(sp.normal.clone().multiplyScalar(halfThickness))
      .add(sp.binormal.clone().multiplyScalar(-halfWidth));
    // Top-right
    const tr = sp.position.clone()
      .add(sp.normal.clone().multiplyScalar(halfThickness))
      .add(sp.binormal.clone().multiplyScalar(halfWidth));
    // Bottom-right
    const br = sp.position.clone()
      .add(sp.normal.clone().multiplyScalar(-halfThickness))
      .add(sp.binormal.clone().multiplyScalar(halfWidth));
    // Bottom-left
    const bl = sp.position.clone()
      .add(sp.normal.clone().multiplyScalar(-halfThickness))
      .add(sp.binormal.clone().multiplyScalar(-halfWidth));

    positions.push(
      tl.x, tl.y, tl.z,  // 0: top-left
      tr.x, tr.y, tr.z,  // 1: top-right
      br.x, br.y, br.z,  // 2: bottom-right
      bl.x, bl.y, bl.z   // 3: bottom-left
    );

    // Normals - pointing outward from each face
    normals.push(
      sp.normal.x, sp.normal.y, sp.normal.z,     // top face normal
      sp.normal.x, sp.normal.y, sp.normal.z,     // top face normal
      -sp.normal.x, -sp.normal.y, -sp.normal.z,  // bottom face normal
      -sp.normal.x, -sp.normal.y, -sp.normal.z   // bottom face normal
    );

    // Vertex colors (same color for all 4 vertices of this cross-section)
    if (color) {
      for (let v = 0; v < 4; v++) {
        vertexColors.push(color.r, color.g, color.b);
      }
    }
  }

  // Generate indices for each face
  const vertsPerRow = 4;
  for (let i = 0; i < numPoints - 1; i++) {
    const base = i * vertsPerRow;
    const next = (i + 1) * vertsPerRow;

    // Top face (0, 1)
    indices.push(base + 0, next + 0, base + 1);
    indices.push(base + 1, next + 0, next + 1);

    // Bottom face (2, 3)
    indices.push(base + 3, base + 2, next + 3);
    indices.push(next + 3, base + 2, next + 2);

    // Left side (0, 3)
    indices.push(base + 3, next + 3, base + 0);
    indices.push(base + 0, next + 3, next + 0);

    // Right side (1, 2)
    indices.push(base + 1, next + 1, base + 2);
    indices.push(base + 2, next + 1, next + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (hasColors) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); // Smooth normals

  return geometry;
}

/**
 * Generate thin tube geometry for coil/loop representation.
 * @param splinePoints - Array of spline points defining the path
 * @param radius - Tube radius
 * @param radialSegments - Number of segments around the tube circumference
 * @param colors - Optional array of colors per spline point for vertex coloring
 */
export function generateCoilGeometry(
  splinePoints: SplinePoint[],
  radius: number = COIL_RADIUS,
  radialSegments: number = COIL_SEGMENTS,
  colors?: THREE.Color[]
): THREE.BufferGeometry {
  // Coils use the same tube geometry as helices, just thinner
  return generateHelixGeometry(splinePoints, radius, radialSegments, colors);
}

/**
 * Merge multiple geometries into one for better rendering performance.
 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  if (geometries.length === 1) {
    return geometries[0];
  }

  let totalPositions = 0;
  let totalNormals = 0;
  let totalIndices = 0;

  for (const geom of geometries) {
    const pos = geom.getAttribute('position');
    const norm = geom.getAttribute('normal');
    const idx = geom.getIndex();

    if (pos) totalPositions += pos.count * 3;
    if (norm) totalNormals += norm.count * 3;
    if (idx) totalIndices += idx.count;
  }

  const positions = new Float32Array(totalPositions);
  const normals = new Float32Array(totalNormals);
  const indices: number[] = [];

  let posOffset = 0;
  let normOffset = 0;
  let vertexOffset = 0;

  for (const geom of geometries) {
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const norm = geom.getAttribute('normal') as THREE.BufferAttribute;
    const idx = geom.getIndex();

    if (pos) {
      positions.set(pos.array as Float32Array, posOffset);
      posOffset += pos.count * 3;
    }

    if (norm) {
      normals.set(norm.array as Float32Array, normOffset);
      normOffset += norm.count * 3;
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + vertexOffset);
      }
    }

    if (pos) {
      vertexOffset += pos.count;
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(indices);

  return merged;
}
