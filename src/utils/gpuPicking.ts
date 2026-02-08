import * as THREE from 'three';

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

/** Maximum atoms supported (24-bit color = 16.7M) */
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

    // Expand billboard in view space
    mvPosition.xy += position.xy * instanceRadius * 2.0;
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
    // Map UV to normalized device coords on billboard (-1 to 1)
    vec2 coord = (vUv - 0.5) * 4.0;

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

    // Encode index as RGB color
    float idx = vIndex;
    float r = mod(idx, 256.0) / 255.0;
    float g = mod(floor(idx / 256.0), 256.0) / 255.0;
    float b = floor(idx / 65536.0) / 255.0;

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;

export interface GPUPickingManagerOptions {
  /** Resolution scale for picking buffer (0.25 = 1/4 resolution) */
  resolutionScale?: number;
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
 * // On mouse move (throttled internally)
 * const atomIndex = picker.pick(mouseX, mouseY, pickingScene);
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
  private resolutionScale: number;
  private throttleMs: number;
  private lastPickTime: number = 0;
  private cachedResult: number | null = null;
  private lastMouseX: number = -1;
  private lastMouseY: number = -1;

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    options: GPUPickingManagerOptions = {}
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.resolutionScale = options.resolutionScale ?? 0.25;
    this.throttleMs = options.throttleMs ?? 16; // ~60fps

    // Create picking render target at reduced resolution
    const size = renderer.getSize(new THREE.Vector2());
    const width = Math.max(1, Math.floor(size.x * this.resolutionScale));
    const height = Math.max(1, Math.floor(size.y * this.resolutionScale));

    this.pickingTarget = new THREE.WebGLRenderTarget(width, height, {
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
   * Resize the picking buffer when canvas size changes.
   */
  resize(width: number, height: number): void {
    const scaledWidth = Math.max(1, Math.floor(width * this.resolutionScale));
    const scaledHeight = Math.max(1, Math.floor(height * this.resolutionScale));
    this.pickingTarget.setSize(scaledWidth, scaledHeight);
  }

  /**
   * Pick an atom at the given screen coordinates.
   *
   * @param mouseX - Mouse X in screen pixels
   * @param mouseY - Mouse Y in screen pixels
   * @param pickingScene - Scene containing picking meshes
   * @param canvasRect - Canvas bounding rect
   * @returns Atom index or null if no atom hit
   */
  pick(
    mouseX: number,
    mouseY: number,
    pickingScene: THREE.Scene,
    canvasRect: DOMRect
  ): number | null {
    const now = performance.now();

    // Throttle picking updates
    if (now - this.lastPickTime < this.throttleMs) {
      // Return cached result if mouse hasn't moved significantly
      if (
        Math.abs(mouseX - this.lastMouseX) < 2 &&
        Math.abs(mouseY - this.lastMouseY) < 2
      ) {
        return this.cachedResult;
      }
    }

    this.lastPickTime = now;
    this.lastMouseX = mouseX;
    this.lastMouseY = mouseY;

    // Convert mouse position to picking buffer coordinates
    const x = Math.floor(
      ((mouseX - canvasRect.left) / canvasRect.width) *
        this.pickingTarget.width
    );
    const y = Math.floor(
      ((canvasRect.height - (mouseY - canvasRect.top)) / canvasRect.height) *
        this.pickingTarget.height
    );

    // Clamp to buffer bounds
    if (
      x < 0 ||
      x >= this.pickingTarget.width ||
      y < 0 ||
      y >= this.pickingTarget.height
    ) {
      this.cachedResult = null;
      return null;
    }

    // Save current renderer state
    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentClearColor = this.renderer.getClearColor(new THREE.Color());
    const currentClearAlpha = this.renderer.getClearAlpha();

    // Render picking scene
    this.renderer.setRenderTarget(this.pickingTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(pickingScene, this.camera);

    // Read single pixel
    this.renderer.readRenderTargetPixels(
      this.pickingTarget,
      x,
      y,
      1,
      1,
      this.pixelBuffer
    );

    // Restore renderer state
    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.setClearColor(currentClearColor, currentClearAlpha);

    // Decode color to index
    const [r, g, b, a] = this.pixelBuffer;

    // Check for background (alpha = 0 or black)
    if (a === 0 || (r === 0 && g === 0 && b === 0)) {
      this.cachedResult = null;
      return null;
    }

    const index = decodeColorToIndex(r, g, b);
    this.cachedResult = index;
    return index;
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