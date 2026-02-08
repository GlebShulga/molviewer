/**
 * Reusable Zustand selectors for moleculeStore
 *
 * Use these selectors with useMoleculeStore for better performance:
 * - Prevents unnecessary re-renders by using stable selector references
 * - Centralizes common access patterns
 */

import type { Structure, QualifiedAtomRef, Molecule, RepresentationType, ColorScheme } from '../types';
import type { MoleculeClassification, ComponentSettings } from '../utils/moleculeTypeClassifier';

/**
 * Data needed to render a single structure.
 * Used by selectStructureRenderData for granular subscriptions.
 */
export interface StructureRenderData {
  id: string;
  molecule: Molecule;
  representation: RepresentationType;
  colorScheme: ColorScheme;
  componentSettings: ComponentSettings[];
  classification: MoleculeClassification | null;
  offset: [number, number, number];
}

// Note: We define the state shape inline to avoid circular imports
// The actual MoleculeState interface is in moleculeStore.ts
interface MoleculeStateShape {
  structures: Map<string, Structure>;
  activeStructureId: string | null;
  selectedAtoms: QualifiedAtomRef[];
  structureOrder: string[];
}

/**
 * Select the active structure ID (primitive value, stable reference)
 */
export const selectActiveStructureId = (state: MoleculeStateShape): string | null =>
  state.activeStructureId;

// Extended state shape for selectors that need hover atom index
interface MoleculeStateShapeWithHoverIndex extends MoleculeStateShape {
  hoveredAtomIndex: number | null;
}

/**
 * Select the hovered atom index (primitive value, stable reference)
 */
export const selectHoveredAtomIndex = (state: MoleculeStateShapeWithHoverIndex): number | null =>
  state.hoveredAtomIndex;

/**
 * Select the currently active structure (or null if none)
 */
export const selectActiveStructure = (state: MoleculeStateShape): Structure | null =>
  state.activeStructureId ? state.structures.get(state.activeStructureId) ?? null : null;

/**
 * Select the molecule from the active structure (or null if none)
 */
export const selectActiveStructureMolecule = (state: MoleculeStateShape): Molecule | null =>
  selectActiveStructure(state)?.molecule ?? null;

// Memoization cache for selectSelectedAtomsForStructure
const cachedSelectedAtomsPerStructure = new Map<string, {
  inputRef: QualifiedAtomRef[];
  result: QualifiedAtomRef[];
}>();

/**
 * Factory function to create a selector for selected atoms in a specific structure.
 * Use with useMemo to create a stable selector reference.
 * Memoized per structureId to avoid creating new arrays.
 *
 * @example
 * const selector = useMemo(() => selectSelectedAtomsForStructure(structureId), [structureId]);
 * const selectedAtoms = useMoleculeStore(selector);
 */
export const selectSelectedAtomsForStructure = (structureId: string) =>
  (state: MoleculeStateShape): QualifiedAtomRef[] => {
    // Clean up stale cache entries for removed structures
    for (const cachedId of cachedSelectedAtomsPerStructure.keys()) {
      if (!state.structures.has(cachedId)) {
        cachedSelectedAtomsPerStructure.delete(cachedId);
      }
    }

    const cached = cachedSelectedAtomsPerStructure.get(structureId);
    if (cached && cached.inputRef === state.selectedAtoms) {
      return cached.result;
    }

    const result = state.selectedAtoms.filter(ref => ref.structureId === structureId);
    cachedSelectedAtomsPerStructure.set(structureId, {
      inputRef: state.selectedAtoms,
      result,
    });
    return result;
  };

/**
 * Factory function to create a selector for a structure by ID
 *
 * @example
 * const selector = useMemo(() => selectStructureById(id), [id]);
 * const structure = useMoleculeStore(selector);
 */
export const selectStructureById = (id: string) =>
  (state: MoleculeStateShape): Structure | undefined =>
    state.structures.get(id);

/**
 * Select all visible structures in order
 */
export const selectVisibleStructures = (state: MoleculeStateShape): Structure[] =>
  state.structureOrder
    .map(id => state.structures.get(id))
    .filter((s): s is Structure => s !== undefined && s.visible);

/**
 * Select the count of atoms in the active structure
 */
export const selectActiveStructureAtomCount = (state: MoleculeStateShape): number =>
  selectActiveStructure(state)?.molecule.atoms.length ?? 0;

/**
 * Check if any structure is loaded
 */
export const selectHasStructures = (state: MoleculeStateShape): boolean =>
  state.structures.size > 0;

// Memoized selected atom indices
let cachedSelectedAtomIndices: number[] = [];
let cachedSelectedAtomsRef: QualifiedAtomRef[] = [];
let cachedActiveStructureIdForSelection: string | null = null;

/**
 * Select atom indices for the active structure (replaces deprecated selectedAtomIndices getter)
 * Memoized to avoid creating new arrays on every selector call.
 */
export const selectSelectedAtomIndices = (state: MoleculeStateShape): number[] => {
  // Check if inputs changed
  if (state.selectedAtoms === cachedSelectedAtomsRef &&
      state.activeStructureId === cachedActiveStructureIdForSelection) {
    return cachedSelectedAtomIndices;
  }

  // Recompute
  cachedSelectedAtomsRef = state.selectedAtoms;
  cachedActiveStructureIdForSelection = state.activeStructureId;
  cachedSelectedAtomIndices = state.selectedAtoms
    .filter(ref => ref.structureId === state.activeStructureId)
    .map(ref => ref.atomIndex);

  return cachedSelectedAtomIndices;
};

// Extended state shape for selectors that need hover info
interface MoleculeStateShapeWithHover extends MoleculeStateShape {
  hoveredStructureId: string | null;
}

// Extended state shape for selectors that need actions
interface MoleculeStateShapeWithActions extends MoleculeStateShape {
  detectAromaticRingsIfNeeded: () => void;
}

/**
 * Select the detectAromaticRingsIfNeeded action (stable function reference)
 */
export const selectDetectAromaticRingsIfNeeded = (state: MoleculeStateShapeWithActions): (() => void) =>
  state.detectAromaticRingsIfNeeded;

/**
 * Select molecule from the hovered structure (for AtomTooltip)
 */
export const selectHoveredStructureMolecule = (state: MoleculeStateShapeWithHover): Molecule | null =>
  state.hoveredStructureId ? state.structures.get(state.hoveredStructureId)?.molecule ?? null : null;

/**
 * Factory function to check if a structure exists by ID
 */
export const selectStructureExists = (structureId: string) =>
  (state: MoleculeStateShape): boolean =>
    state.structures.has(structureId);

// Memoized structure names
let cachedStructureNames: Array<{ id: string; name: string }> = [];
let cachedNamesVersion = '';

/**
 * Select structure names for dropdown display
 * Returns array of {id, name} for each structure in order
 * Memoized to avoid creating new arrays on every selector call.
 */
export const selectStructureNamesInOrder = (state: MoleculeStateShape): Array<{ id: string; name: string }> => {
  // Version key includes both IDs and names to detect mid-load changes
  const currentVersion = state.structureOrder
    .map(id => `${id}:${state.structures.get(id)?.molecule?.name || ''}`)
    .join('|');

  if (currentVersion !== cachedNamesVersion) {
    cachedNamesVersion = currentVersion;
    cachedStructureNames = state.structureOrder.map(id => {
      const struct = state.structures.get(id);
      return { id, name: struct?.molecule?.name || id };
    });
  }

  return cachedStructureNames;
};

/**
 * Total atom count for all visible structures.
 * Returns a primitive (number) so reference stability is guaranteed.
 */
export const selectTotalVisibleAtomCount = (state: MoleculeStateShape): number => {
  let count = 0;
  for (const id of state.structureOrder) {
    const structure = state.structures.get(id);
    if (structure?.visible) {
      count += structure.molecule.atoms.length;
    }
  }
  return count;
};

/**
 * Bounding box computation helper (not a selector - used internally)
 */
function computeBoundingBox(state: MoleculeStateShape): {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  centerX: number; centerY: number; centerZ: number;
} | null {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let hasAtoms = false;

  for (const id of state.structureOrder) {
    const structure = state.structures.get(id);
    if (!structure?.visible) continue;
    const offset = structure.offset;
    for (const atom of structure.molecule.atoms) {
      hasAtoms = true;
      const x = atom.x + offset[0];
      const y = atom.y + offset[1];
      const z = atom.z + offset[2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }

  if (!hasAtoms) return null;
  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

// Memoized bounding box - only recompute when structures or visibility changes
let cachedBoundingBox: ReturnType<typeof computeBoundingBox> = null;
let cachedBboxVersion = '';

/**
 * Bounding box for all visible structures.
 * Memoized to avoid creating new objects on every selector call.
 */
export const selectVisibleStructuresBoundingBox = (state: MoleculeStateShape): ReturnType<typeof computeBoundingBox> => {
  // Version key includes visibility, atom count, and offset (all affect bbox)
  const currentVersion = state.structureOrder
    .map(id => {
      const s = state.structures.get(id);
      return s ? `${id}:${s.visible}:${s.molecule?.atoms.length ?? 0}:${s.offset.join(',')}` : '';
    })
    .join('|');

  if (currentVersion !== cachedBboxVersion) {
    cachedBboxVersion = currentVersion;
    cachedBoundingBox = computeBoundingBox(state);
  }

  return cachedBoundingBox;
};

// ===== Performance-optimized selectors for granular subscriptions =====

// Module-level cache for stable array reference
let cachedVisibleStructureIds: string[] = [];
let cachedVisibleVersion = '';

/**
 * Select IDs of visible structures in order.
 * Returns a stable array reference when visibility state hasn't changed.
 * Use this instead of subscribing to the entire structures Map.
 */
export const selectVisibleStructureIds = (state: MoleculeStateShape): string[] => {
  // Create version key from order + visibility states only
  const currentVersion = state.structureOrder
    .map(id => {
      const s = state.structures.get(id);
      return s ? `${id}:${s.visible}` : '';
    })
    .join('|');

  if (currentVersion === cachedVisibleVersion) {
    return cachedVisibleStructureIds; // Return same array reference
  }

  cachedVisibleVersion = currentVersion;
  cachedVisibleStructureIds = state.structureOrder.filter(id => {
    const s = state.structures.get(id);
    return s?.visible === true;
  });

  return cachedVisibleStructureIds;
};

/**
 * Reset all module-level selector caches.
 * Call this when the store is reset to prevent stale data.
 */
export function clearSelectorCaches(): void {
  cachedSelectedAtomIndices = [];
  cachedSelectedAtomsRef = [];
  cachedActiveStructureIdForSelection = null;
  cachedBoundingBox = null;
  cachedBboxVersion = '';
  cachedVisibleStructureIds = [];
  cachedVisibleVersion = '';
  cachedStructureNames = [];
  cachedNamesVersion = '';
  structureRenderDataCache.clear();
  cachedSelectedAtomsPerStructure.clear();
}

// Per-structure cache for render data
const structureRenderDataCache = new Map<string, {
  version: string;
  data: StructureRenderData | null;
}>();

/**
 * Factory function to create a selector for a structure's render data.
 * Returns stable object reference when render-relevant properties haven't changed.
 *
 * @example
 * const selector = useMemo(() => selectStructureRenderData(structureId), [structureId]);
 * const structureData = useMoleculeStore(selector);
 */
export const selectStructureRenderData = (structureId: string) =>
  (state: MoleculeStateShape): StructureRenderData | null => {
    const structure = state.structures.get(structureId);
    if (!structure || !structure.visible) {
      // Clean cache entry if structure hidden/removed
      structureRenderDataCache.delete(structureId);
      return null;
    }

    // Version key includes only render-relevant properties
    // Note: molecule is excluded because it's immutable after parsing.
    // If molecule re-parsing is ever supported, add molecule reference to version key.
    const version = [
      structure.representation,
      structure.colorScheme,
      structure.offset.join(','),
      structure.componentSettings
        .map(c => `${c.type}:${c.visible}:${c.representation}:${c.colorScheme}`)
        .join('|'),
    ].join(':');

    const cached = structureRenderDataCache.get(structureId);
    if (cached && cached.version === version) {
      return cached.data;
    }

    const data: StructureRenderData = {
      id: structure.id,
      molecule: structure.molecule,
      representation: structure.representation,
      colorScheme: structure.colorScheme,
      componentSettings: structure.componentSettings,
      classification: structure.classification,
      offset: structure.offset,
    };

    structureRenderDataCache.set(structureId, { version, data });
    return data;
  };
