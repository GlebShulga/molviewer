import { useMemo } from 'react';
import type { Molecule } from '../types';
import { useMoleculeStore } from '../store/moleculeStore';
import { selectActiveStructureId } from '../store/selectors';
import { useSelectedAtomsForStructure } from './useSelectedAtomsForStructure';
import { calculateColorSchemeContext, type ColorSchemeContext } from '../utils';

/**
 * Shared setup logic for representation components (BallAndStick, Stick, Spacefill).
 *
 * Extracts common patterns:
 * - Resolving effective structure ID
 * - Getting selected atom indices for the structure
 * - Calculating color scheme context
 *
 * Note: Representation-specific logic (e.g., aromatic ring detection) should
 * remain in the individual components.
 *
 * @param molecule - The molecule to render
 * @param structureId - Optional structure ID (falls back to activeStructureId)
 * @returns Setup data for rendering
 *
 * @example
 * const { effectiveStructureId, selectedAtomIndices, colorContext } =
 *   useRepresentationSetup(molecule, structureId);
 */
export interface RepresentationSetup {
  /** The resolved structure ID (provided or active) */
  effectiveStructureId: string;
  /** Indices of selected atoms in this structure */
  selectedAtomIndices: number[];
  /** Color scheme context for bfactor/rainbow coloring */
  colorContext: ColorSchemeContext;
}

export function useRepresentationSetup(
  molecule: Molecule,
  structureId?: string
): RepresentationSetup {
  // Get active structure ID from store (use selector for stable reference)
  const activeStructureId = useMoleculeStore(selectActiveStructureId);

  // Determine effective structure ID
  const effectiveStructureId = structureId || activeStructureId || '';

  // Get selected atoms for this structure
  const selectedAtomRefs = useSelectedAtomsForStructure(effectiveStructureId);

  // Derive selected atom indices
  const selectedAtomIndices = useMemo(
    () => selectedAtomRefs.map(ref => ref.atomIndex),
    [selectedAtomRefs]
  );

  // Calculate color scheme context for bfactor/rainbow coloring
  const colorContext = useMemo(
    () => calculateColorSchemeContext(molecule),
    [molecule]
  );

  return {
    effectiveStructureId,
    selectedAtomIndices,
    colorContext,
  };
}
