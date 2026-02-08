import type { GradientDefinition } from '../types';

/**
 * B-factor gradient: Blue (low) -> White (mid) -> Red (high)
 */
export const BFACTOR_GRADIENT: GradientDefinition = {
  stops: [
    { position: 0, color: '#0000ff' },
    { position: 0.5, color: '#ffffff' },
    { position: 1, color: '#ff0000' },
  ],
  getColor: (t: number): string => {
    let r: number, g: number, b: number;
    if (t < 0.5) {
      const s = t * 2;
      r = Math.round(s * 255);
      g = Math.round(s * 255);
      b = 255;
    } else {
      const s = (t - 0.5) * 2;
      r = 255;
      g = Math.round((1 - s) * 255);
      b = Math.round((1 - s) * 255);
    }
    return `rgb(${r}, ${g}, ${b})`;
  },
};

/**
 * Rainbow gradient for sequence position coloring
 * Blue (N-terminus, 0) -> Red (C-terminus, 1)
 */
export const RAINBOW_GRADIENT: GradientDefinition = {
  stops: [
    { position: 0, color: 'hsl(240, 100%, 50%)' },    // Blue
    { position: 0.25, color: 'hsl(180, 100%, 50%)' }, // Cyan
    { position: 0.5, color: 'hsl(120, 100%, 50%)' },  // Green
    { position: 0.75, color: 'hsl(60, 100%, 50%)' },  // Yellow
    { position: 1, color: 'hsl(0, 100%, 50%)' },      // Red
  ],
  getColor: (t: number): string => {
    const hue = 240 * (1 - t);
    return `hsl(${hue}, 100%, 50%)`;
  },
};

/**
 * Rainbow color endpoints for reference
 */
export const RAINBOW_ENDPOINTS = {
  nTerminus: 'hsl(240, 100%, 50%)',  // Blue
  cTerminus: '#ff0000',               // Red
} as const;
