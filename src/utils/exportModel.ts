import * as THREE from 'three';
import { GLTFExporter, STLExporter } from 'three-stdlib';

/**
 * 3D model export (GLB / STL).
 *
 * The live scene is not exportable as is: atoms may be drawn as ray-traced
 * impostor quads (flat billboards in the geometry), bonds are InstancedMeshes,
 * and the scene also holds measurement overlays, lines and HTML labels. So we
 * build a separate export-only scene:
 *  - impostor atom meshes (userData.exportAs === 'spheres', or any InstancedMesh
 *    carrying an `instanceRadius` attribute) become real tessellated spheres;
 *  - plain sphere meshes (small-molecule atoms) are re-tessellated the same way
 *    so the triangle budget applies to them too;
 *  - InstancedMeshes are expanded into plain triangles with per-vertex colors;
 *  - regular meshes are copied with their world transform baked in;
 *  - lines, points, sprites, unlit overlays (MeshBasicMaterial), unknown shader
 *    materials and invisible objects are skipped.
 * Everything with the same opacity is merged into one mesh with vertex colors.
 * Coordinates stay in scene units (1 unit = 1 Angstrom); the model is centered
 * at the origin.
 */

export type ModelFormat = 'glb' | 'stl';

/** Sphere tessellation ladder (widthSegments, heightSegments), best first. */
export const SPHERE_DETAIL_LEVELS: ReadonlyArray<readonly [number, number]> = [
  [16, 12],
  [12, 9],
  [10, 7],
  [8, 6],
  [6, 4],
];

/** Default cap on the number of exported triangles. */
export const DEFAULT_MAX_TRIANGLES = 2_000_000;

/** Default STL scale: 2 mm per Angstrom puts a typical 30 to 50 A protein at 6 to 10 cm. */
export const DEFAULT_STL_MM_PER_ANGSTROM = 2;

export const MODEL_MIME_TYPES: Record<ModelFormat, string> = {
  glb: 'model/gltf-binary',
  stl: 'model/stl',
};

/** Triangles in a THREE.SphereGeometry(r, w, h) (pole rows are single triangles). */
export function sphereTriangleCount(widthSegments: number, heightSegments: number): number {
  return 2 * widthSegments * (heightSegments - 1);
}

export function geometryTriangleCount(geometry: THREE.BufferGeometry): number {
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  const position = geometry.getAttribute('position');
  return position ? Math.floor(position.count / 3) : 0;
}

export interface SphereDetailChoice {
  widthSegments: number;
  heightSegments: number;
  /** True when a coarser tessellation than the default was picked. */
  reduced: boolean;
  /** True when even the coarsest tessellation exceeds the budget. */
  overBudget: boolean;
}

/** Pick the finest sphere tessellation that keeps the total under `maxTriangles`. */
export function chooseSphereDetail(
  sphereCount: number,
  otherTriangles: number,
  maxTriangles: number = DEFAULT_MAX_TRIANGLES
): SphereDetailChoice {
  for (let i = 0; i < SPHERE_DETAIL_LEVELS.length; i++) {
    const [w, h] = SPHERE_DETAIL_LEVELS[i];
    if (otherTriangles + sphereCount * sphereTriangleCount(w, h) <= maxTriangles) {
      return { widthSegments: w, heightSegments: h, reduced: i > 0, overBudget: false };
    }
  }
  const [w, h] = SPHERE_DETAIL_LEVELS[SPHERE_DETAIL_LEVELS.length - 1];
  return { widthSegments: w, heightSegments: h, reduced: true, overBudget: true };
}

// ---------------------------------------------------------------------------
// Scene collection
// ---------------------------------------------------------------------------

interface SphereItem {
  x: number;
  y: number;
  z: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  opacity: number;
}

interface MeshItem {
  geometry: THREE.BufferGeometry;
  /** One world matrix + color per copy (a plain mesh has exactly one). */
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
  useVertexColors: boolean;
  opacity: number;
}

interface Collected {
  spheres: SphereItem[];
  meshes: MeshItem[];
}

type AnyMaterial = THREE.Material & { color?: THREE.Color; vertexColors?: boolean };

function firstMaterial(object: THREE.Mesh): AnyMaterial | null {
  const m = Array.isArray(object.material) ? object.material[0] : object.material;
  return (m as AnyMaterial) ?? null;
}

function materialOpacity(material: AnyMaterial | null): number {
  if (!material || !material.transparent) return 1;
  return Math.max(0, Math.min(1, material.opacity));
}

function isImpostorMesh(mesh: THREE.Mesh): mesh is THREE.InstancedMesh {
  if (!(mesh as THREE.InstancedMesh).isInstancedMesh) return false;
  return mesh.userData?.exportAs === 'spheres' || !!mesh.geometry.getAttribute('instanceRadius');
}

function isFullSphere(geometry: THREE.BufferGeometry): geometry is THREE.SphereGeometry {
  if (geometry.type !== 'SphereGeometry') return false;
  const p = (geometry as THREE.SphereGeometry).parameters;
  return (
    !!p &&
    Math.abs(p.phiLength - Math.PI * 2) < 1e-6 &&
    Math.abs(p.thetaLength - Math.PI) < 1e-6 &&
    p.phiStart === 0 &&
    p.thetaStart === 0
  );
}

/** Whether an object (and its subtree) should be ignored by the exporter. */
function shouldSkip(object: THREE.Object3D): boolean {
  if (!object.visible) return true;
  if (object.userData?.exportSkip) return true;
  const o = object as THREE.Object3D & Record<string, unknown>;
  if (o.isLine || o.isPoints || o.isSprite || o.isLine2 || o.isLineSegments2) return true;
  return false;
}

function collectMesh(mesh: THREE.Mesh, out: Collected): void {
  const material = firstMaterial(mesh);
  const geometry = mesh.geometry;
  if (!geometry || !geometry.getAttribute('position')) return;

  const opacity = materialOpacity(material);
  if (opacity <= 0.01) return;

  const baseColor =
    material?.color instanceof THREE.Color ? material.color.clone() : new THREE.Color(1, 1, 1);

  // (a) Impostor atoms: substitute real spheres.
  if (isImpostorMesh(mesh)) {
    const radii = geometry.getAttribute('instanceRadius');
    const colors = geometry.getAttribute('instanceColor') ?? mesh.instanceColor;
    if (!radii) return;
    const instanceMatrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const count = Math.min(mesh.count, radii.count);
    for (let i = 0; i < count; i++) {
      mesh.getMatrixAt(i, instanceMatrix);
      pos.set(0, 0, 0).applyMatrix4(instanceMatrix).applyMatrix4(mesh.matrixWorld);
      const radius = radii.getX(i) * mesh.matrixWorld.getMaxScaleOnAxis();
      if (!(radius > 0)) continue;
      out.spheres.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        radius,
        r: colors ? colors.getX(i) : baseColor.r,
        g: colors ? colors.getY(i) : baseColor.g,
        b: colors ? colors.getZ(i) : baseColor.b,
        opacity,
      });
    }
    return;
  }

  // Custom shaders we do not know how to convert would come out as flat quads.
  if ((material as THREE.ShaderMaterial | null)?.isShaderMaterial) return;
  // Unlit overlays (measurement rings, hover markers, angle sectors).
  if ((material as THREE.MeshBasicMaterial | null)?.isMeshBasicMaterial) return;
  // Instanced geometry on a non-instanced mesh (fat lines) is not real triangles.
  if ((geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;

  const useVertexColors = !!material?.vertexColors && !!geometry.getAttribute('color');

  // (b) InstancedMesh: expand every instance.
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const inst = mesh as THREE.InstancedMesh;
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const tmp = new THREE.Color();
    for (let i = 0; i < inst.count; i++) {
      const m = new THREE.Matrix4();
      inst.getMatrixAt(i, m);
      m.premultiply(inst.matrixWorld);
      matrices.push(m);
      const c = baseColor.clone();
      if (inst.instanceColor) {
        inst.getColorAt(i, tmp);
        c.multiply(tmp);
      }
      colors.push(c);
    }
    if (matrices.length > 0) {
      out.meshes.push({ geometry, matrices, colors, useVertexColors, opacity });
    }
    return;
  }

  // Plain sphere meshes (small-molecule atoms): re-tessellate under the budget.
  if (isFullSphere(geometry) && !useVertexColors) {
    const center = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    const radius = geometry.parameters.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    if (radius > 0) {
      out.spheres.push({
        x: center.x,
        y: center.y,
        z: center.z,
        radius,
        r: baseColor.r,
        g: baseColor.g,
        b: baseColor.b,
        opacity,
      });
    }
    return;
  }

  // (c) Regular mesh with world transform baked in.
  out.meshes.push({
    geometry,
    matrices: [mesh.matrixWorld.clone()],
    colors: [baseColor],
    useVertexColors,
    opacity,
  });
}

function collect(object: THREE.Object3D, out: Collected): void {
  if (shouldSkip(object)) return;
  if ((object as THREE.Mesh).isMesh) {
    collectMesh(object as THREE.Mesh, out);
  }
  for (const child of object.children) collect(child, out);
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

interface MergeSource {
  geometry: THREE.BufferGeometry;
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
  useVertexColors: boolean;
}

function ensureNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.getAttribute('normal')) return geometry;
  const g = geometry.clone();
  g.computeVertexNormals();
  return g;
}

/** Merge (geometry x instances) into one indexed BufferGeometry with position/normal/color. */
export function mergeInstances(sources: MergeSource[]): THREE.BufferGeometry {
  let vertexTotal = 0;
  let indexTotal = 0;
  const prepared = sources.map((s) => {
    const geometry = ensureNormals(s.geometry);
    const position = geometry.getAttribute('position');
    const indexCount = geometry.index ? geometry.index.count : position.count;
    vertexTotal += position.count * s.matrices.length;
    indexTotal += indexCount * s.matrices.length;
    return { ...s, geometry };
  });

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const colors = new Float32Array(vertexTotal * 3);
  const indices = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let vOffset = 0;
  let iOffset = 0;

  for (const s of prepared) {
    const position = s.geometry.getAttribute('position');
    const normal = s.geometry.getAttribute('normal');
    const color = s.useVertexColors ? s.geometry.getAttribute('color') : null;
    const index = s.geometry.index;
    const indexCount = index ? index.count : position.count;
    const vCount = position.count;

    for (let k = 0; k < s.matrices.length; k++) {
      const m = s.matrices[k];
      const c = s.colors[k];
      normalMatrix.getNormalMatrix(m);
      const flip = m.determinant() < 0;

      for (let i = 0; i < vCount; i++) {
        const o = (vOffset + i) * 3;
        v.fromBufferAttribute(position, i).applyMatrix4(m);
        positions[o] = v.x;
        positions[o + 1] = v.y;
        positions[o + 2] = v.z;
        n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        normals[o] = n.x;
        normals[o + 1] = n.y;
        normals[o + 2] = n.z;
        if (color) {
          colors[o] = color.getX(i) * c.r;
          colors[o + 1] = color.getY(i) * c.g;
          colors[o + 2] = color.getZ(i) * c.b;
        } else {
          colors[o] = c.r;
          colors[o + 1] = c.g;
          colors[o + 2] = c.b;
        }
      }

      for (let t = 0; t + 2 < indexCount; t += 3) {
        const a = index ? index.getX(t) : t;
        const b = index ? index.getX(t + 1) : t + 1;
        const d = index ? index.getX(t + 2) : t + 2;
        indices[iOffset + t] = vOffset + a;
        indices[iOffset + t + 1] = vOffset + (flip ? d : b);
        indices[iOffset + t + 2] = vOffset + (flip ? b : d);
      }

      vOffset += vCount;
      iOffset += indexCount - (indexCount % 3);
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices.subarray(0, iOffset), 1));
  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildExportSceneOptions {
  maxTriangles?: number;
  /** Center the model at the origin (default true). */
  center?: boolean;
}

export interface ExportSceneResult {
  group: THREE.Group;
  triangles: number;
  sphereCount: number;
  sphereDetail: SphereDetailChoice;
  /** Size of the model in scene units (Angstrom). */
  size: THREE.Vector3;
}

/**
 * Build a standalone, export-friendly copy of everything visible under `root`.
 * The live scene is not modified.
 */
export function buildExportScene(
  root: THREE.Object3D,
  options: BuildExportSceneOptions = {}
): ExportSceneResult {
  const { maxTriangles = DEFAULT_MAX_TRIANGLES, center = true } = options;

  root.updateMatrixWorld(true);
  const collected: Collected = { spheres: [], meshes: [] };
  collect(root, collected);

  let otherTriangles = 0;
  for (const m of collected.meshes) {
    otherTriangles += geometryTriangleCount(m.geometry) * m.matrices.length;
  }
  const detail = chooseSphereDetail(collected.spheres.length, otherTriangles, maxTriangles);

  // Group sources by opacity so translucent surfaces keep their own material.
  const byOpacity = new Map<number, MergeSource[]>();
  const push = (opacity: number, source: MergeSource) => {
    const key = Math.round(opacity * 100) / 100;
    const list = byOpacity.get(key) ?? [];
    list.push(source);
    byOpacity.set(key, list);
  };

  const sphereGeometry = new THREE.SphereGeometry(1, detail.widthSegments, detail.heightSegments);
  const sphereByOpacity = new Map<number, MergeSource>();
  for (const s of collected.spheres) {
    const key = Math.round(s.opacity * 100) / 100;
    let source = sphereByOpacity.get(key);
    if (!source) {
      source = { geometry: sphereGeometry, matrices: [], colors: [], useVertexColors: false };
      sphereByOpacity.set(key, source);
      push(key, source);
    }
    source.matrices.push(
      new THREE.Matrix4().makeScale(s.radius, s.radius, s.radius).setPosition(s.x, s.y, s.z)
    );
    source.colors.push(new THREE.Color(s.r, s.g, s.b));
  }
  for (const m of collected.meshes) {
    push(m.opacity, m);
  }

  const group = new THREE.Group();
  group.name = 'molecule';
  let triangles = 0;
  const box = new THREE.Box3();

  const keys = [...byOpacity.keys()].sort((a, b) => b - a);
  for (const opacity of keys) {
    const geometry = mergeInstances(byOpacity.get(opacity)!);
    const tri = geometryTriangleCount(geometry);
    if (tri === 0) continue;
    triangles += tri;
    geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = opacity < 1 ? `molecule_translucent_${Math.round(opacity * 100)}` : 'molecule';
    group.add(mesh);
  }
  sphereGeometry.dispose();

  const size = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getSize(size);
    if (center) {
      const c = box.getCenter(new THREE.Vector3());
      for (const child of group.children) {
        (child as THREE.Mesh).geometry.translate(-c.x, -c.y, -c.z);
      }
    }
  }
  group.updateMatrixWorld(true);

  return {
    group,
    triangles,
    sphereCount: collected.spheres.length,
    sphereDetail: detail,
    size,
  };
}

export function disposeExportScene(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
}

export interface ExportModelOptions {
  /** STL only: millimetres per Angstrom. */
  mmPerAngstrom?: number;
  maxTriangles?: number;
}

export interface ExportModelResult {
  blob: Blob;
  triangles: number;
  sphereCount: number;
  sphereDetail: SphereDetailChoice;
  /** Model size in output units: Angstrom for GLB, millimetres for STL. */
  size: [number, number, number];
  unit: 'A' | 'mm';
}

/** Build the export scene from `root` and serialize it as GLB or binary STL. */
export async function exportModel(
  root: THREE.Object3D,
  format: ModelFormat,
  options: ExportModelOptions = {}
): Promise<ExportModelResult> {
  const { mmPerAngstrom = DEFAULT_STL_MM_PER_ANGSTROM, maxTriangles } = options;
  const built = buildExportScene(root, { maxTriangles, center: true });
  if (built.triangles === 0) {
    disposeExportScene(built.group);
    throw new Error('Nothing to export: no visible geometry in the scene.');
  }

  try {
    if (format === 'stl') {
      for (const child of built.group.children) {
        (child as THREE.Mesh).geometry.scale(mmPerAngstrom, mmPerAngstrom, mmPerAngstrom);
      }
      built.group.updateMatrixWorld(true);
      const view = new STLExporter().parse(built.group, { binary: true });
      const bytes = new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength);
      return {
        blob: new Blob([bytes], { type: MODEL_MIME_TYPES.stl }),
        triangles: built.triangles,
        sphereCount: built.sphereCount,
        sphereDetail: built.sphereDetail,
        size: [
          built.size.x * mmPerAngstrom,
          built.size.y * mmPerAngstrom,
          built.size.z * mmPerAngstrom,
        ],
        unit: 'mm',
      };
    }

    const result = await new GLTFExporter().parseAsync(built.group, { binary: true });
    if (!(result instanceof ArrayBuffer)) {
      throw new Error('GLB export did not produce binary output.');
    }
    return {
      blob: new Blob([result], { type: MODEL_MIME_TYPES.glb }),
      triangles: built.triangles,
      sphereCount: built.sphereCount,
      sphereDetail: built.sphereDetail,
      size: [built.size.x, built.size.y, built.size.z],
      unit: 'A',
    };
  } finally {
    disposeExportScene(built.group);
  }
}
