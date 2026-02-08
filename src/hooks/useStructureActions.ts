import { useMemo } from 'react';
import { useMoleculeStore } from '../store/moleculeStore';
import type { RepresentationType, ColorScheme } from '../types';

/**
 * Hook to get memoized action creators for a specific structure.
 * Provides a stable reference to actions that operate on a single structure.
 *
 * @param structureId - The ID of the structure to create actions for
 * @returns Object with bound action methods
 *
 * @example
 * const { setRepresentation, setColorScheme, setVisibility } = useStructureActions(structureId);
 * setRepresentation('cartoon');
 * setColorScheme('chain');
 * setVisibility(false);
 */
export function useStructureActions(structureId: string) {
  const setStructureRepresentation = useMoleculeStore(s => s.setStructureRepresentation);
  const setStructureColorScheme = useMoleculeStore(s => s.setStructureColorScheme);
  const setStructureVisibility = useMoleculeStore(s => s.setStructureVisibility);

  return useMemo(() => ({
    setRepresentation: (rep: RepresentationType) => setStructureRepresentation(structureId, rep),
    setColorScheme: (scheme: ColorScheme) => setStructureColorScheme(structureId, scheme),
    setVisibility: (visible: boolean) => setStructureVisibility(structureId, visible),
  }), [structureId, setStructureRepresentation, setStructureColorScheme, setStructureVisibility]);
}
