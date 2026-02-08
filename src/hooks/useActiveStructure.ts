import { useMoleculeStore } from '../store/moleculeStore';
import { selectActiveStructure } from '../store/selectors';

/**
 * Hook to access the currently active structure.
 * Returns the full Structure object or null if no structure is active.
 *
 * @example
 * const structure = useActiveStructure();
 * if (structure) {
 *   console.log(structure.molecule.name, structure.representation);
 * }
 */
export function useActiveStructure() {
  return useMoleculeStore(selectActiveStructure);
}
