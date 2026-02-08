import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useThree, useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import type { Atom } from '../../types';
import { useMoleculeStore } from '../../store/moleculeStore';
import { MoleculeOctree, LOD_THRESHOLDS, type ClusterData } from '../../utils/octree';

/**
 * LOD-aware atom renderer using octree-based spatial clustering.
 *
 * For massive molecules (10M+ atoms), this component:
 * 1. Builds an octree from atom positions
 * 2. Each frame, determines which atoms render individually vs as clusters
 * 3. Clusters distant atoms into single representative spheres
 * 4. Uses frustum culling to skip off-screen atoms entirely
 *
 * Performance at far zoom: 10M atoms → ~1K clusters (99.99% reduction)
 */

/**
 * Shared sphere impostor material for both atoms and clusters.
 */
const LODImpostorMaterial = shaderMaterial(
  {
    selectedColor: new THREE.Color(0x44aaff),
    hoverColor: new THREE.Color(0xffffff),
    projectionMatrix: new THREE.Matrix4(),
  },
  /* glsl */ `
    attribute vec3 instanceColor;
    attribute float instanceRadius;
    attribute float instanceSelected;
    attribute float instanceHovered;

    varying vec3 vColor;
    varying vec3 vSphereCenter;
    varying float vRadius;
    varying float vSelected;
    varying float vHovered;
    varying vec2 vUv;

    void main() {
      vColor = instanceColor;
      vRadius = instanceRadius;
      vSelected = instanceSelected;
      vHovered = instanceHovered;
      vUv = uv;

      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vSphereCenter = mvPosition.xyz;
      mvPosition.xy += position.xy * instanceRadius * 2.0;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  /* glsl */ `
    uniform vec3 selectedColor;
    uniform vec3 hoverColor;
    uniform mat4 projectionMatrix;

    varying vec3 vColor;
    varying vec3 vSphereCenter;
    varying float vRadius;
    varying float vSelected;
    varying float vHovered;
    varying vec2 vUv;

    void main() {
      vec2 coord = (vUv - 0.5) * 4.0;
      float distSq = dot(coord, coord);
      if (distSq > 1.0) discard;

      float z = sqrt(1.0 - distSq);
      vec3 normal = vec3(coord, z);
      vec3 hitPoint = vSphereCenter + normal * vRadius;

      vec3 keyDir = normalize(vec3(5.0, 5.0, 5.0));
      vec3 fillDir = normalize(vec3(-5.0, 2.0, 3.0));
      vec3 rimDir = normalize(vec3(0.0, -5.0, -5.0));

      float keyDiff = max(dot(normal, keyDir), 0.0) * 0.8;
      float fillDiff = max(dot(normal, fillDir), 0.0) * 0.4;
      float rimDiff = max(dot(normal, rimDir), 0.0) * 0.3;
      float ambient = 0.4;
      float lighting = ambient + keyDiff + fillDiff + rimDiff;

      vec3 emissive = vec3(0.0);
      if (vSelected > 0.5) {
        emissive = selectedColor * 0.5;
      } else if (vHovered > 0.5) {
        emissive = hoverColor * 0.2;
      }

      vec3 color = vColor * lighting + emissive;

      vec4 clipPos = projectionMatrix * vec4(hitPoint, 1.0);
      float ndcDepth = clipPos.z / clipPos.w;
      gl_FragDepth = ndcDepth * 0.5 + 0.5;

      gl_FragColor = vec4(color, 1.0);
    }
  `
);

extend({ LODImpostorMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    lODImpostorMaterial: React.JSX.IntrinsicElements['shaderMaterial'] & {
      selectedColor?: THREE.Color;
      hoverColor?: THREE.Color;
      projectionMatrix?: THREE.Matrix4;
    };
  }
}

export interface AtomRenderData {
  atom: Atom;
  index: number;
  position: THREE.Vector3;
  color: THREE.Color;
  radius: number;
}

export interface LODAtomsProps {
  /** All atoms to render */
  atomsData: AtomRenderData[];
  /** Selected atom indices */
  selectedIndices: number[];
  /** Structure ID for multi-structure support */
  structureId?: string;
  /** LOD threshold in pixels (default: 10) */
  lodThreshold?: number;
  /** Enable frustum culling (default: true) */
  enableFrustumCulling?: boolean;
  /** Quality preset */
  quality?: keyof typeof LOD_THRESHOLDS;
}

/** Maximum instances per mesh (WebGL limit consideration) */
const MAX_INSTANCES = 1000000;

/** Threshold for building octree */
const OCTREE_THRESHOLD = 10000;

/**
 * LOD-aware atom renderer for massive molecules.
 *
 * Uses octree spatial partitioning to:
 * - Cluster distant atoms into representative spheres
 * - Cull atoms outside camera frustum
 * - Dynamically adjust detail based on zoom level
 */
export function LODAtoms({
  atomsData,
  selectedIndices,
  structureId,
  lodThreshold,
  enableFrustumCulling = true,
  quality = 'medium',
}: LODAtomsProps) {
  const atomMeshRef = useRef<THREE.InstancedMesh>(null);
  const clusterMeshRef = useRef<THREE.InstancedMesh>(null);
  const atomMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const clusterMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const octreeRef = useRef<MoleculeOctree | null>(null);

  const { gl, camera } = useThree();
  const { setHoveredAtom, selectAtom, measurementMode, hoveredAtomIndex, activeStructureId } =
    useMoleculeStore(useShallow(state => ({
      setHoveredAtom: state.setHoveredAtom,
      selectAtom: state.selectAtom,
      measurementMode: state.measurementMode,
      hoveredAtomIndex: state.hoveredAtomIndex,
      activeStructureId: state.activeStructureId,
    })));

  const effectiveStructureId = structureId || activeStructureId || '';
  const effectiveThreshold = lodThreshold ?? LOD_THRESHOLDS[quality];
  const isWebGL2 = gl.capabilities.isWebGL2;

  // Determine if octree is needed
  const useOctree = atomsData.length >= OCTREE_THRESHOLD;

  // Billboard geometry
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Build octree when atoms change
  useEffect(() => {
    if (!useOctree) {
      octreeRef.current = null;
      return;
    }

    const octree = new MoleculeOctree({
      maxAtomsPerLeaf: 64,
      maxDepth: 12,
      minNodeSize: 0.5,
    });

    const positions = atomsData.map((d) => d.position);
    const colors = atomsData.map((d) => d.color);
    const radii = atomsData.map((d) => d.radius);
    const atoms = atomsData.map((d) => d.atom);

    octree.build(atoms, positions, colors, radii);
    octreeRef.current = octree;

    const stats = octree.getStats();
    console.log(`[LODAtoms] Octree built: ${stats.totalNodes} nodes, ${stats.leafNodes} leaves, max depth ${stats.maxDepth}`);
  }, [atomsData, useOctree]);

  // Instance buffers for atoms
  const atomBuffers = useMemo(() => {
    const maxAtoms = Math.min(atomsData.length, MAX_INSTANCES);
    return {
      colorArray: new Float32Array(maxAtoms * 3),
      radiusArray: new Float32Array(maxAtoms),
      selectedArray: new Float32Array(maxAtoms),
      hoveredArray: new Float32Array(maxAtoms),
      dummy: new THREE.Object3D(),
    };
  }, [atomsData.length]);

  // Instance buffers for clusters
  const clusterBuffers = useMemo(() => {
    const maxClusters = Math.ceil(atomsData.length / 32); // Estimate
    return {
      colorArray: new Float32Array(maxClusters * 3),
      radiusArray: new Float32Array(maxClusters),
      selectedArray: new Float32Array(maxClusters),
      hoveredArray: new Float32Array(maxClusters),
      dummy: new THREE.Object3D(),
    };
  }, [atomsData.length]);

  // Visible data state
  const visibleDataRef = useRef<{
    atomIndices: number[];
    clusters: ClusterData[];
  }>({ atomIndices: [], clusters: [] });

  // Update visible data each frame
  useFrame(() => {
    if (!atomMeshRef.current) return;

    // Update material projection matrix
    if (atomMaterialRef.current) {
      atomMaterialRef.current.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
    }
    if (clusterMaterialRef.current) {
      clusterMaterialRef.current.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
    }

    // Without octree, render all atoms
    if (!useOctree || !octreeRef.current) {
      updateAtomMesh(
        atomMeshRef.current,
        atomsData.map((_, i) => i),
        atomsData,
        selectedIndices,
        hoveredAtomIndex,
        atomBuffers
      );
      visibleDataRef.current = { atomIndices: atomsData.map((_, i) => i), clusters: [] };
      return;
    }

    // Get visible data from octree
    const visibleData = octreeRef.current.getVisibleData(
      camera,
      effectiveThreshold,
      enableFrustumCulling
    );

    visibleDataRef.current = {
      atomIndices: visibleData.atoms,
      clusters: visibleData.clusters,
    };

    // Update atom mesh
    updateAtomMesh(
      atomMeshRef.current,
      visibleData.atoms,
      atomsData,
      selectedIndices,
      hoveredAtomIndex,
      atomBuffers
    );

    // Update cluster mesh
    if (clusterMeshRef.current && visibleData.clusters.length > 0) {
      updateClusterMesh(
        clusterMeshRef.current,
        visibleData.clusters,
        clusterBuffers
      );
    }
  });

  // Set up instance attributes
  useEffect(() => {
    if (!atomMeshRef.current) return;

    const geo = atomMeshRef.current.geometry;
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(atomBuffers.colorArray, 3));
    geo.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(atomBuffers.radiusArray, 1));
    geo.setAttribute('instanceSelected', new THREE.InstancedBufferAttribute(atomBuffers.selectedArray, 1));
    geo.setAttribute('instanceHovered', new THREE.InstancedBufferAttribute(atomBuffers.hoveredArray, 1));
  }, [atomBuffers]);

  useEffect(() => {
    if (!clusterMeshRef.current) return;

    const geo = clusterMeshRef.current.geometry;
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(clusterBuffers.colorArray, 3));
    geo.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(clusterBuffers.radiusArray, 1));
    geo.setAttribute('instanceSelected', new THREE.InstancedBufferAttribute(clusterBuffers.selectedArray, 1));
    geo.setAttribute('instanceHovered', new THREE.InstancedBufferAttribute(clusterBuffers.hoveredArray, 1));
  }, [clusterBuffers]);

  // Picking handler (uses visible atoms only)
  const handlePointerMove = useCallback(
    (event: THREE.Event) => {
      const clientX = (event as unknown as PointerEvent).clientX;
      const clientY = (event as unknown as PointerEvent).clientY;
      if (clientX === undefined || clientY === undefined) return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Only check visible atoms
      const { atomIndices } = visibleDataRef.current;
      let closestDist = Infinity;
      let closestIdx = -1;

      for (const idx of atomIndices) {
        const data = atomsData[idx];
        if (!data) continue;

        const oc = raycaster.ray.origin.clone().sub(data.position);
        const a = raycaster.ray.direction.dot(raycaster.ray.direction);
        const b = 2.0 * oc.dot(raycaster.ray.direction);
        const c = oc.dot(oc) - data.radius * data.radius;
        const discriminant = b * b - 4 * a * c;

        if (discriminant >= 0) {
          const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
          if (t > 0 && t < closestDist) {
            closestDist = t;
            closestIdx = idx;
          }
        }
      }

      if (closestIdx >= 0) {
        const data = atomsData[closestIdx];
        gl.domElement.style.cursor = measurementMode !== 'none' ? 'crosshair' : 'pointer';
        setHoveredAtom(data.atom, data.index, effectiveStructureId, { x: clientX, y: clientY });
      } else {
        gl.domElement.style.cursor = 'auto';
        setHoveredAtom(null, null, null, null);
      }
    },
    [atomsData, camera, gl.domElement, measurementMode, setHoveredAtom, effectiveStructureId]
  );

  const handlePointerOut = useCallback(() => {
    gl.domElement.style.cursor = 'auto';
    setHoveredAtom(null, null, null, null);
  }, [gl.domElement, setHoveredAtom]);

  const handleClick = useCallback(
    (event: THREE.Event) => {
      const clientX = (event as unknown as MouseEvent).clientX;
      const clientY = (event as unknown as MouseEvent).clientY;
      if (clientX === undefined || clientY === undefined) return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      const { atomIndices } = visibleDataRef.current;
      let closestDist = Infinity;
      let closestIdx = -1;

      for (const idx of atomIndices) {
        const data = atomsData[idx];
        if (!data) continue;

        const oc = raycaster.ray.origin.clone().sub(data.position);
        const a = raycaster.ray.direction.dot(raycaster.ray.direction);
        const b = 2.0 * oc.dot(raycaster.ray.direction);
        const c = oc.dot(oc) - data.radius * data.radius;
        const discriminant = b * b - 4 * a * c;

        if (discriminant >= 0) {
          const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
          if (t > 0 && t < closestDist) {
            closestDist = t;
            closestIdx = idx;
          }
        }
      }

      if (closestIdx >= 0) {
        selectAtom(effectiveStructureId, atomsData[closestIdx].index);
      }
    },
    [atomsData, camera, gl.domElement, selectAtom, effectiveStructureId]
  );

  if (!isWebGL2) {
    console.warn('LODAtoms requires WebGL2');
    return null;
  }

  const maxAtoms = Math.min(atomsData.length, MAX_INSTANCES);
  const maxClusters = Math.ceil(atomsData.length / 32);

  return (
    <>
      {/* Individual atoms mesh */}
      <instancedMesh
        ref={atomMeshRef}
        args={[geometry, undefined, maxAtoms]}
        frustumCulled={false}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <lODImpostorMaterial
          ref={atomMaterialRef}
          transparent={false}
          depthWrite={true}
          depthTest={true}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {/* Cluster spheres mesh */}
      {useOctree && (
        <instancedMesh
          ref={clusterMeshRef}
          args={[geometry.clone(), undefined, maxClusters]}
          frustumCulled={false}
        >
          <lODImpostorMaterial
            ref={clusterMaterialRef}
            transparent={false}
            depthWrite={true}
            depthTest={true}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      )}
    </>
  );
}

/**
 * Update atom instanced mesh with visible atoms.
 */
function updateAtomMesh(
  mesh: THREE.InstancedMesh,
  visibleIndices: number[],
  allAtoms: AtomRenderData[],
  selectedIndices: number[],
  hoveredAtomIndex: number | null,
  buffers: {
    colorArray: Float32Array;
    radiusArray: Float32Array;
    selectedArray: Float32Array;
    hoveredArray: Float32Array;
    dummy: THREE.Object3D;
  }
): void {
  const selectedSet = new Set(selectedIndices);
  const count = Math.min(visibleIndices.length, buffers.colorArray.length / 3);

  for (let i = 0; i < count; i++) {
    const idx = visibleIndices[i];
    const data = allAtoms[idx];
    if (!data) continue;

    buffers.dummy.position.copy(data.position);
    buffers.dummy.updateMatrix();
    mesh.setMatrixAt(i, buffers.dummy.matrix);

    buffers.colorArray[i * 3] = data.color.r;
    buffers.colorArray[i * 3 + 1] = data.color.g;
    buffers.colorArray[i * 3 + 2] = data.color.b;
    buffers.radiusArray[i] = data.radius;
    buffers.selectedArray[i] = selectedSet.has(data.index) ? 1.0 : 0.0;
    buffers.hoveredArray[i] = data.index === hoveredAtomIndex ? 1.0 : 0.0;
  }

  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;

  const colorAttr = mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
  const radiusAttr = mesh.geometry.getAttribute('instanceRadius') as THREE.InstancedBufferAttribute;
  const selectedAttr = mesh.geometry.getAttribute('instanceSelected') as THREE.InstancedBufferAttribute;
  const hoveredAttr = mesh.geometry.getAttribute('instanceHovered') as THREE.InstancedBufferAttribute;

  if (colorAttr) colorAttr.needsUpdate = true;
  if (radiusAttr) radiusAttr.needsUpdate = true;
  if (selectedAttr) selectedAttr.needsUpdate = true;
  if (hoveredAttr) hoveredAttr.needsUpdate = true;
}

/**
 * Update cluster instanced mesh.
 */
function updateClusterMesh(
  mesh: THREE.InstancedMesh,
  clusters: ClusterData[],
  buffers: {
    colorArray: Float32Array;
    radiusArray: Float32Array;
    selectedArray: Float32Array;
    hoveredArray: Float32Array;
    dummy: THREE.Object3D;
  }
): void {
  const count = Math.min(clusters.length, buffers.colorArray.length / 3);

  for (let i = 0; i < count; i++) {
    const cluster = clusters[i];

    buffers.dummy.position.copy(cluster.center);
    buffers.dummy.updateMatrix();
    mesh.setMatrixAt(i, buffers.dummy.matrix);

    buffers.colorArray[i * 3] = cluster.color.r;
    buffers.colorArray[i * 3 + 1] = cluster.color.g;
    buffers.colorArray[i * 3 + 2] = cluster.color.b;
    buffers.radiusArray[i] = cluster.boundingRadius;
    buffers.selectedArray[i] = 0;
    buffers.hoveredArray[i] = 0;
  }

  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;

  const colorAttr = mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
  const radiusAttr = mesh.geometry.getAttribute('instanceRadius') as THREE.InstancedBufferAttribute;
  const selectedAttr = mesh.geometry.getAttribute('instanceSelected') as THREE.InstancedBufferAttribute;
  const hoveredAttr = mesh.geometry.getAttribute('instanceHovered') as THREE.InstancedBufferAttribute;

  if (colorAttr) colorAttr.needsUpdate = true;
  if (radiusAttr) radiusAttr.needsUpdate = true;
  if (selectedAttr) selectedAttr.needsUpdate = true;
  if (hoveredAttr) hoveredAttr.needsUpdate = true;
}
