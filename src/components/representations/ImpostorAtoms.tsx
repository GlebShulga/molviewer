import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useThree, useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import type { Atom } from '../../types';
import { useMoleculeStore } from '../../store/moleculeStore';
import {
  GPUPickingManager,
  pickingVertexShader,
  pickingFragmentShader,
} from '../../utils/gpuPicking';

/**
 * Sphere impostor material using ray-traced spheres on billboards.
 * Renders perfect spheres with only 2 triangles per atom instead of ~1024.
 * Requires WebGL2 for gl_FragDepth support.
 */
const SphereImpostorMaterial = shaderMaterial(
  {
    selectedColor: new THREE.Color(0x44aaff),
    hoverColor: new THREE.Color(0xffffff),
    projectionMatrix: new THREE.Matrix4(),
  },
  // Vertex shader - creates camera-facing billboard
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

      // Transform sphere center to view space
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vSphereCenter = mvPosition.xyz;

      // Expand billboard in view space (1.5x to ensure sphere fits)
      mvPosition.xy += position.xy * instanceRadius * 2.0;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  // Fragment shader - ray-traces sphere intersection
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
      // Map UV to normalized device coords on billboard (-1 to 1)
      vec2 coord = (vUv - 0.5) * 4.0;

      // Early discard for corners outside sphere projection
      float distSq = dot(coord, coord);
      if (distSq > 1.0) discard;

      // Calculate surface normal using sphere equation
      float z = sqrt(1.0 - distSq);
      vec3 normal = vec3(coord, z);

      // Hit point in view space
      vec3 hitPoint = vSphereCenter + normal * vRadius;

      // Lighting (3-point setup matching MoleculeViewer)
      vec3 keyDir = normalize(vec3(5.0, 5.0, 5.0));
      vec3 fillDir = normalize(vec3(-5.0, 2.0, 3.0));
      vec3 rimDir = normalize(vec3(0.0, -5.0, -5.0));

      float keyDiff = max(dot(normal, keyDir), 0.0) * 0.8;
      float fillDiff = max(dot(normal, fillDir), 0.0) * 0.4;
      float rimDiff = max(dot(normal, rimDir), 0.0) * 0.3;
      float ambient = 0.4;

      float lighting = ambient + keyDiff + fillDiff + rimDiff;

      // Selection/hover emissive effect
      vec3 emissive = vec3(0.0);
      if (vSelected > 0.5) {
        emissive = selectedColor * 0.5;
      } else if (vHovered > 0.5) {
        emissive = hoverColor * 0.2;
      }

      vec3 color = vColor * lighting + emissive;

      // Correct depth for proper intersections with other geometry
      vec4 clipPos = projectionMatrix * vec4(hitPoint, 1.0);
      float ndcDepth = clipPos.z / clipPos.w;
      gl_FragDepth = ndcDepth * 0.5 + 0.5;

      gl_FragColor = vec4(color, 1.0);
    }
  `
);

// Extend Three.js with our custom material
extend({ SphereImpostorMaterial });

// TypeScript declaration for JSX
declare module '@react-three/fiber' {
  interface ThreeElements {
    sphereImpostorMaterial: React.JSX.IntrinsicElements['shaderMaterial'] & {
      selectedColor?: THREE.Color;
      hoverColor?: THREE.Color;
      projectionMatrix?: THREE.Matrix4;
    };
  }
}

export interface AtomData {
  atom: Atom;
  index: number;
  position: THREE.Vector3;
  color: THREE.Color;
  radius: number;
}

export interface ImpostorAtomsProps {
  atomsData: AtomData[];
  selectedIndices: number[];
  /** Structure ID for multi-structure support */
  structureId?: string;
  /** Use GPU picking for large molecules (default: auto based on atom count) */
  useGPUPicking?: boolean;
}

/** Threshold for automatic GPU picking activation */
const GPU_PICKING_THRESHOLD = 1000;

/**
 * High-performance atom rendering using sphere impostors.
 * Renders thousands of atoms with a single draw call.
 *
 * Performance: 7000 atoms = 1 draw call, 14K triangles (vs 7000 draw calls, 7.1M triangles)
 *
 * For large molecules (>1000 atoms), uses GPU-based picking instead of
 * O(n) CPU raycasting for hover/selection.
 */
export function ImpostorAtoms({
  atomsData,
  selectedIndices,
  structureId,
  useGPUPicking: forceGPUPicking,
}: ImpostorAtomsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pickingMeshRef = useRef<THREE.InstancedMesh>(null);
  const pickingSceneRef = useRef<THREE.Scene | null>(null);
  const gpuPickerRef = useRef<GPUPickingManager | null>(null);

  const { gl, camera, size } = useThree();

  const { setHoveredAtom, selectAtom, measurementMode, hoveredAtomIndex, activeStructureId } =
    useMoleculeStore(useShallow(state => ({
      setHoveredAtom: state.setHoveredAtom,
      selectAtom: state.selectAtom,
      measurementMode: state.measurementMode,
      hoveredAtomIndex: state.hoveredAtomIndex,
      activeStructureId: state.activeStructureId,
    })));

  // Determine effective structure ID
  const effectiveStructureId = structureId || activeStructureId || '';

  // Determine if GPU picking should be used
  const shouldUseGPUPicking =
    forceGPUPicking ?? atomsData.length >= GPU_PICKING_THRESHOLD;

  // Check WebGL2 support
  const isWebGL2 = gl.capabilities.isWebGL2;

  // Create billboard geometry (simple plane)
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    return geo;
  }, []);

  // Create instance attributes
  const { colorArray, radiusArray, selectedArray, hoveredArray, indexArray, dummy } =
    useMemo(() => {
      const count = atomsData.length;
      return {
        colorArray: new Float32Array(count * 3),
        radiusArray: new Float32Array(count),
        selectedArray: new Float32Array(count),
        hoveredArray: new Float32Array(count),
        indexArray: new Float32Array(count),
        dummy: new THREE.Object3D(),
      };
    }, [atomsData.length]);

  // Initialize GPU picking
  useEffect(() => {
    if (!shouldUseGPUPicking || !isWebGL2) return;

    // Create picking scene
    pickingSceneRef.current = new THREE.Scene();

    // Create GPU picker
    gpuPickerRef.current = new GPUPickingManager(gl, camera, {
      resolutionScale: 0.25,
      throttleMs: 16,
    });

    return () => {
      gpuPickerRef.current?.dispose();
      gpuPickerRef.current = null;
      pickingSceneRef.current = null;
    };
  }, [shouldUseGPUPicking, isWebGL2, gl, camera]);

  // Resize GPU picker when canvas size changes
  useEffect(() => {
    if (gpuPickerRef.current) {
      gpuPickerRef.current.resize(size.width, size.height);
    }
  }, [size.width, size.height]);

  // Create picking material
  const pickingMaterial = useMemo(() => {
    if (!shouldUseGPUPicking) return null;

    return new THREE.ShaderMaterial({
      vertexShader: pickingVertexShader,
      fragmentShader: pickingFragmentShader,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
  }, [shouldUseGPUPicking]);

  // Update instance matrices and attributes
  useEffect(() => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;
    const selectedSet = new Set(selectedIndices);

    atomsData.forEach((data, i) => {
      // Position
      dummy.position.copy(data.position);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color
      colorArray[i * 3] = data.color.r;
      colorArray[i * 3 + 1] = data.color.g;
      colorArray[i * 3 + 2] = data.color.b;

      // Radius
      radiusArray[i] = data.radius;

      // Selection state
      selectedArray[i] = selectedSet.has(data.index) ? 1.0 : 0.0;

      // Hover state
      hoveredArray[i] = data.index === hoveredAtomIndex ? 1.0 : 0.0;

      // Instance index for GPU picking
      indexArray[i] = i;
    });

    mesh.instanceMatrix.needsUpdate = true;

    // Update instance attributes
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

    // Update picking mesh if using GPU picking
    if (pickingMeshRef.current && shouldUseGPUPicking) {
      atomsData.forEach((data, i) => {
        dummy.position.copy(data.position);
        dummy.updateMatrix();
        pickingMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      pickingMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [
    atomsData,
    selectedIndices,
    hoveredAtomIndex,
    colorArray,
    radiusArray,
    selectedArray,
    hoveredArray,
    indexArray,
    dummy,
    shouldUseGPUPicking,
  ]);

  // Set up instance attributes on geometry
  useEffect(() => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;
    const geo = mesh.geometry;

    // Add instance attributes
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colorArray, 3));
    geo.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(radiusArray, 1));
    geo.setAttribute(
      'instanceSelected',
      new THREE.InstancedBufferAttribute(selectedArray, 1)
    );
    geo.setAttribute(
      'instanceHovered',
      new THREE.InstancedBufferAttribute(hoveredArray, 1)
    );
  }, [colorArray, radiusArray, selectedArray, hoveredArray]);

  // Set up picking mesh attributes
  useEffect(() => {
    if (!pickingMeshRef.current || !shouldUseGPUPicking) return;

    const mesh = pickingMeshRef.current;
    const geo = mesh.geometry;

    // Add picking-specific attributes
    geo.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(radiusArray, 1));
    geo.setAttribute('instanceIndex', new THREE.InstancedBufferAttribute(indexArray, 1));

    // Add picking mesh to picking scene
    if (pickingSceneRef.current) {
      pickingSceneRef.current.add(mesh);
    }

    return () => {
      if (pickingSceneRef.current && mesh) {
        pickingSceneRef.current.remove(mesh);
      }
    };
  }, [radiusArray, indexArray, shouldUseGPUPicking]);

  // Update projection matrix uniform each frame
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
    }
  });

  // GPU-based picking handler
  const handleGPUPick = useCallback(
    (clientX: number, clientY: number): number | null => {
      if (!gpuPickerRef.current || !pickingSceneRef.current) return null;

      const rect = gl.domElement.getBoundingClientRect();
      return gpuPickerRef.current.pick(clientX, clientY, pickingSceneRef.current, rect);
    },
    [gl.domElement]
  );

  // CPU-based picking (fallback for small molecules)
  const handleCPUPick = useCallback(
    (clientX: number, clientY: number): number | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      let closestDist = Infinity;
      let closestIndex = -1;

      for (let i = 0; i < atomsData.length; i++) {
        const data = atomsData[i];
        const sphereCenter = data.position;
        const radius = data.radius;

        const oc = raycaster.ray.origin.clone().sub(sphereCenter);
        const a = raycaster.ray.direction.dot(raycaster.ray.direction);
        const b = 2.0 * oc.dot(raycaster.ray.direction);
        const c = oc.dot(oc) - radius * radius;
        const discriminant = b * b - 4 * a * c;

        if (discriminant >= 0) {
          const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
          if (t > 0 && t < closestDist) {
            closestDist = t;
            closestIndex = i;
          }
        }
      }

      return closestIndex >= 0 ? closestIndex : null;
    },
    [atomsData, camera, gl.domElement]
  );

  // Unified picking handler
  const pickAtom = useCallback(
    (clientX: number, clientY: number): number | null => {
      if (shouldUseGPUPicking) {
        return handleGPUPick(clientX, clientY);
      }
      return handleCPUPick(clientX, clientY);
    },
    [shouldUseGPUPicking, handleGPUPick, handleCPUPick]
  );

  // Pointer move handler
  const handlePointerMove = useCallback(
    (event: THREE.Event & { point?: THREE.Vector3; clientX?: number; clientY?: number }) => {
      const clientX = (event as unknown as PointerEvent).clientX;
      const clientY = (event as unknown as PointerEvent).clientY;

      if (clientX === undefined || clientY === undefined) return;

      const pickedIndex = pickAtom(clientX, clientY);

      if (pickedIndex !== null && pickedIndex >= 0 && pickedIndex < atomsData.length) {
        const data = atomsData[pickedIndex];
        gl.domElement.style.cursor = measurementMode !== 'none' ? 'crosshair' : 'pointer';
        setHoveredAtom(data.atom, data.index, effectiveStructureId, { x: clientX, y: clientY });
      } else {
        gl.domElement.style.cursor = 'auto';
        setHoveredAtom(null, null, null, null);
      }
    },
    [atomsData, gl.domElement, measurementMode, setHoveredAtom, effectiveStructureId, pickAtom]
  );

  const handlePointerOut = useCallback(() => {
    gl.domElement.style.cursor = 'auto';
    setHoveredAtom(null, null, null, null);
  }, [gl.domElement, setHoveredAtom]);

  const handleClick = useCallback(
    (event: THREE.Event & { clientX?: number; clientY?: number }) => {
      const clientX = (event as unknown as MouseEvent).clientX;
      const clientY = (event as unknown as MouseEvent).clientY;

      if (clientX === undefined || clientY === undefined) return;

      const pickedIndex = pickAtom(clientX, clientY);

      if (pickedIndex !== null && pickedIndex >= 0 && pickedIndex < atomsData.length) {
        selectAtom(effectiveStructureId, atomsData[pickedIndex].index);
      }
    },
    [atomsData, selectAtom, effectiveStructureId, pickAtom]
  );

  if (!isWebGL2) {
    console.warn('ImpostorAtoms requires WebGL2 for gl_FragDepth support');
    return null;
  }

  return (
    <>
      {/* Main rendering mesh */}
      <instancedMesh
        ref={meshRef}
        args={[geometry, undefined, atomsData.length]}
        frustumCulled={false}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereImpostorMaterial
          ref={materialRef}
          transparent={false}
          depthWrite={true}
          depthTest={true}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {/* Picking mesh (rendered to offscreen buffer, not visible) */}
      {shouldUseGPUPicking && pickingMaterial && (
        <instancedMesh
          ref={pickingMeshRef}
          args={[geometry.clone(), pickingMaterial, atomsData.length]}
          visible={false}
          frustumCulled={false}
        />
      )}
    </>
  );
}

/**
 * Threshold for switching to impostor rendering.
 * Below this, individual meshes provide better interaction.
 * Above this, impostors are critical for performance.
 */
export const IMPOSTOR_THRESHOLD = 2000;
