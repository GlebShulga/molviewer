import { useRef, useMemo, useEffect } from 'react';
import { useThree, useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import type { Atom, Molecule } from '../../types';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectHoveredAtomIndex } from '../../store/selectors';
import { detectSymmetryFromAssembly, type DetectedSymmetry } from '../../utils/symmetryDetection';

/**
 * Instanced assembly renderer for symmetric molecular structures.
 *
 * Uses GPU instancing to render biological assemblies (virus capsids, etc.)
 * with massive memory and performance savings.
 *
 * Example: HIV capsid
 * - Without instancing: 68M atoms, 68M sphere impostors
 * - With instancing: 1M atoms × 60 transforms = 60 draw calls
 * - Memory: ~60x reduction
 *
 * This component renders each transformation as a separate instanced mesh,
 * allowing the GPU to efficiently duplicate the asymmetric unit.
 */

/**
 * Instanced impostor material with per-instance transform support.
 */
const InstancedImpostorMaterial = shaderMaterial(
  {
    selectedColor: new THREE.Color(0x44aaff),
    hoverColor: new THREE.Color(0xffffff),
    projectionMatrix: new THREE.Matrix4(),
    assemblyTransform: new THREE.Matrix4(),
  },
  /* glsl */ `
    uniform mat4 assemblyTransform;

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

      // Apply assembly transform first, then model-view
      vec4 worldPos = assemblyTransform * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec4 mvPosition = modelViewMatrix * worldPos;
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

extend({ InstancedImpostorMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    instancedImpostorMaterial: React.JSX.IntrinsicElements['shaderMaterial'] & {
      selectedColor?: THREE.Color;
      hoverColor?: THREE.Color;
      projectionMatrix?: THREE.Matrix4;
      assemblyTransform?: THREE.Matrix4;
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

export interface InstancedAssemblyProps {
  /** Molecule with assembly information */
  molecule: Molecule;
  /** Atom render data for asymmetric unit */
  atomsData: AtomRenderData[];
  /** Selected atom indices (global indices) */
  selectedIndices: number[];
  /** Structure ID for multi-structure support */
  structureId?: string;
  /** Which assembly to render (default: first) */
  assemblyId?: string;
}

/**
 * Renders a molecular assembly using GPU instancing.
 *
 * Renders the asymmetric unit multiple times with different
 * transformation matrices, achieving massive memory savings.
 */
export function InstancedAssembly({
  molecule,
  atomsData,
  selectedIndices,
  structureId: _structureId,
  assemblyId,
}: InstancedAssemblyProps) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const materialRefs = useRef<(THREE.ShaderMaterial | null)[]>([]);

  const { gl, camera } = useThree();
  const hoveredAtomIndex = useMoleculeStore(selectHoveredAtomIndex);
  const isWebGL2 = gl.capabilities.isWebGL2;

  // Detect symmetry
  const symmetry = useMemo(
    () => detectSymmetryFromAssembly(molecule, assemblyId),
    [molecule, assemblyId]
  );

  // Billboard geometry
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Instance buffers for asymmetric unit
  const buffers = useMemo(() => {
    const count = atomsData.length;
    return {
      colorArray: new Float32Array(count * 3),
      radiusArray: new Float32Array(count),
      selectedArray: new Float32Array(count),
      hoveredArray: new Float32Array(count),
      dummy: new THREE.Object3D(),
    };
  }, [atomsData.length]);

  // Update instance data
  useEffect(() => {
    const selectedSet = new Set(selectedIndices);

    atomsData.forEach((data, i) => {
      buffers.colorArray[i * 3] = data.color.r;
      buffers.colorArray[i * 3 + 1] = data.color.g;
      buffers.colorArray[i * 3 + 2] = data.color.b;
      buffers.radiusArray[i] = data.radius;
      buffers.selectedArray[i] = selectedSet.has(data.index) ? 1.0 : 0.0;
      buffers.hoveredArray[i] = data.index === hoveredAtomIndex ? 1.0 : 0.0;
    });

    // Update all meshes
    meshRefs.current.forEach((mesh) => {
      if (!mesh) return;

      atomsData.forEach((data, i) => {
        buffers.dummy.position.copy(data.position);
        buffers.dummy.updateMatrix();
        mesh.setMatrixAt(i, buffers.dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;

      const colorAttr = mesh.geometry.getAttribute(
        'instanceColor'
      ) as THREE.InstancedBufferAttribute;
      const radiusAttr = mesh.geometry.getAttribute(
        'instanceRadius'
      ) as THREE.InstancedBufferAttribute;
      const selectedAttr = mesh.geometry.getAttribute(
        'instanceSelected'
      ) as THREE.InstancedBufferAttribute;
      const hoveredAttr = mesh.geometry.getAttribute(
        'instanceHovered'
      ) as THREE.InstancedBufferAttribute;

      if (colorAttr) colorAttr.needsUpdate = true;
      if (radiusAttr) radiusAttr.needsUpdate = true;
      if (selectedAttr) selectedAttr.needsUpdate = true;
      if (hoveredAttr) hoveredAttr.needsUpdate = true;
    });
  }, [atomsData, selectedIndices, hoveredAtomIndex, buffers]);

  // Set up instance attributes on all meshes
  useEffect(() => {
    meshRefs.current.forEach((mesh) => {
      if (!mesh) return;

      const geo = mesh.geometry;
      if (!geo.getAttribute('instanceColor')) {
        geo.setAttribute(
          'instanceColor',
          new THREE.InstancedBufferAttribute(buffers.colorArray, 3)
        );
        geo.setAttribute(
          'instanceRadius',
          new THREE.InstancedBufferAttribute(buffers.radiusArray, 1)
        );
        geo.setAttribute(
          'instanceSelected',
          new THREE.InstancedBufferAttribute(buffers.selectedArray, 1)
        );
        geo.setAttribute(
          'instanceHovered',
          new THREE.InstancedBufferAttribute(buffers.hoveredArray, 1)
        );
      }
    });
  }, [buffers, symmetry]);

  // Update projection matrix each frame
  useFrame(() => {
    materialRefs.current.forEach((material) => {
      if (material) {
        material.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
      }
    });
  });

  if (!isWebGL2) {
    console.warn('InstancedAssembly requires WebGL2');
    return null;
  }

  if (!symmetry || symmetry.copyCount <= 1) {
    // No useful symmetry - render nothing (caller should use regular renderer)
    return null;
  }

  // Log symmetry info
  useEffect(() => {
    console.log(
      `[InstancedAssembly] Rendering ${symmetry.type} assembly: ` +
        `${atomsData.length} atoms × ${symmetry.copyCount} copies = ` +
        `${atomsData.length * symmetry.copyCount} effective atoms`
    );
  }, [symmetry, atomsData.length]);

  return (
    <group>
      {symmetry.transforms.map((transform, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          args={[geometry.clone(), undefined, atomsData.length]}
          frustumCulled={false}
        >
          <instancedImpostorMaterial
            ref={(el) => {
              materialRefs.current[i] = el;
            }}
            assemblyTransform={transform}
            transparent={false}
            depthWrite={true}
            depthTest={true}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      ))}
    </group>
  );
}

/**
 * Hook to check if a molecule should use instanced rendering.
 */
export function useInstancedRendering(molecule: Molecule | null): {
  shouldUseInstancing: boolean;
  symmetry: DetectedSymmetry | null;
  estimatedAtomCount: number;
} {
  return useMemo(() => {
    if (!molecule) {
      return { shouldUseInstancing: false, symmetry: null, estimatedAtomCount: 0 };
    }

    const symmetry = detectSymmetryFromAssembly(molecule);
    const shouldUseInstancing = symmetry !== null && symmetry.copyCount > 1;
    const estimatedAtomCount = symmetry
      ? symmetry.asymmetricUnitAtomIndices.length * symmetry.copyCount
      : molecule.atoms.length;

    return { shouldUseInstancing, symmetry, estimatedAtomCount };
  }, [molecule]);
}
