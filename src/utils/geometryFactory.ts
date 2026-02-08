import * as THREE from 'three';
import { GEOMETRY } from '../config';

/**
 * Creates a sphere geometry with standard parameters.
 * Used for atom visualization.
 */
export function createSphereGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(
    GEOMETRY.sphere.radius,
    GEOMETRY.sphere.widthSegments,
    GEOMETRY.sphere.heightSegments
  );
}

/**
 * Creates a cylinder geometry for bond visualization.
 */
export function createCylinderGeometry(radius: number): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(
    radius,
    radius,
    1,
    GEOMETRY.cylinder.radialSegments,
    GEOMETRY.cylinder.heightSegments
  );
}
