import { Canvas, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import { Suspense, useRef, useEffect, useImperativeHandle, forwardRef, useMemo, type ReactNode } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { CAMERA, LIGHTING, COLORS, ORBIT_CONTROLS, SSAO, getQualityPreset } from "../../config";
import { useMoleculeStore } from "../../store/moleculeStore";

export interface MoleculeViewerHandle {
  homeView: () => void;
  exportImage: (options?: { scale?: number; background?: string | null; filename?: string }) => void;
}

export interface MoleculeViewerProps {
  children?: ReactNode;
  backgroundColor?: string;
  cameraPosition?: readonly [number, number, number];
  cameraFov?: number;
  ambientLightIntensity?: number;
  directionalLightIntensity?: number;
  style?: React.CSSProperties;
  className?: string;
  autoRotate?: boolean;
  /** Number of atoms - used for adaptive quality settings */
  atomCount?: number;
  /** Callback to get bounding box for all structures */
  getBoundingBox?: () => { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3 } | null;
}

interface SceneControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  autoRotate?: boolean;
  backgroundColor?: string;
}

function SceneController({ controlsRef, autoRotate, backgroundColor }: SceneControllerProps) {
  const { camera, gl, scene } = useThree();
  const setControlsReady = useMoleculeStore(state => state.setControlsReady);

  useEffect(() => {
    // Store refs in a global store for export functionality
    (window as unknown as { __mol3d_gl?: THREE.WebGLRenderer }).__mol3d_gl = gl;
    (window as unknown as { __mol3d_scene?: THREE.Scene }).__mol3d_scene = scene;
    (window as unknown as { __mol3d_camera?: THREE.Camera }).__mol3d_camera = camera;
  }, [gl, scene, camera]);

  // Set Three.js scene background color
  useEffect(() => {
    if (backgroundColor) {
      scene.background = new THREE.Color(backgroundColor);
    }
  }, [scene, backgroundColor]);

  // Set controls ready on mount, clear on unmount
  useEffect(() => {
    setControlsReady(true);
    return () => setControlsReady(false);
  }, [setControlsReady]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={ORBIT_CONTROLS.dampingFactor}
      autoRotate={autoRotate}
      autoRotateSpeed={2}
    />
  );
}

export const MoleculeViewer = forwardRef<MoleculeViewerHandle, MoleculeViewerProps>(
  function MoleculeViewer(
    {
      children,
      backgroundColor = COLORS.background,
      cameraPosition = CAMERA.position,
      cameraFov = CAMERA.fov,
      ambientLightIntensity = LIGHTING.ambient.intensity,
      directionalLightIntensity = LIGHTING.directional.intensity,
      style,
      className,
      autoRotate = false,
      atomCount = 0,
      getBoundingBox,
    },
    ref
  ) {
    const controlsRef = useRef<OrbitControlsImpl>(null);

    // Get quality preset based on atom count
    const qualityPreset = useMemo(() => getQualityPreset(atomCount), [atomCount]);
    const { postProcessing, aoQuality } = qualityPreset;

    useImperativeHandle(ref, () => ({
      homeView: () => {
        if (!controlsRef.current) return;

        const controls = controlsRef.current;
        const camera = controls.object as THREE.PerspectiveCamera;

        // Try to get bounding box from all structures
        const bounds = getBoundingBox?.();

        if (bounds) {
          // Calculate camera position to fit all structures
          const center = bounds.center;
          const size = new THREE.Vector3();
          size.subVectors(bounds.max, bounds.min);
          const maxDim = Math.max(size.x, size.y, size.z);

          // Calculate distance needed to fit the scene
          const fovRad = (cameraFov * Math.PI) / 180;
          const distance = (maxDim / 2) / Math.tan(fovRad / 2) * 1.5; // 1.5 for padding

          // Position camera to look at center from a 45-degree angle
          const cameraOffset = new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(distance);
          camera.position.copy(center).add(cameraOffset);
          camera.lookAt(center);
          controls.target.copy(center);
        } else {
          // Fallback to default position
          camera.position.set(...cameraPosition);
          camera.lookAt(0, 0, 0);
          controls.target.set(0, 0, 0);
        }

        controls.update();
      },
      exportImage: (options = {}) => {
        const gl = (window as unknown as { __mol3d_gl?: THREE.WebGLRenderer }).__mol3d_gl;
        const scene = (window as unknown as { __mol3d_scene?: THREE.Scene }).__mol3d_scene;
        const camera = (window as unknown as { __mol3d_camera?: THREE.Camera }).__mol3d_camera;

        if (!gl || !scene || !camera) {
          console.error("WebGL context not available for export");
          return;
        }

        const { scale = 2, background = null, filename = "molecule" } = options;

        const originalSize = gl.getSize(new THREE.Vector2());
        const originalPixelRatio = gl.getPixelRatio();
        const originalBackground = scene.background;

        try {
          gl.setPixelRatio(scale);
          gl.setSize(originalSize.x, originalSize.y);

          if (background) {
            scene.background = new THREE.Color(background);
          } else {
            scene.background = null;
          }

          gl.render(scene, camera);

          const dataUrl = gl.domElement.toDataURL("image/png");
          const link = document.createElement("a");
          link.download = `${filename}.png`;
          link.href = dataUrl;
          link.click();
        } finally {
          gl.setPixelRatio(originalPixelRatio);
          gl.setSize(originalSize.x, originalSize.y);
          scene.background = originalBackground;
          gl.render(scene, camera);
        }
      },
    }));

    return (
      <Canvas
        style={{ background: backgroundColor, ...style }}
        className={className}
        gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
        onCreated={(state: RootState) => {
          // Set globals immediately when Canvas context is created
          // This fires synchronously and is more reliable than useEffect for initial setup
          (window as unknown as { __mol3d_gl?: typeof state.gl }).__mol3d_gl = state.gl;
          (window as unknown as { __mol3d_scene?: typeof state.scene }).__mol3d_scene = state.scene;
          (window as unknown as { __mol3d_camera?: typeof state.camera }).__mol3d_camera = state.camera;
          (window as unknown as { __mol3d_ready?: boolean }).__mol3d_ready = true;
        }}
      >
        <PerspectiveCamera makeDefault position={[...cameraPosition]} fov={cameraFov} />

        {/* Enhanced lighting setup */}
        <hemisphereLight
          args={[LIGHTING.hemisphere.skyColor, LIGHTING.hemisphere.groundColor]}
          intensity={LIGHTING.hemisphere.intensity}
        />
        <ambientLight intensity={ambientLightIntensity} />
        {/* Key light - main illumination */}
        <directionalLight
          position={[...LIGHTING.keyLight.position]}
          intensity={directionalLightIntensity}
          color={LIGHTING.keyLight.color}
        />
        {/* Fill light - soften shadows */}
        <directionalLight
          position={[...LIGHTING.fillLight.position]}
          intensity={LIGHTING.fillLight.intensity}
          color={LIGHTING.fillLight.color}
        />
        {/* Rim light - edge definition */}
        <directionalLight
          position={[...LIGHTING.rimLight.position]}
          intensity={LIGHTING.rimLight.intensity}
          color={LIGHTING.rimLight.color}
        />

        <Suspense fallback={null}>{children}</Suspense>
        <SceneController controlsRef={controlsRef} autoRotate={autoRotate} backgroundColor={backgroundColor} />

        {/* Post-processing effects - conditional based on molecule size */}
        {postProcessing.ao && postProcessing.smaa && (
          <EffectComposer multisampling={0}>
            <N8AO
              aoRadius={SSAO.aoRadius}
              intensity={SSAO.intensity}
              distanceFalloff={SSAO.distanceFalloff}
              color={SSAO.color}
              quality={aoQuality}
            />
            <SMAA />
          </EffectComposer>
        )}
        {postProcessing.ao && !postProcessing.smaa && (
          <EffectComposer multisampling={0}>
            <N8AO
              aoRadius={SSAO.aoRadius}
              intensity={SSAO.intensity}
              distanceFalloff={SSAO.distanceFalloff}
              color={SSAO.color}
              quality={aoQuality}
            />
          </EffectComposer>
        )}
        {!postProcessing.ao && postProcessing.smaa && (
          <EffectComposer multisampling={0}>
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>
    );
  }
);
