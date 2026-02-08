import type { MeasurementColors } from '../types';

/**
 * Measurement colors with theme variants
 */
export const MEASUREMENT_COLORS = {
  dark: {
    distance: '#ffff00',  // Yellow
    angle: '#00ffff',     // Cyan
    dihedral: '#ff00ff',  // Magenta
    outline: '#000000',
  } as MeasurementColors,
  light: {
    distance: '#b45309',  // Amber-700
    angle: '#0891b2',     // Cyan-600
    dihedral: '#9333ea',  // Purple-600
    outline: '#ffffff',
  } as MeasurementColors,
} as const;

/**
 * Default measurement colors (dark theme)
 */
export const DEFAULT_MEASUREMENT_COLORS: MeasurementColors = MEASUREMENT_COLORS.dark;

/**
 * Selection indicator color for atoms
 */
export const SELECTION_INDICATOR_COLOR = '#ffffff';
