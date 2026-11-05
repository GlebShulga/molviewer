import * as THREE from 'three';
import { IMPOSTOR_BILLBOARD_SCALE } from '../config/rendering';

/**
 * GPU-based picking for high-performance atom selection.
 *
 * Instead of O(n) CPU raycasting on every mouse move, this renders
 * each atom with a unique color encoding its index, then reads a
 * single pixel to determine which atom is under the cursor.
 *
 * Performance: O(n) per mouse move → O(1) (single pixel read)
 *
 * @see https://threejs.org/examples/#webgl_interactive_cubes_gpu
 */

/** Maximum atoms supported (24-bit color = 16.7M, black is "no atom") */
export const MAX_PICKABLE_ATOMS = 16777215;

/** Encode atom index as RGB color (24-bit) */
export function encodeIndexToColor(index: number): THREE.Color {
  const r = (index & 0xFF) / 255;
  const g = ((index >> 8) & 0xFF) / 255;
  const b = ((index >> 16) & 0xFF) / 255;
  return new THREE.Color(r, g, b);
}

/** Decode RGB color back to atom index */
export function decodeColorToIndex(r: number, g: number, b: number): number {
  return r + (g << 8) + (b << 16);
}

/**
 * Picking shader material for sphere impostors.
 * Renders atoms with unique colors for GPU picking.
 */
export const pickingVertexShader = /* glsl */ `
  attribute float instanceIndex;
  attribute float instanceRadius;

  varying float vIndex;
  varying vec2 vUv;
  varying vec3 vSphereCenter;
  varying float vRadius;

  void main() {
    vIndex = instanceIndex;
    vUv = uv;
    vRadius = instanceRadius;

    // Transform sphere center to view space
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vSphereCenter = mvPosition.xyz;

    // Expand the billboard in view space to the sphere's bounding square
    mvPosition.xy += position.xy * instanceRadius * ${IMPOSTOR_BILLBOARD_SCALE};
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const pickingFragmentShader = /* glsl */ `
  uniform mat4 projectionMatrix;

  varying float vIndex;
  varying vec2 vUv;
  varying vec3 vSphereCenter;
  varying float vRadius;

  void main() {
    // The offset from the centre, in radii (-1 to 1 across the billboard)
    vec2 coord = (vUv - 0.5) * ${IMPOSTOR_BILLBOARD_SCALE};

    // Early discard for corners outside sphere projection
    float distSq = dot(coord, coord);
    if (distSq > 1.0) discard;

    // Calculate hit point for correct depth
    float z = sqrt(1.0 - distSq);
    vec3 normal = vec3(coord, z);
    vec3 hitPoint = vSphereCenter + normal * vRadius;

    // Correct depth
    vec4 clipPos = projectionMatrix * vec4(hitPoint, 1.0);
    float ndcDepth = clipPos.z / clipPos.w;
    gl_FragDepth = ndcDepth * 0.5 + 0.5;

    // Encode index + 1 as RGB color: black is the cleared background, so atom 0
    // must not be black too. GPUPickingManager.pickNdc subtracts the 1 again.
    float idx = vIndex + 1.0;
    float r = mod(idx, 256.0) / 255.0;
    float g = mod(floor(idx / 256.0), 256.0) / 255.0;
    float b = floor(idx / 65536.0) / 255.0;

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;

export interface GPUPickingManagerOptions {
  /** Throttle interval in ms for picking updates */
  throttleMs?: number;
}

/**
 * Manages GPU-based picking for atom selection.
 *
 * Usage:
 * ```typescript
 * const picker = new GPUPickingManager(renderer, camera);
 *
 * // At a point in NDC, e.g. where a raycast's ray meets the screen (throttled internally)
 * const atomIndex = picker.pickNdc(ndcX, ndcY, pickingScene);
 * if (atomIndex !== null) {
 *   // Atom at index was hit
 * }
 *
 * // Cleanup
 * picker.dispose();
 * ```
 */
export class GPUPickingManager {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.Camera;
  private pickingTarget: THREE.WebGLRenderTarget;
  private pixelBuffer: Uint8Array;
  private throttleMs: number;
  private lastPickTime: number = -Infinity;
  private cachedResult: number | null = null;
  private lastNdcX: number = NaN;
  private lastNdcY: number = NaN;
  private canvasSize = new THREE.Vector2();

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    options: GPUPickingManagerOptions = {}
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.throttleMs = options.throttleMs ?? 16; // ~60fps

    // One pixel: the camera's view offset narrows each pick to the pixel under
    // the point, at full resolution, so the render costs next to nothing
    this.pickingTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      // Disable anti-aliasing for accurate color picking
      samples: 0,
    });

    this.pixelBuffer = new Uint8Array(4);
  }

  /**
   * Pick an atom at a point in normalized device coordinates (-1 to 1, y up).
   *
   * Throttled: within `throttleMs` of the last pick and less than 2 CSS pixels
   * from it, the last result comes back without rendering.
   *
   * @param ndcX - X in NDC
   * @param ndcY - Y in NDC
   * @param pickingScene - Scene containing picking meshes
   * @returns Atom index or null if no atom hit
   */
  pickNdc(ndcX: number, ndcY: number, pickingScene: THREE.Scene): number | null {
    const now = performance.now();

    // 2 CSS pixels in NDC, which spans 2 across the canvas
    const canvas = this.renderer.getSize(this.canvasSize);
    if (
      now - this.lastPickTime < this.throttleMs &&
      Math.abs(ndcX - this.lastNdcX) < (2 * 2) / canvas.x &&
      Math.abs(ndcY - this.lastNdcY) < (2 * 2) / canvas.y
    ) {
      return this.cachedResult;
    }

    this.lastPickTime = now;
    this.lastNdcX = ndcX;
    this.lastNdcY = ndcY;

    // Off the canvas: nothing to pick
    if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) {
      this.cachedResult = null;
      return null;
    }

    // The canvas pixel the point falls in (CSS pixels, origin top-left)
    const x = ((ndcX + 1) / 2) * canvas.x;
    const y = ((1 - ndcY) / 2) * canvas.y;

    // Save current renderer and camera state
    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentClearColor = this.renderer.getClearColor(new THREE.Color());
    const currentClearAlpha = this.renderer.getClearAlpha();
    const camera = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const view = camera.view?.enabled ? { ...camera.view } : null;
    // A perspective camera's setViewOffset also sets its aspect
    const aspect = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).aspect : null;

    // Render just that pixel of the picking scene
    camera.setViewOffset(canvas.x, canvas.y, x - 0.5, y - 0.5, 1, 1);
    this.renderer.setRenderTarget(this.pickingTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(pickingScene, camera);
    this.renderer.readRenderTargetPixels(this.pickingTarget, 0, 0, 1, 1, this.pixelBuffer);

    // Restore renderer and camera state
    if (aspect !== null) (camera as THREE.PerspectiveCamera).aspect = aspect;
    if (view) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
    else camera.clearViewOffset();
    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.setClearColor(currentClearColor, currentClearAlpha);

    // Decode color to index
    const [r, g, b, a] = this.pixelBuffer;

    // Background (alpha = 0 or black). Atoms are drawn as index + 1.
    const encoded = a === 0 ? 0 : decodeColorToIndex(r, g, b);
    this.cachedResult = encoded === 0 ? null : encoded - 1;
    return this.cachedResult;
  }

  /**
   * Create a picking material for sphere impostors.
   */
  createPickingMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: pickingVertexShader,
      fragmentShader: pickingFragmentShader,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.pickingTarget.dispose();
  }
}

/**
 * Create instance index buffer attribute for GPU picking.
 * Each atom gets a unique index encoded for the picking shader.
 */
export function createInstanceIndexAttribute(count: number): THREE.InstancedBufferAttribute {
  const indices = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    indices[i] = i;
  }
  return new THREE.InstancedBufferAttribute(indices, 1);
}