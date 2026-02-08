/**
 * 3D Euclidean Distance Transform using Felzenszwalb-Huttenlocher algorithm
 *
 * This implements the separable EDT algorithm from:
 * "Distance Transforms of Sampled Functions" by Felzenszwalb & Huttenlocher (2012)
 *
 * The algorithm works by computing 1D distance transforms along each axis sequentially.
 * Each 1D pass uses the lower envelope of parabolas to compute exact squared Euclidean distances.
 *
 * Time complexity: O(n) where n = w * h * d
 * Space complexity: O(max(w, h, d)) for temporary arrays
 */

// INF must be larger than any possible squared distance in the grid
// For an 80x80x80 grid, max squared distance is 3*80² = 19200
// Using 1e9 to have margin but avoid numerical issues
const INF = 1e9;

/**
 * 1D Euclidean Distance Transform using lower envelope of parabolas
 *
 * @param f - Input/output array. Input: squared distance (0 for boundary, INF for non-boundary)
 *            Output: squared Euclidean distance to nearest boundary
 * @param n - Length of the array
 * @param v - Temp array for parabola indices (size n)
 * @param z - Temp array for intersection points (size n+1)
 */
function edt1d(
  f: Float32Array,
  n: number,
  v: Int32Array,
  z: Float32Array
): void {
  // Handle edge case: single element
  if (n <= 1) return;

  // Find the first finite value to start the envelope
  let k = -1;
  for (let q = 0; q < n; q++) {
    if (f[q] < INF) {
      if (k === -1) {
        // First finite parabola
        k = 0;
        v[0] = q;
        z[0] = -INF;
        z[1] = INF;
      } else {
        // Add subsequent finite parabolas
        let s: number;
        do {
          const r = v[k];
          // Parabola intersection formula:
          // s = (f[q] - f[r] + q² - r²) / (2(q - r))
          s = (f[q] - f[r] + q * q - r * r) / (2 * (q - r));
          if (s <= z[k]) {
            k--;
          } else {
            break;
          }
        } while (k >= 0);

        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
      }
    }
  }

  // If no finite values found, leave array unchanged (all INF)
  if (k === -1) return;

  // Fill in distance values by sampling the envelope
  let j = 0;
  for (let q = 0; q < n; q++) {
    // Find which parabola covers position q
    while (z[j + 1] < q) j++;
    const r = v[j];
    const dx = q - r;
    // Squared distance: original value at r plus squared distance to r
    f[q] = f[r] + dx * dx;
  }
}

/**
 * 3D Euclidean Distance Transform (in-place)
 *
 * Applies 1D EDT along each axis sequentially (separable algorithm).
 * The grid is modified in-place.
 *
 * @param grid - Input/output grid. Input: 0 for boundary voxels, INF for non-boundary.
 *               Output: Euclidean distance to nearest boundary.
 * @param w - Grid width (X dimension)
 * @param h - Grid height (Y dimension)
 * @param d - Grid depth (Z dimension)
 */
export function edt3d(
  grid: Float32Array,
  w: number,
  h: number,
  d: number
): void {
  // Allocate temporary arrays once (reused for all 1D transforms)
  const maxDim = Math.max(w, h, d);
  const f = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);

  // Pass 1: X-axis (stride=1, contiguous in memory)
  for (let iz = 0; iz < d; iz++) {
    for (let iy = 0; iy < h; iy++) {
      const offset = iz * w * h + iy * w;
      // Copy row to temp array
      for (let ix = 0; ix < w; ix++) {
        f[ix] = grid[offset + ix];
      }
      edt1d(f, w, v, z);
      // Copy back
      for (let ix = 0; ix < w; ix++) {
        grid[offset + ix] = f[ix];
      }
    }
  }

  // Pass 2: Y-axis (stride=w, non-contiguous)
  for (let iz = 0; iz < d; iz++) {
    for (let ix = 0; ix < w; ix++) {
      const base = iz * w * h + ix;
      // Copy column to temp array
      for (let iy = 0; iy < h; iy++) {
        f[iy] = grid[base + iy * w];
      }
      edt1d(f, h, v, z);
      // Copy back
      for (let iy = 0; iy < h; iy++) {
        grid[base + iy * w] = f[iy];
      }
    }
  }

  // Pass 3: Z-axis (stride=w*h)
  const wh = w * h;
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      const base = iy * w + ix;
      // Copy column to temp array
      for (let iz = 0; iz < d; iz++) {
        f[iz] = grid[base + iz * wh];
      }
      edt1d(f, d, v, z);
      // Copy back
      for (let iz = 0; iz < d; iz++) {
        grid[base + iz * wh] = f[iz];
      }
    }
  }

  // Convert squared distances to actual Euclidean distances
  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.sqrt(grid[i]);
  }
}

/**
 * Compute 3D EDT without modifying input (returns new array)
 */
export function edt3dCopy(
  grid: Float32Array,
  w: number,
  h: number,
  d: number
): Float32Array {
  const result = new Float32Array(grid);
  edt3d(result, w, h, d);
  return result;
}

// Export INF for use in surfaceGeneration
export { INF };
