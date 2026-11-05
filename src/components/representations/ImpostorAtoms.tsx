import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useThree, useFrame, extend, type ThreeEvent } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import type { Atom } from '../../types';
import { useMoleculeStore } from '../../store/moleculeStore';
import { isTouchPointer, lastPointerWasTouch } from '../../hooks/useTouchTooltip';
import { IMPOSTOR_BILLBOARD_SCALE } from '../../config/rendering';
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

      // Expand the billboard in view space to the sphere's bounding square
      mvPosition.xy += position.xy * instanceRadius * ${IMPOSTOR_BILLBOARD_SCALE};
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
      // The offset from the centre, in radii (-1 to 1 across the billboard)
      vec2 coord = (vUv - 0.5) * ${IMPOSTOR_BILLBOARD_SCALE};

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

/** Marks the impostor mesh for model export (see utils/exportModel). */
const IMPOSTOR_EXPORT_USER_DATA = { exportAs: 'spheres' } as const;

/**
 * Threshold for automatic GPU picking activation. Below it the raycast tests
 * every atom's sphere on the CPU (Spacefill's impostors from 2000 atoms); from
 * it, one GPU pick per pointer event replaces that O(n) loop.
 */
const GPU_PICKING_THRESHOLD = 5000;

/**
 * High-performance atom rendering using sphere impostors.
 * Renders thousands of atoms with a single draw call.
 *
 * Performance: 7000 atoms = 1 draw call, 14K triangles (vs 7000 draw calls, 7.1M triangles)
 *
 * For large molecules (>= GPU_PICKING_THRESHOLD atoms), uses GPU-based picking
 * instead of O(n) CPU raycasting for hover/selection.
 */
export function ImpostorAtoms({
  atomsData,
  selectedIndices,
  structureId,
  useGPUPicking: forceGPUPicking,
}: ImpostorAtomsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const gpuPickerRef = useRef<GPUPickingManager | null>(null);

  const { gl, camera, size, invalidate } = useThree();

  const { setHoveredAtom, selectAtom, showContextMenu, measurementMode, hoveredAtomIndex, activeStructureId } =
    useMoleculeStore(useShallow(state => ({
      setHoveredAtom: state.setHoveredAtom,
      selectAtom: state.selectAtom,
      showContextMenu: state.showContextMenu,
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

    // Create GPU picker
    gpuPickerRef.current = new GPUPickingManager(gl, camera, {
      resolutionScale: 0.25,
      throttleMs: 16,
    });

    return () => {
      gpuPickerRef.current?.dispose();
      gpuPickerRef.current = null;
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

  // The picking copy of the mesh, alone in a scene of its own (so it needs no
  // `visible={false}`, which the picking render would skip too). Built here,
  // not in JSX: R3F rebuilds an element whose `args` change by reference, a
  // fresh geometry.clone() on every hover re-render, and the rebuilt mesh would
  // land in the main scene without the picking attributes.
  const pickingScene = useMemo(() => new THREE.Scene(), []);
  const pickingMesh = useMemo(() => {
    if (!pickingMaterial) return null;
    const mesh = new THREE.InstancedMesh(geometry.clone(), pickingMaterial, atomsData.length);
    mesh.frustumCulled = false;
    // Its matrix is the main mesh's world matrix, copied in raycast
    mesh.matrixAutoUpdate = false;
    return mesh;
  }, [geometry, pickingMaterial, atomsData.length]);

  useEffect(() => {
    if (!pickingMesh) return;
    pickingScene.add(pickingMesh);
    return () => {
      pickingScene.remove(pickingMesh);
      pickingMesh.geometry.dispose();
    };
  }, [pickingScene, pickingMesh]);

  // Whether the event being handled is part of an orbit or pan drag (a button
  // held) or a wheel zoom: the camera moves and no tooltip is wanted there, and
  // a GPU pick on each such event halved the frame rate (6,000 atoms, software
  // GL). Pointer-down, -up, clicks and plain moves still pick. Capture on the
  // canvas: it runs before R3F's listeners on its parent raycast.
  const inGestureRef = useRef(false);
  useEffect(() => {
    if (!shouldUseGPUPicking) return;
    const canvas = gl.domElement;
    const onEvent = (event: Event) => {
      inGestureRef.current = event.type === 'wheel' || (event.type === 'pointermove' && (event as PointerEvent).buttons !== 0);
    };
    const types = ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'contextmenu', 'wheel'];
    for (const type of types) canvas.addEventListener(type, onEvent, { capture: true, passive: true });
    return () => {
      for (const type of types) canvas.removeEventListener(type, onEvent, { capture: true });
    };
  }, [shouldUseGPUPicking, gl]);

  // The atoms' bounds (local space), so a ray off the structure costs no GPU pick
  const bounds = useMemo(() => {
    if (!shouldUseGPUPicking) return null;
    const sphere = new THREE.Sphere().setFromPoints(atomsData.map((data) => data.position));
    sphere.radius += atomsData.reduce((max, data) => Math.max(max, data.radius), 0);
    return sphere;
  }, [atomsData, shouldUseGPUPicking]);

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
    if (pickingMesh) {
      (pickingMesh.instanceMatrix.array as Float32Array).set(mesh.instanceMatrix.array);
      pickingMesh.instanceMatrix.needsUpdate = true;
      // Shared arrays; the attributes exist once the effect below has run
      const pickingRadius = pickingMesh.geometry.getAttribute('instanceRadius');
      const pickingIndex = pickingMesh.geometry.getAttribute('instanceIndex');
      if (pickingRadius) pickingRadius.needsUpdate = true;
      if (pickingIndex) pickingIndex.needsUpdate = true;
    }

    // Buffers changed outside React's props, so request a frame (demand rendering).
    invalidate();
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
    pickingMesh,
    invalidate,
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
    invalidate();
  }, [colorArray, radiusArray, selectedArray, hoveredArray, invalidate]);

  // Set up picking mesh attributes
  useEffect(() => {
    if (!pickingMesh) return;

    // Add picking-specific attributes
    const geo = pickingMesh.geometry;
    geo.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(radiusArray, 1));
    geo.setAttribute('instanceIndex', new THREE.InstancedBufferAttribute(indexArray, 1));
  }, [pickingMesh, radiusArray, indexArray]);

  // Update projection matrix uniform each frame
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
    }
  });

  // Pointer events (R3F) raycast the mesh before any handler runs, and the
  // handlers take the atom from the hit (event.instanceId). Three's own test is
  // against the billboards: 1 Å quads in the XY plane, which miss most of each
  // sphere, and its cached bounding sphere can predate the instance positions,
  // so every ray missed. Test the spheres instead, closest hit only: one by one
  // below the GPU-picking threshold, and above it with a GPU pick where the ray
  // meets the screen. The CPU test runs on every pointer event over the
  // structure, drags and wheel included; the GPU pick skips those (above).
  const raycast = useMemo(() => {
    const inverse = new THREE.Matrix4();
    const ray = new THREE.Ray();
    const sphere = new THREE.Sphere();
    const hit = new THREE.Vector3();
    if (shouldUseGPUPicking) {
      const ndc = new THREE.Vector3();
      return function (this: THREE.InstancedMesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
        const picker = gpuPickerRef.current;
        if (!picker || !pickingMesh || !bounds || inGestureRef.current) return;
        // Off the structure: no GPU work
        sphere.copy(bounds).applyMatrix4(this.matrixWorld);
        if (!raycaster.ray.intersectsSphere(sphere)) return;
        // The picking copy takes this mesh's place: Side-by-Side moves each
        // structure by its group. The picking render updates its matrixWorld.
        pickingMesh.matrix.copy(this.matrixWorld);
        pickingMesh.matrixWorldNeedsUpdate = true;
        // A point along the ray, projected: not its origin, which is the camera
        ndc.copy(raycaster.ray.origin).add(raycaster.ray.direction).project(camera);
        const i = picker.pickNdc(ndc.x, ndc.y, pickingScene);
        if (i === null || i >= atomsData.length) return;
        // The hit on that atom's sphere orders structures nearest first (Overlay).
        // The 1/4-resolution pick can land just outside it: then its nearest side.
        sphere.set(atomsData[i].position, atomsData[i].radius).applyMatrix4(this.matrixWorld);
        const distance = raycaster.ray.intersectSphere(sphere, hit)
          ? raycaster.ray.origin.distanceTo(hit)
          : raycaster.ray.origin.distanceTo(sphere.center) - sphere.radius;
        const point = raycaster.ray.at(distance, new THREE.Vector3());
        intersects.push({ distance, point, object: this, instanceId: i });
      };
    }
    return function (this: THREE.InstancedMesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
      inverse.copy(this.matrixWorld).invert();
      ray.copy(raycaster.ray).applyMatrix4(inverse);
      let closest: THREE.Intersection | null = null;
      for (let i = 0; i < atomsData.length; i++) {
        sphere.set(atomsData[i].position, atomsData[i].radius);
        if (!ray.intersectSphere(sphere, hit)) continue;
        const point = hit.clone().applyMatrix4(this.matrixWorld);
        const distance = raycaster.ray.origin.distanceTo(point);
        if (distance < raycaster.near || distance > raycaster.far) continue;
        if (!closest || distance < closest.distance) closest = { distance, point, object: this, instanceId: i };
      }
      if (closest) intersects.push(closest);
    };
  }, [atomsData, shouldUseGPUPicking, pickingMesh, pickingScene, bounds, camera]);

  // Pointer move handler
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      // The nearest structure's atom wins where structures overlap (Overlay).
      // First, before setHoveredAtom: stopping sends a pointer-out, which
      // clears the hover, to the farther mesh's atom hovered on the last move.
      event.stopPropagation();
      // Fingers don't hover: a tap shows the tooltip instead (handleClick).
      if (isTouchPointer(event)) return;
      const { clientX, clientY } = event;

      const pickedIndex = event.instanceId ?? null;

      if (pickedIndex !== null && pickedIndex >= 0 && pickedIndex < atomsData.length) {
        const data = atomsData[pickedIndex];
        gl.domElement.style.cursor = measurementMode !== 'none' ? 'crosshair' : 'pointer';
        setHoveredAtom(data.atom, data.index, effectiveStructureId, { x: clientX, y: clientY });
      } else {
        gl.domElement.style.cursor = 'auto';
        setHoveredAtom(null, null, null, null);
      }
    },
    [atomsData, gl.domElement, measurementMode, setHoveredAtom, effectiveStructureId]
  );

  const handlePointerOut = useCallback(
    (event?: unknown) => {
      // A finger lifting off fires pointerout: keep the tapped atom's tooltip.
      if (isTouchPointer(event)) return;
      gl.domElement.style.cursor = 'auto';
      setHoveredAtom(null, null, null, null);
    },
    [gl.domElement, setHoveredAtom]
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation(); // Only the nearest structure's atom is selected
      const { clientX, clientY } = event;

      const pickedIndex = event.instanceId ?? null;

      if (pickedIndex !== null && pickedIndex >= 0 && pickedIndex < atomsData.length) {
        const data = atomsData[pickedIndex];
        selectAtom(effectiveStructureId, data.index);
        if (lastPointerWasTouch()) {
          setHoveredAtom(data.atom, data.index, effectiveStructureId, { x: clientX, y: clientY });
        }
      }
    },
    [atomsData, selectAtom, setHoveredAtom, effectiveStructureId]
  );

  // The atom menu (Focus, Measure From Here, Add Label, ...), as SelectableAtom
  // opens it for one mesh per atom. Long-press on Android fires contextmenu too.
  const handleContextMenu = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const pickedIndex = event.instanceId ?? null;
      if (pickedIndex === null || pickedIndex < 0 || pickedIndex >= atomsData.length) return;
      event.stopPropagation();
      event.nativeEvent.preventDefault();
      const { atom, index } = atomsData[pickedIndex];
      showContextMenu({
        x: event.clientX,
        y: event.clientY,
        atomIndex: index,
        structureId: effectiveStructureId,
        chainId: atom.chainId,
        residueName: atom.residueName,
        residueNumber: atom.residueNumber,
      });
    },
    [atomsData, effectiveStructureId, showContextMenu]
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
        // Model export (utils/exportModel) replaces these billboards with real
        // spheres, read from instanceMatrix + instanceRadius + instanceColor.
        userData={IMPOSTOR_EXPORT_USER_DATA}
        raycast={raycast}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <sphereImpostorMaterial
          ref={materialRef}
          transparent={false}
          depthWrite={true}
          depthTest={true}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </>
  );
}

/**
 * Threshold for switching to impostor rendering.
 * Below this, individual meshes provide better interaction.
 * Above this, impostors are critical for performance.
 */
export const IMPOSTOR_THRESHOLD = 2000;
