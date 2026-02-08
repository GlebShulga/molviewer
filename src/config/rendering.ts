/**
 * 3D rendering configuration constants.
 * Centralizes all magic numbers for Three.js rendering.
 */

export const GEOMETRY = {
  /** Sphere geometry parameters for atoms */
  sphere: {
    radius: 1,
    widthSegments: 32,
    heightSegments: 16,
  },
  /** Cylinder geometry parameters for bonds */
  cylinder: {
    radialSegments: 8,
    heightSegments: 1,
  },
} as const;

export const CAMERA = {
  position: [0, 0, 50] as const,
  fov: 50,
  near: 0.1,
  far: 1000,
} as const;

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
