import * as THREE from 'three';
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
  // THREE.Color converts CSS colours (sRGB) to the linear values three.js
  // expects in a colour attribute, like the materials of the other styles
  const color = new THREE.Color();
  for (let i = 0; i < nearestAtomIndices.length; i++) {
    const nearest = nearestAtomIndices[i];
    const atom = molecule.atoms[subset.map ? subset.map[nearest] : nearest];
    color.set(getAtomColor(atom, colorScheme, colorContext));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  return colors;
}
