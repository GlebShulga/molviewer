import * as THREE from 'three';
import type { BackboneChain, BackboneResidue } from './backboneExtraction';
import type { SecondaryStructure } from '../types';

export interface SplinePoint {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  secondaryStructure: SecondaryStructure;
  residueIndex: number;
  chainId: string;
}

/**
 * Calculate a perpendicular vector to the tangent
 * Uses C->O direction for sheets when available for consistent orientation
 */
function calculateNormal(
  tangent: THREE.Vector3,
  residue: BackboneResidue,
  prevNormal?: THREE.Vector3
): THREE.Vector3 {
  // For sheets, try to use C->O vector for consistent orientation
  if (residue.secondaryStructure === 'sheet' && residue.c && residue.o) {
    const coDir = new THREE.Vector3(
      residue.o.x - residue.c.x,
      residue.o.y - residue.c.y,
      residue.o.z - residue.c.z
    ).normalize();

    // Project onto plane perpendicular to tangent
    const normal = coDir.clone()
      .sub(tangent.clone().multiplyScalar(coDir.dot(tangent)))
      .normalize();

    if (normal.length() > 0.1) {
      return normal;
    }
  }

  // Use previous normal with minimal rotation (parallel transport)
  if (prevNormal) {
    const projected = prevNormal.clone()
      .sub(tangent.clone().multiplyScalar(prevNormal.dot(tangent)));
    if (projected.length() > 0.1) {
      return projected.normalize();
    }
  }

  // Fallback: find perpendicular using arbitrary vector
  const arbitrary = Math.abs(tangent.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);

  return new THREE.Vector3()
    .crossVectors(tangent, arbitrary)
    .normalize();
}

/**
 * Generate a smooth spline through backbone CA positions using Catmull-Rom interpolation.
 * Returns an array of SplinePoints with position, tangent, normal, and binormal vectors.
 *
 * @param chain - The backbone chain to process
 * @param subdivisions - Number of interpolated points between each residue
 */
export function generateBackboneSpline(
  chain: BackboneChain,
  subdivisions: number = 4
): SplinePoint[] {
  const residues = chain.residues;
  if (residues.length < 2) return [];

  // Create control points from backbone positions (P for nucleic acids, CA for proteins)
  const controlPoints = residues.map(r => {
    const pos = r.p ?? r.ca;
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  });

  // Create Catmull-Rom curve
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.5);

  const totalPoints = (residues.length - 1) * subdivisions + 1;
  const splinePoints: SplinePoint[] = [];

  let prevNormal: THREE.Vector3 | undefined;

  for (let i = 0; i < totalPoints; i++) {
    const t = i / (totalPoints - 1);
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();

    // Determine which residue this point corresponds to
    const residueT = t * (residues.length - 1);
    const residueIndex = Math.min(Math.floor(residueT), residues.length - 1);
    const residue = residues[residueIndex];

    // Calculate normal and binormal
    const normal = calculateNormal(tangent, residue, prevNormal);
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    // Ensure consistent orientation by checking if normal flipped
    if (prevNormal && normal.dot(prevNormal) < 0) {
      normal.negate();
      binormal.negate();
    }

    prevNormal = normal.clone();

    splinePoints.push({
      position,
      tangent,
      normal,
      binormal,
      secondaryStructure: residue.secondaryStructure,
      residueIndex,
      chainId: chain.chainId,
    });
  }

  return splinePoints;
}

/**
 * Segment a spline by secondary structure type.
 * Returns arrays of consecutive SplinePoints grouped by their secondary structure.
 */
export interface SplineSegment {
  type: SecondaryStructure;
  points: SplinePoint[];
  startResidueIndex: number;
  endResidueIndex: number;
}

export function segmentSplineByStructure(splinePoints: SplinePoint[]): SplineSegment[] {
  if (splinePoints.length === 0) return [];

  const segments: SplineSegment[] = [];
  let currentSegment: SplineSegment = {
    type: splinePoints[0].secondaryStructure,
    points: [splinePoints[0]],
    startResidueIndex: splinePoints[0].residueIndex,
    endResidueIndex: splinePoints[0].residueIndex,
  };

  for (let i = 1; i < splinePoints.length; i++) {
    const point = splinePoints[i];

    if (point.secondaryStructure === currentSegment.type) {
      currentSegment.points.push(point);
      currentSegment.endResidueIndex = point.residueIndex;
    } else {
      // Save current segment and start new one
      segments.push(currentSegment);
      currentSegment = {
        type: point.secondaryStructure,
        points: [point],
        startResidueIndex: point.residueIndex,
        endResidueIndex: point.residueIndex,
      };
    }
  }

  // Don't forget the last segment
  segments.push(currentSegment);

  return segments;
}
