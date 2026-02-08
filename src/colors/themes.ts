import type { Theme } from '../context/ThemeContext';
import type { SecondaryStructureColors, MeasurementColors } from './types';
import { SECONDARY_STRUCTURE_COLORS, SECONDARY_STRUCTURE_UI_COLORS } from './domains/structure';
import { MEASUREMENT_COLORS } from './domains/measurements';
import { SURFACE_COLORS } from './domains/surface';
import { SCENE_COLORS } from './domains/rendering';

/**
 * Complete molecular color palette for a specific theme
 */
export interface MolecularColorPalette {
  /** Secondary structure colors for 3D rendering */
  secondaryStructure: SecondaryStructureColors;
  /** Secondary structure colors optimized for UI */
  secondaryStructureUI: SecondaryStructureColors;
  /** Measurement annotation colors */
  measurements: MeasurementColors;
  /** Default surface color */
  surface: string;
  /** Scene background color */
  background: string;
  /** Default bond color */
  defaultBond: string;
}

/**
 * Pre-computed molecular color palettes for each theme
 */
export const MOLECULAR_PALETTES: Record<Theme, MolecularColorPalette> = {
  dark: {
    secondaryStructure: SECONDARY_STRUCTURE_COLORS,
    secondaryStructureUI: SECONDARY_STRUCTURE_UI_COLORS.dark,
    measurements: MEASUREMENT_COLORS.dark,
    surface: SURFACE_COLORS.dark,
    background: SCENE_COLORS.dark.background,
    defaultBond: SCENE_COLORS.dark.defaultBond,
  },
  light: {
    secondaryStructure: SECONDARY_STRUCTURE_COLORS,
    secondaryStructureUI: SECONDARY_STRUCTURE_UI_COLORS.light,
    measurements: MEASUREMENT_COLORS.light,
    surface: SURFACE_COLORS.light,
    background: SCENE_COLORS.light.background,
    defaultBond: SCENE_COLORS.light.defaultBond,
  },
};

/**
 * Get molecular color palette for a specific theme
 */
export function getMolecularColors(theme: Theme): MolecularColorPalette {
  return MOLECULAR_PALETTES[theme];
}
