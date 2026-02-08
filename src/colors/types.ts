import type { Theme } from '../context/ThemeContext';

/**
 * Theme-aware color value - different colors for light and dark themes
 */
export interface ThemeColor {
  light: string;
  dark: string;
}

/**
 * Secondary structure color scheme
 */
export interface SecondaryStructureColors {
  helix: string;
  sheet: string;
  coil: string;
}

/**
 * Measurement colors for distance/angle/dihedral annotations
 */
export interface MeasurementColors {
  distance: string;
  angle: string;
  dihedral: string;
  outline: string;
}

/**
 * Gradient definition for continuous coloring (B-factor, rainbow, etc.)
 */
export interface GradientDefinition {
  stops: Array<{ position: number; color: string }>;
  /** Generate color for normalized value 0-1 */
  getColor: (t: number) => string;
}

/**
 * Resolve a theme-aware color to its concrete value
 */
export function resolveColor(color: ThemeColor | string, theme: Theme): string {
  if (typeof color === 'string') return color;
  return theme === 'dark' ? color.dark : color.light;
}
