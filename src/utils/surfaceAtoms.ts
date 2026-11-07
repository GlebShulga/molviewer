import type { Atom, Molecule } from '../types';
import type { ColorScheme } from '../store/moleculeStore';
import type { ComponentSettings } from './moleculeTypeClassifier';
import { getAtomColor, type ColorSchemeContext } from './atomColor';

/** Atoms a molecular surface is computed from. */
export interface SurfaceAtomSubset {
  atoms: Atom[];
  /** Index in the molecule of each subset atom; null when the subset is the whole molecule. */
  map: number[] | null;
  /** Cache key part: which atoms these are ('all', or the visible component types). */
  key: string;
}

/** Water and ions get no surface: the surface describes the molecule, not its solvent. */
const SURFACE_EXCLUDED = new Set<ComponentSettings['type']>(['water', 'ion']);

/**
 * The surface's atoms: those of visible components other than water and
 * ions. A file with nothing else (water or ions only) is surfaced whole;
 * when the user hides every component, the surface is empty. Without
 * component settings, the whole molecule.
 */
export function surfaceAtoms(molecule: Molecule, componentSettings?: ComponentSettings[]): SurfaceAtomSubset {
  const whole: SurfaceAtomSubset = { atoms: molecule.atoms, map: null, key: 'all' };
  if (!componentSettings?.length) return whole;
  const eligible = componentSettings.filter((c) => !SURFACE_EXCLUDED.has(c.type) && c.atomIndices.length > 0);
  if (eligible.length === 0) return whole;

  const visible = eligible.filter((c) => c.visible);
  const map = visible.flatMap((c) => c.atomIndices).sort((a, b) => a - b);
  return {
    atoms: map.map((i) => molecule.atoms[i]),
    map,
    key: visible.map((c) => c.type).sort().join('+') || 'none',
  };
}

/**
 * Per-vertex colours of a surface: each vertex takes the colour of its
 * nearest atom (an index into the subset), looked up in the whole molecule
 * so colour ranges (B-factor, rainbow) match the other representations.
 */
export function surfaceVertexColors(
  nearestAtomIndices: Int32Array,
  subset: SurfaceAtomSubset,
  molecule: Molecule,
  colorScheme: ColorScheme,
  colorContext: ColorSchemeContext | undefined
): Float32Array {
  const colors = new Float32Array(nearestAtomIndices.length * 3);
  for (let i = 0; i < nearestAtomIndices.length; i++) {
    const nearest = nearestAtomIndices[i];
    const atom = molecule.atoms[subset.map ? subset.map[nearest] : nearest];
    const [r, g, b] = parseColor(getAtomColor(atom, colorScheme, colorContext));
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

/**
 * Parse a CSS color string to RGB values (0-1 range)
 */
function parseColor(colorStr: string): [number, number, number] {
  // Handle hex colors
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b];
  }

  // Handle rgb() colors
  if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/\d+/g);
    if (match && match.length >= 3) {
      return [
        parseInt(match[0]) / 255,
        parseInt(match[1]) / 255,
        parseInt(match[2]) / 255,
      ];
    }
  }

  // Handle hsl() colors
  if (colorStr.startsWith('hsl')) {
    const match = colorStr.match(/[\d.]+/g);
    if (match && match.length >= 3) {
      const h = parseFloat(match[0]) / 360;
      const s = parseFloat(match[1]) / 100;
      const l = parseFloat(match[2]) / 100;
      // HSL to RGB conversion
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return [
        hue2rgb(p, q, h + 1/3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1/3),
      ];
    }
  }

  // Default fallback
  return [0.5, 0.5, 0.5];
}
