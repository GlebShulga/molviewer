import type { SecondaryStructureColors } from '../types';

/**
 * Standard secondary structure colors for 3D rendering
 * Used in Cartoon representation and structure-based coloring
 */
export const SECONDARY_STRUCTURE_COLORS: SecondaryStructureColors = {
  helix: '#ff00ff',  // Magenta
  sheet: '#ffff00',  // Yellow
  coil: '#ffffff',   // White
};

/**
 * UI-optimized secondary structure colors for sequence viewers
 * These provide better contrast against UI backgrounds
 */
export const SECONDARY_STRUCTURE_UI_COLORS = {
  dark: {
    helix: '#ff69b4',  // Hot pink - softer for UI
    sheet: '#ffd700',  // Gold
    coil: '#808080',   // Gray
  } as SecondaryStructureColors,
  light: {
    helix: '#db2777',  // Pink-600
    sheet: '#ca8a04',  // Yellow-600
    coil: '#6b7280',   // Gray-500
  } as SecondaryStructureColors,
} as const;
