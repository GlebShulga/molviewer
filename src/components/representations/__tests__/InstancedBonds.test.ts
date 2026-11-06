import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createBondMesh, writeSegmentMatrix } from '../InstancedBonds';

type P = [number, number, number];

/** Where the unit cylinder's two ends (y = -0.5 and y = +0.5) land under slot i. */
function ends(out: Float32Array, i: number): [THREE.Vector3, THREE.Vector3] {
  const m = new THREE.Matrix4().fromArray(out, i * 16);
  return [new THREE.Vector3(0, -0.5, 0).applyMatrix4(m), new THREE.Vector3(0, 0.5, 0).applyMatrix4(m)];
}

function expectAt(v: THREE.Vector3, p: P) {
  expect(v.x).toBeCloseTo(p[0], 5);
  expect(v.y).toBeCloseTo(p[1], 5);
  expect(v.z).toBeCloseTo(p[2], 5);
}

describe('writeSegmentMatrix', () => {
  const cases: Array<[string, P, P]> = [
    ['along +Y', [1, 2, 3], [1, 5, 3]],
    ['along -Y (antiparallel to the cylinder axis)', [1, 5, 3], [1, 2, 3]],
    ['diagonal', [-1, 0.5, 2], [0.3, -1.2, 4.1]],
  ];

  for (const [name, p1, p2] of cases) {
    it(`puts the cylinder's ends on the bond's atoms, ${name}`, () => {
      const out = new Float32Array(16);
      writeSegmentMatrix(out, 0, ...p1, ...p2);
      const [a, b] = ends(out, 0);
      expectAt(a, p1);
      expectAt(b, p2);
    });
  }

  it('writes slot i without touching the others', () => {
    const out = new Float32Array(3 * 16);
    writeSegmentMatrix(out, 1, 0, 0, 0, 1, 0, 0);
    expect(out.subarray(0, 16).every((v) => v === 0)).toBe(true);
    expect(out.subarray(32, 48).every((v) => v === 0)).toBe(true);
    expectAt(ends(out, 1)[1], [1, 0, 0]);
  });

  it('gives no NaN for a zero-length bond', () => {
    const out = new Float32Array(16);
    writeSegmentMatrix(out, 0, 2, 2, 2, 2, 2, 2);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    const [a, b] = ends(out, 0);
    expectAt(a, [2, 2, 2]);
    expectAt(b, [2, 2, 2]);
  });
});

describe('createBondMesh', () => {
  const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
  const material = new THREE.MeshStandardMaterial();
  const bonds: Array<[P, P]> = [
    [[0, 0, 0], [1, 0, 0]],
    [[10, -3, 2], [11, -2, 2]],
  ];
  const matrices = new Float32Array(bonds.length * 16);
  bonds.forEach(([p1, p2], i) => writeSegmentMatrix(matrices, i, ...p1, ...p2));

  it('has one instance per bond and no colours without them', () => {
    const mesh = createBondMesh(matrices, undefined, geometry, material);
    expect(mesh.count).toBe(2);
    expect(mesh.instanceColor).toBeNull();
    expect(mesh.instanceMatrix.array).toBe(matrices);
  });

  it('carries per-bond colours when given', () => {
    const colors = new Float32Array([1, 0, 0, 0, 0, 1]);
    const mesh = createBondMesh(matrices, colors, geometry, material);
    const c = new THREE.Color();
    mesh.getColorAt(1, c);
    expect([c.r, c.g, c.b]).toEqual([0, 0, 1]);
  });

  it('has a bounding sphere that holds every bond end', () => {
    const mesh = createBondMesh(matrices, undefined, geometry, material);
    const sphere = mesh.boundingSphere!;
    for (const [p1, p2] of bonds) {
      expect(sphere.containsPoint(new THREE.Vector3(...p1))).toBe(true);
      expect(sphere.containsPoint(new THREE.Vector3(...p2))).toBe(true);
    }
  });

  it('takes no pointer events', () => {
    const mesh = createBondMesh(matrices, undefined, geometry, material);
    const hits: THREE.Intersection[] = [];
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0.5, 0, 5), new THREE.Vector3(0, 0, -1));
    mesh.updateMatrixWorld();
    raycaster.intersectObject(mesh, false, hits);
    expect(hits).toHaveLength(0);
  });
});
