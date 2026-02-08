import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../store/moleculeStore';
import { selectSelectedAtomsForStructure } from '../store/selectors';

/**
 * Hook to access selected atoms for a specific structure.
 * Returns an array of QualifiedAtomRef for the given structure.
 *
 * This hook creates a memoized selector to prevent unnecessary re-renders
 * when atoms in other structures are selected.
 *
 * @param structureId - The ID of the structure to get selected atoms for
 * @returns Array of QualifiedAtomRef for the structure
 *
 * @example
 * const selectedAtoms = useSelectedAtomsForStructure(structureId);
 * const selectedIndices = selectedAtoms.map(ref => ref.atomIndex);
 */
export function useSelectedAtomsForStructure(structureId: string) {
  // Create memoized selector for this structureId
  const baseSelector = useMemo(
    () => selectSelectedAtomsForStructure(structureId),
    [structureId]
  );

  // Wrap with useShallow to enable shallow equality comparison
  // This prevents infinite loops when the selector returns a new array reference
  // with identical contents (e.g., after filtering)
  return useMoleculeStore(useShallow(baseSelector));
}
