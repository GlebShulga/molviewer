import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildExportScene,
  chooseSphereDetail,
  exportModel,
  geometryTriangleCount,
  mergeInstances,
  sphereTriangleCount,
  SPHERE_DETAIL_LEVELS,
} from '../exportModel';

const BOX_TRIS = 12;
const SPHERE_16_12 = sphereTriangleCount(16, 12);

// jsdom's Blob lacks arrayBuffer(), which GLTFExporter uses for GLB output.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return readBlob(this);
  };
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Impostor-style InstancedMesh: flat quads + per-instance radius/color attributes. */
function makeImpostors(centers: [number, number, number][], radii: number[], colors: number[]) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute(
    'instanceRadius',
    new THREE.InstancedBufferAttribute(new Float32Array(radii), 1)
  );
  geometry.setAttribute(
    'instanceColor',
    new THREE.InstancedBufferAttribute(new Float32Array(colors), 3)
  );
  const mesh = new THREE.InstancedMesh(geometry, new THREE.ShaderMaterial(), centers.length);
  mesh.userData.exportAs = 'spheres';
  const m = new THREE.Matrix4();
  centers.forEach((c, i) => mesh.setMatrixAt(i, m.makeTranslation(c[0], c[1], c[2])));
  return mesh;
}

function makeScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight());

  // Structure 1: impostor atoms (2) + instanced bonds (3 boxes, first one red).
  const s1 = new THREE.Group();
  s1.add(
    makeImpostors(
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
      [1, 0.5],
      [1, 0, 0, 0, 0, 1]
    )
  );
  const bonds = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
    3
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < 3; i++) bonds.setMatrixAt(i, m.makeTranslation(i * 2, 5, 0));
  bonds.setColorAt(0, new THREE.Color(1, 0, 0));
  bonds.setColorAt(1, new THREE.Color(1, 1, 1));
  bonds.setColorAt(2, new THREE.Color(1, 1, 1));
  s1.add(bonds);
  scene.add(s1);

  // Structure 2, side by side: offset group with a cartoon-like mesh and a sphere atom.
  const s2 = new THREE.Group();
  s2.position.set(100, 0, 0);
  s2.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    )
  );
  const atom = new THREE.Mesh(new THREE.SphereGeometry(2, 32, 16), new THREE.MeshStandardMaterial());
  atom.position.set(0, 3, 0);
  s2.add(atom);
  scene.add(s2);

  // Things that must be skipped.
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 1, 1)]),
      new THREE.LineBasicMaterial()
    )
  );
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())); // overlay
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  hidden.visible = false;
  scene.add(hidden);
  const hiddenGroup = new THREE.Group();
  hiddenGroup.visible = false;
  hiddenGroup.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  scene.add(hiddenGroup);
  const picking = makeImpostors([[0, 0, 0]], [1], [1, 1, 1]);
  picking.visible = false;
  scene.add(picking);

  return scene;
}

describe('sphere detail', () => {
  it('counts sphere triangles like THREE.SphereGeometry', () => {
    for (const [w, h] of SPHERE_DETAIL_LEVELS) {
      expect(sphereTriangleCount(w, h)).toBe(
        geometryTriangleCount(new THREE.SphereGeometry(1, w, h))
      );
    }
  });

  it('keeps full detail under budget and reduces it for huge structures', () => {
    expect(chooseSphereDetail(1000, 0, 2_000_000)).toMatchObject({
      widthSegments: 16,
      reduced: false,
    });
    const big = chooseSphereDetail(20_000, 0, 2_000_000);
    expect(big.reduced).toBe(true);
    expect(big.overBudget).toBe(false);
    expect(20_000 * sphereTriangleCount(big.widthSegments, big.heightSegments)).toBeLessThanOrEqual(
      2_000_000
    );
    expect(chooseSphereDetail(10_000_000, 0, 2_000_000).overBudget).toBe(true);
  });
});

describe('mergeInstances', () => {
  it('expands instances with world transforms and per-instance colors', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const merged = mergeInstances([
      {
        geometry: geo,
        matrices: [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(10, 0, 0)],
        colors: [new THREE.Color(1, 0, 0), new THREE.Color(0, 0, 1)],
        useVertexColors: false,
      },
    ]);
    expect(geometryTriangleCount(merged)).toBe(2 * BOX_TRIS);
    const pos = merged.getAttribute('position');
    const color = merged.getAttribute('color');
    const n = geo.getAttribute('position').count;
    expect(pos.count).toBe(2 * n);
    expect(pos.getX(n)).toBeCloseTo(geo.getAttribute('position').getX(0) + 10);
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
    expect([color.getX(n), color.getY(n), color.getZ(n)]).toEqual([0, 0, 1]);
  });

  it('keeps winding correct for mirrored instances', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const plain = mergeInstances([
      { geometry: geo, matrices: [new THREE.Matrix4()], colors: [new THREE.Color()], useVertexColors: false },
    ]);
    const mirrored = mergeInstances([
      {
        geometry: geo,
        matrices: [new THREE.Matrix4().makeScale(-1, 1, 1)],
        colors: [new THREE.Color()],
        useVertexColors: false,
      },
    ]);
    const a = plain.index!;
    const b = mirrored.index!;
    expect([b.getX(0), b.getX(1), b.getX(2)]).toEqual([a.getX(0), a.getX(2), a.getX(1)]);
  });
});

describe('buildExportScene', () => {
  it('converts impostors and sphere meshes to spheres, expands instances, skips overlays', () => {
    const result = buildExportScene(makeScene(), { center: false });
    expect(result.sphereCount).toBe(3); // 2 impostors + 1 sphere mesh
    expect(result.sphereDetail.reduced).toBe(false);
    expect(result.triangles).toBe(3 * SPHERE_16_12 + 3 * BOX_TRIS + BOX_TRIS);
    expect(result.group.children).toHaveLength(1);

    const mesh = result.group.children[0] as THREE.Mesh;
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    // Side-by-side offset is baked: the second structure sits around x = 100.
    expect(box.max.x).toBeCloseTo(102, 0);
    // Impostor radius 1 at the origin reaches x = -1.
    expect(box.min.x).toBeCloseTo(-1, 1);
    // Red impostor color survives.
    const color = mesh.geometry.getAttribute('color');
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
  });

  it('centers the model at the origin by default', () => {
    const { group, size } = buildExportScene(makeScene());
    const mesh = group.children[0] as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const center = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
    expect(center.length()).toBeLessThan(1e-3);
    expect(size.x).toBeCloseTo(103, 0);
  });

  it('reduces sphere tessellation under a tight triangle budget', () => {
    const result = buildExportScene(makeScene(), { maxTriangles: 200 });
    expect(result.sphereDetail.reduced).toBe(true);
    expect(result.triangles).toBeLessThan(3 * SPHERE_16_12);
  });

  it('keeps translucent meshes in their own material', () => {
    const scene = makeScene();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.5 })
      )
    );
    const { group } = buildExportScene(scene);
    expect(group.children).toHaveLength(2);
    const translucent = group.children.find(
      (c) => ((c as THREE.Mesh).material as THREE.Material).transparent
    ) as THREE.Mesh;
    expect((translucent.material as THREE.Material).opacity).toBe(0.5);
    expect(geometryTriangleCount(translucent.geometry)).toBe(BOX_TRIS);
  });
});

describe('exportModel', () => {
  it('writes a binary STL whose header count matches the triangles', async () => {
    const result = await exportModel(makeScene(), 'stl', { mmPerAngstrom: 2 });
    const buf = await readBlob(result.blob);
    const view = new DataView(buf);
    const count = view.getUint32(80, true);
    expect(count).toBe(result.triangles);
    expect(buf.byteLength).toBe(84 + 50 * count);
    expect(result.unit).toBe('mm');
    expect(result.size[0]).toBeCloseTo(206, 0);
  });

  it('writes a GLB with vertex colors', async () => {
    const result = await exportModel(makeScene(), 'glb');
    const buf = await readBlob(result.blob);
    const view = new DataView(buf);
    expect(new TextDecoder().decode(new Uint8Array(buf, 0, 4))).toBe('glTF');
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLength)));
    expect(json.meshes).toHaveLength(1);
    const primitive = json.meshes[0].primitives[0];
    expect(primitive.attributes).toHaveProperty('POSITION');
    expect(primitive.attributes).toHaveProperty('NORMAL');
    expect(primitive.attributes).toHaveProperty('COLOR_0');
    expect(json.accessors[primitive.indices].count / 3).toBe(result.triangles);
  });

  it('refuses to export an empty scene', async () => {
    await expect(exportModel(new THREE.Scene(), 'glb')).rejects.toThrow(/Nothing to export/);
  });
});
