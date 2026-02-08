/**
 * 3D rendering colors (background, bonds, lighting)
 */

export const LIGHTING_COLORS = {
  hemisphere: {
    skyColor: '#ffffff',
    groundColor: '#444444',
  },
  keyLight: '#ffffff',
  fillLight: '#b0c4de',  // Soft blue
  rimLight: '#ffd700',   // Warm gold
} as const;

export const SSAO_COLOR = '#000000';

export const AROMATIC_COLOR = '#CCCCCC';

/**
 * Scene colors with theme variants
 */
export const SCENE_COLORS = {
  dark: {
    background: '#1a1a2e',
    defaultBond: '#CCCCCC',
  },
  light: {
    background: '#f0f0f0',
    defaultBond: '#666666',
  },
} as const;

/**
 * Default scene colors (dark theme)
 */
export const DEFAULT_SCENE_COLORS = SCENE_COLORS.dark;
