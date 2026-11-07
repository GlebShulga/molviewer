/**
 * 3D rendering configuration constants.
 * Centralizes all magic numbers for Three.js rendering.
 */

export const CAMERA = {
  position: [0, 0, 50] as const,
  fov: 50,
  near: 0.1,
  far: 1000,
} as const;

/**
 * Upper bound for the main canvas pixel ratio. Touch devices (often 3x
 * screens) render at 1.5x: much less GPU work for a small loss of sharpness.
 * PNG export sets its own pixel ratio, so exports are unaffected.
 */
export const MAX_DPR =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 2;

export const LIGHTING = {
  ambient: {
    intensity: 0.4, // Reduced for better SSAO contrast
  },
  hemisphere: {
    skyColor: '#ffffff',
    groundColor: '#444444',
    intensity: 0.6,
  },
  keyLight: {
    position: [5, 5, 5] as const,
    intensity: 0.8,
    color: '#ffffff',
  },
  fillLight: {
    position: [-5, 2, 3] as const,
    intensity: 0.4,
    color: '#b0c4de', // Soft blue fill
  },
  rimLight: {
    position: [0, -5, -5] as const,
    intensity: 0.3,
    color: '#ffd700', // Warm rim
  },
  // Legacy support
  directional: {
    intensity: 0.8,
    position: [10, 10, 10] as const,
    backIntensityMultiplier: 0.5,
  },
} as const;

export const SSAO = {
  aoRadius: 0.5,
  intensity: 2.0,
  distanceFalloff: 0.4,
  color: '#000000',
} as const;

export const AROMATIC = {
  planeOffset: 0.15,
  radiusScale: 0.65,
  dashCount: 16,
  color: '#CCCCCC', // Match bond color
  lineWidth: 2,
  opacity: 0.8,
} as const;

export const COLORS = {
  background: '#1a1a2e',
  defaultBond: '#CCCCCC',
} as const;

export const THEME_COLORS = {
  dark: {
    background: '#1a1a2e',
    defaultBond: '#CCCCCC',
    measurement: {
      distance: '#ffff00',
      angle: '#00ffff',
      dihedral: '#ff00ff',
      outline: '#000000',
    },
  },
  light: {
    background: '#f0f0f0',
    defaultBond: '#666666',
    measurement: {
      distance: '#b45309',
      angle: '#0891b2',
      dihedral: '#9333ea',
      outline: '#ffffff',
    },
  },
} as const;

export const SCALES = {
  /** Default atom scale for ball-and-stick representation */
  atom: 0.3,
  /** Default bond radius for ball-and-stick */
  bondRadius: 0.1,
  /** Default bond radius for stick representation */
  stickRadius: 0.15,
  /** Default scale for spacefill representation */
  spacefill: 1.0,
} as const;

/**
 * Sphere impostors (ImpostorAtoms, its GPU picking shader, LODAtoms,
 * InstancedAssembly) draw each atom on a 1x1 plane. The vertex shader scales
 * the plane by this times the radius, and the fragment shader scales the UV
 * offset by the same, so `coord` is the offset in radii and the disc it keeps
 * (|coord| <= 1) is the atom's full radius. With 2.0 the billboard is the
 * sphere's bounding square. A GLSL float literal: GLSL ES has no implicit
 * int-to-float conversion, so `2` would not compile.
 */
export const IMPOSTOR_BILLBOARD_SCALE = '2.0';

export const ORBIT_CONTROLS = {
  enableDamping: true,
  dampingFactor: 0.05,
} as const;

/**
 * Adaptive quality settings based on molecule size.
 * Automatically adjusts rendering quality for performance.
 */
export const PERFORMANCE_THRESHOLDS = {
  /** Below this: full quality, individual meshes */
  small: 500,
  /** Below this: reduced quality, individual meshes */
  medium: 2000,
  /** Below this: minimal quality, optional impostors */
  large: 5000,
  /** Above this: impostors required, no post-processing */
  veryLarge: 5000,
} as const;

/**
 * Atoms in one impostor instance (ImpostorAtoms) from which picking runs on
 * the GPU. Below it the raycast tests every atom's sphere on the CPU
 * (Spacefill's impostors from 2000 atoms); from it, one GPU pick per pointer
 * event replaces that O(n) loop. A structure split into components draws each
 * one as its own instance, so the count is the component's.
 *
 * Open question (parked 2026-11-05): whether picking on structures this large
 * is used at all (hover, click to measure, the atom menu in Spacefill, Ball &
 * Stick or Stick). `scripts/query-events.ts --styles` counts measurements,
 * labels and atom menus picked on the GPU by structure size; decide from it
 * whether to keep the GPU path or to replace it with the CPU loop for every
 * size (likely a few ms per event even at 100k atoms, not measured). Hover
 * isn't counted: it fires on every mouse move.
 */
export const GPU_PICKING_THRESHOLD = 5000;

/**
 * Skip aromatic ring detection for molecules larger than this threshold.
 * Detection is O(n × depth!) and causes blocking on the main thread.
 * Aligned with PERFORMANCE_THRESHOLDS.medium where quality reduction begins.
 */
export const AROMATIC_DETECTION_THRESHOLD = 2000;

/**
 * Quality presets for different molecule sizes.
 */
export const QUALITY_PRESETS = {
  /** < 500 atoms: Full quality */
  full: {
    sphereSegments: { width: 32, height: 16 },
    useImpostors: false,
    postProcessing: { ao: true, smaa: true },
    aoQuality: 'medium' as const,
  },
  /** 500-2000 atoms: Reduced quality */
  reduced: {
    sphereSegments: { width: 24, height: 12 },
    useImpostors: false,
    postProcessing: { ao: true, smaa: true },
    aoQuality: 'low' as const,
  },
  /** 2000-5000 atoms: Minimal quality */
  minimal: {
    sphereSegments: { width: 16, height: 8 },
    useImpostors: false,
    postProcessing: { ao: false, smaa: true },
    aoQuality: 'low' as const,
  },
  /** > 5000 atoms: Impostor mode */
  impostor: {
    sphereSegments: { width: 8, height: 4 }, // Fallback only
    useImpostors: true,
    postProcessing: { ao: false, smaa: false },
    aoQuality: 'low' as const,
  },
} as const;

/**
 * Get the appropriate quality preset for a given atom count.
 */
export function getQualityPreset(
  atomCount: number
): (typeof QUALITY_PRESETS)[keyof typeof QUALITY_PRESETS] {
  if (atomCount < PERFORMANCE_THRESHOLDS.small) {
    return QUALITY_PRESETS.full;
  } else if (atomCount < PERFORMANCE_THRESHOLDS.medium) {
    return QUALITY_PRESETS.reduced;
  } else if (atomCount < PERFORMANCE_THRESHOLDS.large) {
    return QUALITY_PRESETS.minimal;
  } else {
    return QUALITY_PRESETS.impostor;
  }
}
