import { Canvas, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import { Suspense, useRef, useEffect, useImperativeHandle, forwardRef, useMemo, useState, type ReactNode } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { CAMERA, LIGHTING, COLORS, ORBIT_CONTROLS, SSAO, MAX_DPR, getQualityPreset } from "../../config";
import { useMoleculeStore } from "../../store/moleculeStore";
import { viewerRefs } from "../../utils/viewerRefs";
import { dataUrlToBlob, drawWatermark } from "../../utils/exportImage";
import { logError } from "../../utils/errorReporter";
import { roundAtoms, track } from "../../utils/track";
import { recordTurntable as recordTurntableFrames, type RecordTurntableOptions } from "../../utils/exportVideo";
import type { ModelFormat, ExportModelOptions, ExportModelResult } from "../../utils/exportModel";

import type { CameraSnapshot } from "../../types/session";
import overlayStyles from "./ViewerOverlays.module.css";
export type { CameraSnapshot };

export interface MoleculeViewerHandle {
  homeView: () => void;
  /** Renders the view as a PNG; the caller saves or shares it. Null without a WebGL context. */
  exportImage: (options?: { scale?: number; background?: string | null; watermark?: string }) => Blob | null;
  getCameraSnapshot: () => CameraSnapshot | null;
  applyCameraSnapshot: (snapshot: CameraSnapshot) => void;
  /**
   * Record one full camera orbit of the current view. Resolves with the video
   * blob, or null when cancelled via `signal`. Camera, auto-rotate and control
   * state are restored afterwards.
   */
  recordTurntable: (options: TurntableRecordOptions) => Promise<Blob | null>;
  /** Export the visible scene as a GLB or binary STL model. */
  exportModel: (format: ModelFormat, options?: ExportModelOptions) => Promise<ExportModelResult>;
}

export type TurntableRecordOptions = Pick<
  RecordTurntableOptions,
  'seconds' | 'mimeType' | 'watermark' | 'onProgress' | 'signal' | 'fps'
>;

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
  /** Where the controls look at first. Without it, the origin. */
  target?: CameraSnapshot['target'];
  /** Told when the WebGL context is lost (true) and restored (false). */
  onContextLostChange: (lost: boolean) => void;
}

function sceneAtomCount(): number {
  let atoms = 0;
  for (const s of useMoleculeStore.getState().structures.values()) atoms += s.molecule.atoms.length;
  return atoms;
}

/** The camera as the controls hold it. Plain objects, so readable on a lost context too. */
function cameraSnapshotOf(controls: OrbitControlsImpl | null): CameraSnapshot | null {
  if (!controls) return null;
  const camera = controls.object as THREE.PerspectiveCamera;
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    zoom: camera.zoom,
  };
}

function SceneController({ controlsRef, autoRotate, backgroundColor, target, onContextLostChange }: SceneControllerProps) {
  const { camera, gl, scene, invalidate } = useThree();
  const setControlsReady = useMoleculeStore(state => state.setControlsReady);

  useEffect(() => {
    // Store refs for export functionality
    viewerRefs.gl = gl;
    viewerRefs.scene = scene;
    viewerRefs.camera = camera;
  }, [gl, scene, camera]);

  // Handle WebGL context loss/restore
  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLostChange(true);
      track('webgl_context_lost', { atoms: roundAtoms(sceneAtomCount()) });
    };
    const handleContextRestored = () => {
      onContextLostChange(false);
      track('webgl_context_restored', { atoms: roundAtoms(sceneAtomCount()) });
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl, invalidate, onContextLostChange]);

  // Set Three.js scene background color
  useEffect(() => {
    if (backgroundColor) {
      scene.background = new THREE.Color(backgroundColor);
      invalidate();
    }
  }, [scene, backgroundColor, invalidate]);

  // Under demand rendering, auto-rotate keeps itself going (each controls
  // update fires 'change', which requests the next frame) but needs a first
  // frame to start from.
  useEffect(() => {
    if (autoRotate) invalidate();
  }, [autoRotate, invalidate]);

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
      target={target}
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
    const recordingRef = useRef(false);
    // The canvas renders on demand. Imperative camera and export changes below
    // happen outside React, so they request frames through these (set in onCreated).
    const invalidateRef = useRef<RootState["invalidate"] | null>(null);
    const setFrameloopRef = useRef<RootState["setFrameloop"] | null>(null);
    const invalidate = () => invalidateRef.current?.();

    // Get quality preset based on atom count
    const qualityPreset = useMemo(() => getQualityPreset(atomCount), [atomCount]);
    const { postProcessing, aoQuality } = qualityPreset;
    const { ao, smaa } = postProcessing;

    // The browser can take the WebGL context away (usually from a background
    // tab) and give it back later.
    const [contextLost, setContextLost] = useState(false);

    // "Reload viewer" is the way out when the context doesn't come back: a new
    // key gives a new Canvas, so a new canvas element and a new context. The
    // view goes in as the first props of the new camera and controls. R3F
    // applies a prop only when its value changes, so later renders don't pull
    // the camera back to it.
    const [reload, setReload] = useState<{ key: number; camera: CameraSnapshot | null }>({ key: 0, camera: null });
    const reloadViewer = () => {
      const camera = cameraSnapshotOf(controlsRef.current);
      setReload((prev) => ({ key: prev.key + 1, camera }));
      setContextLost(false);
      track('webgl_viewer_reloaded', { atoms: roundAtoms(sceneAtomCount()) });
    };

    // One element, kept between renders. EffectComposer re-adds its passes
    // whenever it gets new children, and adding a pass throws on a lost
    // context, so any unrelated render must not reach it. While the context is lost there is no composer at all;
    // on restore a new one is built with new render targets.
    const postEffects = useMemo(() => {
      if (contextLost || (!ao && !smaa)) return null;
      const aoEffect = (
        <N8AO
          aoRadius={SSAO.aoRadius}
          intensity={SSAO.intensity}
          distanceFalloff={SSAO.distanceFalloff}
          color={SSAO.color}
          quality={aoQuality}
        />
      );
      if (!ao) {
        return (
          <EffectComposer multisampling={0}>
            <SMAA />
          </EffectComposer>
        );
      }
      if (!smaa) return <EffectComposer multisampling={0}>{aoEffect}</EffectComposer>;
      return (
        <EffectComposer multisampling={0}>
          {aoEffect}
          <SMAA />
        </EffectComposer>
      );
    }, [ao, smaa, aoQuality, contextLost]);

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
        invalidate();
      },
      getCameraSnapshot: () => cameraSnapshotOf(controlsRef.current),
      applyCameraSnapshot: (snapshot: CameraSnapshot) => {
        const controls = controlsRef.current;
        if (!controls) return;
        const camera = controls.object as THREE.PerspectiveCamera;
        camera.position.set(...snapshot.position);
        controls.target.set(...snapshot.target);
        camera.zoom = snapshot.zoom;
        camera.updateProjectionMatrix();
        camera.lookAt(controls.target);
        controls.update();
        // A zoom-only change doesn't make OrbitControls fire 'change'.
        invalidate();
      },
      recordTurntable: async (options) => {
        const controls = controlsRef.current;
        const { gl, scene } = viewerRefs;
        if (!controls || !gl || !scene) {
          throw new Error("Viewer is not ready for video export.");
        }
        if (recordingRef.current) {
          throw new Error("A recording is already in progress.");
        }
        recordingRef.current = true;

        const camera = controls.object as THREE.PerspectiveCamera;
        const prev = {
          autoRotate: controls.autoRotate,
          enabled: controls.enabled,
          enableDamping: controls.enableDamping,
        };

        // Settle any damping momentum so the start pose is stable.
        controls.autoRotate = false;
        controls.enableDamping = false;
        controls.update();
        controls.enabled = false;
        // setAngle moves the camera directly and disabled controls fire no
        // 'change', so render every frame while recording.
        setFrameloopRef.current?.("always");

        const startPosition = camera.position.clone();
        const target = controls.target.clone();
        const offset = startPosition.clone().sub(target);
        const axis = camera.up.clone().normalize();
        const q = new THREE.Quaternion();

        const background = (scene.background as THREE.Color | null)?.isColor
          ? `#${(scene.background as THREE.Color).getHexString()}`
          : backgroundColor;

        try {
          return await recordTurntableFrames(
            {
              canvas: gl.domElement,
              background,
              setAngle: (angle) => {
                q.setFromAxisAngle(axis, angle);
                camera.position.copy(target).add(offset.clone().applyQuaternion(q));
                camera.lookAt(target);
              },
            },
            options
          );
        } finally {
          camera.position.copy(startPosition);
          camera.lookAt(target);
          controls.target.copy(target);
          controls.enabled = prev.enabled;
          controls.enableDamping = prev.enableDamping;
          controls.autoRotate = prev.autoRotate;
          controls.update();
          setFrameloopRef.current?.("demand");
          invalidate();
          recordingRef.current = false;
        }
      },
      exportModel: async (format, options) => {
        const { scene } = viewerRefs;
        if (!scene) throw new Error("Viewer is not ready for model export.");
        // Loaded on demand so the exporters stay out of the main bundle.
        const { exportModel } = await import("../../utils/exportModel");
        return exportModel(scene, format, options);
      },
      exportImage: (options = {}) => {
        const { gl, scene, camera } = viewerRefs;

        if (!gl || !scene || !camera) {
          console.error("WebGL context not available for export");
          logError("WebGL context not available for export", { source: 'MoleculeViewer', op: 'export' });
          return null;
        }

        const { scale = 2, background = null, watermark } = options;

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

          const sourceCanvas = watermark
            ? drawWatermark(gl.domElement, watermark)
            : gl.domElement;
          // Synchronous (toBlob is async), so the caller can still open the
          // share sheet inside the tap's user activation.
          return dataUrlToBlob(sourceCanvas.toDataURL("image/png"));
        } finally {
          gl.setPixelRatio(originalPixelRatio);
          gl.setSize(originalSize.x, originalSize.y);
          scene.background = originalBackground;
          gl.render(scene, camera);
          // That render skipped the composer (AO, SMAA); redraw the screen with it.
          invalidate();
        }
      },
    }));

    return (
      <>
      <Canvas
        key={reload.key}
        style={{ background: backgroundColor, ...style }}
        className={className}
        dpr={[1, MAX_DPR]}
        // antialias stays on: exportImage renders with gl.render directly, past
        // the composer's SMAA, so canvas MSAA is all a PNG export gets.
        gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
        // Draw only when something changes. Camera input redraws through
        // OrbitControls' 'change' events, prop changes through R3F; imperative
        // changes call invalidate().
        frameloop="demand"
        onCreated={(state: RootState) => {
          // Set refs immediately when Canvas context is created
          // This fires synchronously and is more reliable than useEffect for initial setup
          viewerRefs.gl = state.gl;
          viewerRefs.scene = state.scene;
          viewerRefs.camera = state.camera;
          viewerRefs.ready = true;
          invalidateRef.current = state.invalidate;
          setFrameloopRef.current = state.setFrameloop;
        }}
      >
        <PerspectiveCamera
          makeDefault
          position={reload.camera?.position ?? [...cameraPosition]}
          zoom={reload.camera?.zoom ?? 1}
          fov={cameraFov}
        />

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
        <SceneController
          controlsRef={controlsRef}
          autoRotate={autoRotate}
          backgroundColor={backgroundColor}
          target={reload.camera?.target}
          onContextLostChange={setContextLost}
        />

        {/* Post-processing effects - conditional based on molecule size */}
        {postEffects}
      </Canvas>
      {/* Shown (after a delay, in CSS) for as long as the context is lost. */}
      {contextLost && (
        <div className={overlayStyles.contextLost} role="status" style={{ backgroundColor }}>
          <p>The browser paused 3D graphics. Waiting for it to come back.</p>
          <button type="button" className={overlayStyles.chipButton} onClick={reloadViewer}>
            Reload viewer
          </button>
        </div>
      )}
      </>
    );
  }
);
