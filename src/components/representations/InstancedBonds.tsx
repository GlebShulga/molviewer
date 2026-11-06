import { useMemo, useEffect } from "react";
import * as THREE from "three";

// Module-level temporaries: writeSegmentMatrix allocates nothing per bond.
const UP = new THREE.Vector3(0, 1, 0);
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Writes, at slot `i` of `out`, the matrix that stretches a unit-height cylinder
 * along Y (ends at y = ±0.5) from p1 to p2.
 */
export function writeSegmentMatrix(
  out: Float32Array,
  i: number,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
): void {
  _mid.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  _dir.set(x2 - x1, y2 - y1, z2 - z1);
  const length = _dir.length();
  _dir.normalize();
  _q.setFromUnitVectors(UP, _dir);
  _s.set(1, length, 1);
  _m.compose(_mid, _q, _s).toArray(out, i * 16);
}

/**
 * One InstancedMesh for all bonds, filled from typed arrays (16 floats of
 * matrix per bond, and optionally 3 of colour). drei's `createInstances` gave
 * every bond a React element and an Object3D, registered one at a time
 * (quadratic) and walked every frame: 4V6X took 50 s to switch to and ran at
 * 9 fps. The geometry and material stay owned by the caller.
 */
export function createBondMesh(
  matrices: Float32Array,
  colors: Float32Array | undefined,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.InstancedMesh {
  // Built with count 0, then given our matrices: with a count, the constructor
  // would allocate its own n * 16 floats and write an identity into each.
  const mesh = new THREE.InstancedMesh(geometry, material, 0);
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
  mesh.count = matrices.length / 16;
  if (colors) mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  // Frustum culling uses the instances' bounding sphere: compute it from all of them.
  mesh.computeBoundingSphere();
  // Bonds take no pointer events (drei's parent mesh did the same).
  mesh.raycast = () => {};
  return mesh;
}

interface InstancedBondsProps {
  /** Matrices in the parent's local space, from writeSegmentMatrix. */
  matrices: Float32Array;
  /** Per-bond colours (r, g, b), multiplied with the material colour. */
  colors?: Float32Array;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** All bonds as one InstancedMesh: no React element or Object3D per bond. */
export function InstancedBonds({ matrices, colors, geometry, material }: InstancedBondsProps) {
  const mesh = useMemo(
    () => createBondMesh(matrices, colors, geometry, material),
    [matrices, colors, geometry, material],
  );
  // R3F never disposes a <primitive>. This frees the instance buffers only.
  useEffect(() => () => {
    mesh.dispose();
  }, [mesh]);
  return <primitive object={mesh} />;
}
