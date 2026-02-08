/**
 * GPU-accelerated Gaussian density field computation using WebGL2
 *
 * This module computes molecular surface density fields on the GPU,
 * achieving 30-50x speedup over CPU for large proteins (5000+ atoms).
 *
 * Architecture:
 * - Pack atom data (x, y, z, radius) into a 2D texture
 * - Render one full-screen quad per z-slice
 * - Fragment shader loops over atoms via texture lookup
 * - Read back density field to Float32Array for marching cubes
 */

import type { Atom } from '../types';

// Gaussian density parameters (must match CPU implementation)
const GAUSSIAN_BETA = 2.0;

// Maximum atoms supported (GLSL loop limit)
const MAX_ATOMS = 16384;

// Shaders as inline strings
const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const DENSITY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Atom data texture: RGBA = (x, y, z, radius)
uniform sampler2D uAtomData;
uniform int uAtomCount;
uniform int uAtomTexWidth;

// Grid uniforms
uniform vec3 uBoundsMin;
uniform vec3 uGridSize;
uniform float uStep;
uniform float uZSlice;
uniform float uBeta;

in vec2 vUv;
out vec4 fragColor;

void main() {
  // Compute world position for this voxel
  vec3 voxelPos = uBoundsMin + vec3(
    vUv.x * uGridSize.x,
    vUv.y * uGridSize.y,
    uZSlice
  ) * uStep;

  float density = 0.0;

  // Loop over all atoms via texture lookup
  for (int i = 0; i < 16384; i++) {
    if (i >= uAtomCount) break;

    // 2D texture indexing
    ivec2 texCoord = ivec2(i % uAtomTexWidth, i / uAtomTexWidth);
    vec4 atomData = texelFetch(uAtomData, texCoord, 0);

    vec3 atomPos = atomData.xyz;
    float radius = atomData.w;

    float dist = length(voxelPos - atomPos);
    float normalizedDist = dist / radius;
    density += exp(-uBeta * normalizedDist * normalizedDist);
  }

  fragColor = vec4(density, 0.0, 0.0, 1.0);
}
`;

const NEAREST_ATOM_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Atom data texture: RGBA = (x, y, z, radius)
uniform sampler2D uAtomData;
uniform int uAtomCount;
uniform int uAtomTexWidth;

// Grid uniforms
uniform vec3 uBoundsMin;
uniform vec3 uGridSize;
uniform float uStep;
uniform float uZSlice;

in vec2 vUv;
out vec4 fragColor;

void main() {
  // Compute world position for this voxel
  vec3 voxelPos = uBoundsMin + vec3(
    vUv.x * uGridSize.x,
    vUv.y * uGridSize.y,
    uZSlice
  ) * uStep;

  float minDist = 1e10;
  int nearestAtom = 0;

  // Loop over all atoms to find nearest
  for (int i = 0; i < 16384; i++) {
    if (i >= uAtomCount) break;

    ivec2 texCoord = ivec2(i % uAtomTexWidth, i / uAtomTexWidth);
    vec4 atomData = texelFetch(uAtomData, texCoord, 0);

    vec3 atomPos = atomData.xyz;
    float dist = length(voxelPos - atomPos);

    if (dist < minDist) {
      minDist = dist;
      nearestAtom = i;
    }
  }

  // Encode atom index in RG channels (16-bit = 65536 atoms max)
  float indexLow = float(nearestAtom % 256) / 255.0;
  float indexHigh = float(nearestAtom / 256) / 255.0;

  fragColor = vec4(indexLow, indexHigh, 0.0, 1.0);
}
`;

interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface GPUDensityResult {
  sdf: Float32Array;
  atomOwner: Int32Array;
  w: number;
  h: number;
  d: number;
  bounds: Bounds;
  step: number;
}

interface GPUResources {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  densityProgram: WebGLProgram;
  nearestProgram: WebGLProgram;
  quadBuffer: WebGLBuffer;
  atomTexture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  renderTexture: WebGLTexture;
}

let cachedSupport: boolean | null = null;

/**
 * Check if GPU density computation is supported
 */
export function isGPUDensitySupported(): boolean {
  if (cachedSupport !== null) return cachedSupport;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    cachedSupport = false;
    return false;
  }

  // Check for float texture support (required for density values)
  const ext = gl.getExtension('EXT_color_buffer_float');
  if (!ext) {
    console.warn('[GPU Density] EXT_color_buffer_float not supported');
    cachedSupport = false;
    return false;
  }

  // Check max texture size
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (maxSize < 4096) {
    console.warn('[GPU Density] MAX_TEXTURE_SIZE too small:', maxSize);
    cachedSupport = false;
    return false;
  }

  cachedSupport = true;
  return true;
}

/**
 * Compile a shader from source
 */
function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }

  return shader;
}

/**
 * Create a shader program from vertex and fragment shaders
 */
function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }

  // Clean up shaders (they're now part of the program)
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

/**
 * Initialize GPU resources for density computation
 */
function initGPUResources(
  atoms: Atom[],
  atomRadii: number[],
  gridW: number,
  gridH: number
): GPUResources {
  // Create offscreen canvas and context
  const canvas = document.createElement('canvas');
  canvas.width = gridW;
  canvas.height = gridH;

  const gl = canvas.getContext('webgl2', {
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) throw new Error('WebGL2 not available');

  // Enable float textures
  gl.getExtension('EXT_color_buffer_float');

  // Create shader programs
  const densityProgram = createProgram(gl, VERTEX_SHADER, DENSITY_FRAGMENT_SHADER);
  const nearestProgram = createProgram(gl, VERTEX_SHADER, NEAREST_ATOM_FRAGMENT_SHADER);

  // Create full-screen quad
  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) throw new Error('Failed to create buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  // Create atom data texture
  // Pack atoms into a 2D texture (width × height where width × height >= atomCount)
  const atomTexWidth = Math.min(1024, atoms.length);
  const atomTexHeight = Math.ceil(atoms.length / atomTexWidth);
  const atomData = new Float32Array(atomTexWidth * atomTexHeight * 4);

  for (let i = 0; i < atoms.length; i++) {
    atomData[i * 4 + 0] = atoms[i].x;
    atomData[i * 4 + 1] = atoms[i].y;
    atomData[i * 4 + 2] = atoms[i].z;
    atomData[i * 4 + 3] = atomRadii[i];
  }

  const atomTexture = gl.createTexture();
  if (!atomTexture) throw new Error('Failed to create atom texture');
  gl.bindTexture(gl.TEXTURE_2D, atomTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    atomTexWidth,
    atomTexHeight,
    0,
    gl.RGBA,
    gl.FLOAT,
    atomData
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Create framebuffer and render texture for output
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('Failed to create framebuffer');

  const renderTexture = gl.createTexture();
  if (!renderTexture) throw new Error('Failed to create render texture');
  gl.bindTexture(gl.TEXTURE_2D, renderTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    gridW,
    gridH,
    0,
    gl.RGBA,
    gl.FLOAT,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    renderTexture,
    0
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: ${status}`);
  }

  return {
    gl,
    canvas,
    densityProgram,
    nearestProgram,
    quadBuffer,
    atomTexture,
    framebuffer,
    renderTexture,
  };
}

/**
 * Clean up GPU resources
 */
function cleanupGPUResources(resources: GPUResources): void {
  const { gl, densityProgram, nearestProgram, quadBuffer, atomTexture, framebuffer, renderTexture } = resources;

  gl.deleteProgram(densityProgram);
  gl.deleteProgram(nearestProgram);
  gl.deleteBuffer(quadBuffer);
  gl.deleteTexture(atomTexture);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(renderTexture);
}

/**
 * Render a single z-slice of the density/nearest-atom field
 */
function renderSlice(
  resources: GPUResources,
  program: WebGLProgram,
  atoms: Atom[],
  bounds: Bounds,
  gridW: number,
  gridH: number,
  gridD: number,
  step: number,
  zSlice: number
): void {
  const { gl, quadBuffer, atomTexture } = resources;

  gl.useProgram(program);

  // Set up vertex attribute
  const positionLoc = gl.getAttribLocation(program, 'aPosition');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  // Set uniforms
  const atomTexWidth = Math.min(1024, atoms.length);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atomTexture);
  gl.uniform1i(gl.getUniformLocation(program, 'uAtomData'), 0);

  gl.uniform1i(gl.getUniformLocation(program, 'uAtomCount'), atoms.length);
  gl.uniform1i(gl.getUniformLocation(program, 'uAtomTexWidth'), atomTexWidth);

  gl.uniform3f(
    gl.getUniformLocation(program, 'uBoundsMin'),
    bounds.minX,
    bounds.minY,
    bounds.minZ
  );
  gl.uniform3f(
    gl.getUniformLocation(program, 'uGridSize'),
    gridW,
    gridH,
    gridD
  );
  gl.uniform1f(gl.getUniformLocation(program, 'uStep'), step);
  gl.uniform1f(gl.getUniformLocation(program, 'uZSlice'), zSlice);

  // Only density shader uses beta
  const betaLoc = gl.getUniformLocation(program, 'uBeta');
  if (betaLoc) {
    gl.uniform1f(betaLoc, GAUSSIAN_BETA);
  }

  // Draw
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/**
 * Compute Gaussian density field on GPU
 *
 * @param atoms Array of atoms
 * @param atomRadii Radius for each atom
 * @param bounds Bounding box
 * @param step Grid resolution
 * @returns Density field and nearest atom indices
 */
export function computeGaussianDensityGPU(
  atoms: Atom[],
  atomRadii: number[],
  bounds: Bounds,
  step: number
): GPUDensityResult {
  if (atoms.length > MAX_ATOMS) {
    throw new Error(`Too many atoms: ${atoms.length} > ${MAX_ATOMS}`);
  }

  const startTime = performance.now();

  // Grid dimensions
  const w = Math.ceil((bounds.maxX - bounds.minX) / step);
  const h = Math.ceil((bounds.maxY - bounds.minY) / step);
  const d = Math.ceil((bounds.maxZ - bounds.minZ) / step);
  const size = w * h * d;

  console.log(`[GPU Density] Grid: ${w}×${h}×${d} (${size} voxels), ${atoms.length} atoms`);

  // Initialize GPU resources
  const resources = initGPUResources(atoms, atomRadii, w, h);
  const { gl, framebuffer, densityProgram, nearestProgram } = resources;

  // Allocate output arrays
  const sdf = new Float32Array(size);
  const atomOwner = new Int32Array(size);

  // Temporary buffer for reading pixels
  const pixelBuffer = new Float32Array(w * h * 4);

  try {
    // Pass 1: Compute density field
    console.log('[GPU Density] Pass 1: Computing density field...');
    const densityStart = performance.now();

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, w, h);

    for (let iz = 0; iz < d; iz++) {
      // Render this z-slice
      renderSlice(resources, densityProgram, atoms, bounds, w, h, d, step, iz);

      // Read back pixels
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixelBuffer);

      // Copy density values (stored in R channel)
      const zOffset = iz * w * h;
      for (let iy = 0; iy < h; iy++) {
        for (let ix = 0; ix < w; ix++) {
          const pixelIdx = (iy * w + ix) * 4;
          const sdfIdx = zOffset + iy * w + ix;
          // Convert density to signed distance: 0.5 - density
          // density > 0.5 = inside (negative), density < 0.5 = outside (positive)
          sdf[sdfIdx] = 0.5 - pixelBuffer[pixelIdx];
        }
      }
    }

    console.log(`[GPU Density] Density pass: ${(performance.now() - densityStart).toFixed(0)}ms`);

    // Pass 2: Compute nearest atom indices
    console.log('[GPU Density] Pass 2: Computing nearest atoms...');
    const nearestStart = performance.now();

    for (let iz = 0; iz < d; iz++) {
      renderSlice(resources, nearestProgram, atoms, bounds, w, h, d, step, iz);

      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixelBuffer);

      // Decode atom index from RG channels
      const zOffset = iz * w * h;
      for (let iy = 0; iy < h; iy++) {
        for (let ix = 0; ix < w; ix++) {
          const pixelIdx = (iy * w + ix) * 4;
          const idx = zOffset + iy * w + ix;

          const indexLow = Math.round(pixelBuffer[pixelIdx] * 255);
          const indexHigh = Math.round(pixelBuffer[pixelIdx + 1] * 255);
          atomOwner[idx] = indexLow + indexHigh * 256;
        }
      }
    }

    console.log(`[GPU Density] Nearest atom pass: ${(performance.now() - nearestStart).toFixed(0)}ms`);

  } finally {
    cleanupGPUResources(resources);
  }

  const totalTime = performance.now() - startTime;
  console.log(`[GPU Density] Total: ${totalTime.toFixed(0)}ms`);

  return { sdf, atomOwner, w, h, d, bounds, step };
}
