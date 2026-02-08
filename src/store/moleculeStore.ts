import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Molecule, Atom } from '../types';
import {
  type RepresentationType,
  type ColorScheme,
  type MeasurementMode,
  type LayoutMode,
  type QualifiedAtomRef,
  type Structure,
  type ContextMenuState,
  type Label3D,
  MAX_STRUCTURES,
} from '../types';

/** Maximum number of undo/redo history states to prevent memory issues */
const UNDO_HISTORY_LIMIT = 50;
import { createMeasurementFromAtomRefs, type Measurement, type MeasurementType } from '../utils/measurements';
import { detectAromaticRings } from '../utils';
import { hasBackboneData } from '../utils/backboneExtraction';
import { AROMATIC_DETECTION_THRESHOLD } from '../config';
import { SMART_DEFAULTS, CARTOON_FALLBACK_REPRESENTATION } from '../config/smartDefaults';
import { DEFAULT_SURFACE_COLOR } from '../colors';
import {
  saveMolecule,
  updateMolecule,
  loadMolecule,
  getSavedMolecules,
  deleteMolecule,
  clearAllMolecules,
  renameMolecule,
  type SavedMoleculeEntry,
} from '../utils/moleculeStorage';

// Forward declaration for TemporalState type used in serializeForComparison
interface TemporalState {
  structures: Map<string, Structure>;
  structureOrder: string[];
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SurfaceSettings;
}

/**
 * Serialize a TemporalState for comparison.
 * Handles Map objects by converting them to sorted arrays.
 * Excludes certain properties from comparison:
 * - 'molecule': Large object that doesn't change for representation/colorScheme/visibility operations
 * - 'aromaticRingsDetected': Computed lazily and mutates the structure in place
 */
function serializeForComparison(state: TemporalState): string {
  return JSON.stringify(state, (key, value) => {
    // Exclude properties that shouldn't affect equality comparison
    if (key === 'molecule' || key === 'aromaticRingsDetected') {
      return undefined;
    }

    // Convert Map to a consistent format
    if (value instanceof Map) {
      return {
        __type: 'Map',
        entries: Array.from(value.entries()).sort((a, b) =>
          String(a[0]).localeCompare(String(b[0]))
        ),
      };
    }
    return value;
  });
}

import {
  classifyMolecule,
  type MoleculeClassification,
  type ComponentSettings,
} from '../utils/moleculeTypeClassifier';

// Re-export types for backward compatibility
export type {
  RepresentationType,
  ColorScheme,
  MeasurementMode,
  LayoutMode,
  QualifiedAtomRef,
  Structure,
  ContextMenuState,
  Label3D,
};
export { MAX_STRUCTURES };

// State that should be tracked for undo/redo
interface TemporalState {
  structures: Map<string, Structure>;
  structureOrder: string[];
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SurfaceSettings;
}

interface SurfaceSettings {
  type: 'vdw' | 'sas';
  opacity: number;
  probeRadius: number;
  wireframe: boolean;
  visible: boolean;
  color: string;
}

interface MoleculeState {
  // Multi-structure state
  structures: Map<string, Structure>;
  structureOrder: string[];
  activeStructureId: string | null;
  layoutMode: LayoutMode;

  // Hover state
  hoveredAtom: Atom | null;
  hoveredAtomIndex: number | null;
  hoveredStructureId: string | null;
  hoverPosition: { x: number; y: number } | null;

  // Loading and error handling
  isLoading: boolean;
  error: string | null;

  // Selection state (now with structure context)
  selectedAtoms: QualifiedAtomRef[];

  // Measurement state
  measurementMode: MeasurementMode;
  measurements: Measurement[];
  highlightedMeasurementId: string | null;

  // Surface settings (global for now)
  surfaceSettings: SurfaceSettings;

  // Auto-rotate
  autoRotate: boolean;

  // Saved molecules
  savedMolecules: SavedMoleculeEntry[];
  loadedMoleculeId: string | null;

  // Context menu state
  contextMenu: ContextMenuState;

  // 3D Labels (with structure context)
  labels: Label3D[];

  // Viewer state (transient - not tracked for undo/redo)
  controlsReady: boolean;

  // ===== Structure management actions =====
  addStructure: (molecule: Molecule, name?: string) => string;
  removeStructure: (id: string) => void;
  setActiveStructure: (id: string | null) => void;
  setStructureVisibility: (id: string, visible: boolean) => void;
  setStructureRepresentation: (id: string, rep: RepresentationType) => void;
  setStructureColorScheme: (id: string, scheme: ColorScheme) => void;
  setStructureComponentSettings: (id: string, settings: ComponentSettings[]) => void;
  updateStructureComponentSetting: (
    structureId: string,
    componentType: string,
    updates: Partial<ComponentSettings>
  ) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  reorderStructures: (newOrder: string[]) => void;

  // ===== Legacy actions (operate on active structure) =====
  /** @deprecated Use addStructure instead. Clears all and adds single structure. */
  setMolecule: (molecule: Molecule | null) => void;
  /** @deprecated Use setStructureRepresentation instead */
  setRepresentation: (rep: RepresentationType) => void;
  /** @deprecated Use setStructureColorScheme instead */
  setColorScheme: (scheme: ColorScheme) => void;

  // Hover actions
  setHoveredAtom: (
    atom: Atom | null,
    atomIndex: number | null,
    structureId: string | null,
    position: { x: number; y: number } | null
  ) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selection actions
  selectAtom: (structureId: string, atomIndex: number) => void;
  selectAtomsByFilter: (
    structureId: string,
    predicate: (atom: Atom, index: number) => boolean
  ) => void;
  undoLastSelection: () => void;
  clearSelection: () => void;

  // Measurement actions
  setMeasurementMode: (mode: MeasurementMode) => void;
  addMeasurement: (measurement: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  setHighlightedMeasurement: (id: string | null) => void;

  // Surface actions
  setSurfaceSettings: (settings: Partial<SurfaceSettings>) => void;

  // Auto-rotate
  setAutoRotate: (enabled: boolean) => void;

  // Saved molecules actions
  loadSavedMoleculesIndex: () => void;
  saveMoleculeToStorage: (name?: string) => void;
  updateSavedMolecule: () => void;
  loadSavedMolecule: (id: string) => void;
  deleteSavedMolecule: (id: string) => void;
  renameSavedMolecule: (id: string, newName: string) => void;
  clearAllSavedMolecules: () => void;

  // Lazy aromatic ring detection (for active structure)
  detectAromaticRingsIfNeeded: (structureId?: string) => void;

  // Context menu actions
  showContextMenu: (state: Omit<ContextMenuState, 'visible'>) => void;
  hideContextMenu: () => void;

  // Label actions
  addLabel: (structureId: string, atomIndex: number, text: string) => void;
  removeLabel: (id: string) => void;
  clearLabels: () => void;

  // Utility
  getStructure: (id: string) => Structure | undefined;
  getAtomFromRef: (ref: QualifiedAtomRef) => Atom | undefined;

  // Viewer state actions
  setControlsReady: (ready: boolean) => void;

  reset: () => void;
}

const initialSurfaceSettings: SurfaceSettings = {
  type: 'vdw',
  opacity: 0.7,
  probeRadius: 1.4,
  wireframe: false,
  visible: false,
  color: DEFAULT_SURFACE_COLOR,
};

const initialState = {
  // Multi-structure state
  structures: new Map<string, Structure>(),
  structureOrder: [] as string[],
  activeStructureId: null as string | null,
  layoutMode: 'overlay' as LayoutMode,

  // Hover state
  hoveredAtom: null as Atom | null,
  hoveredAtomIndex: null as number | null,
  hoveredStructureId: null as string | null,
  hoverPosition: null as { x: number; y: number } | null,

  // Loading/error
  isLoading: false,
  error: null as string | null,

  // Selection state
  selectedAtoms: [] as QualifiedAtomRef[],

  // Measurement state
  measurementMode: 'none' as MeasurementMode,
  measurements: [] as Measurement[],
  highlightedMeasurementId: null as string | null,

  // Surface settings
  surfaceSettings: initialSurfaceSettings,

  // Auto-rotate
  autoRotate: false,

  // Saved molecules
  savedMolecules: [] as SavedMoleculeEntry[],
  loadedMoleculeId: null as string | null,

  // Context menu
  contextMenu: {
    visible: false,
    x: 0,
    y: 0,
    atomIndex: null,
  } as ContextMenuState,

  // Labels
  labels: [] as Label3D[],

  // Viewer state
  controlsReady: false,
};

/**
 * Generate a unique structure ID
 */
function generateStructureId(): string {
  return `struct-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculate offset for side-by-side layout based on structure index
 */
function calculateStructureOffset(index: number, totalCount: number): [number, number, number] {
  if (totalCount <= 1) return [0, 0, 0];
  // Spread structures along X axis
  const spacing = 50; // Angstroms between structures
  const totalWidth = (totalCount - 1) * spacing;
  const x = index * spacing - totalWidth / 2;
  return [x, 0, 0];
}

/**
 * Generate component settings from classification using smart defaults
 */
function generateComponentSettings(
  classification: MoleculeClassification,
  molecule: Molecule
): ComponentSettings[] {
  const settings: ComponentSettings[] = [];
  const hasBB = hasBackboneData(molecule);

  for (const component of classification.components) {
    const defaults = SMART_DEFAULTS[component.type];

    // For protein, check if Cartoon is available (needs backbone data)
    let representation = defaults.representation;
    if (component.type === 'protein' && representation === 'cartoon' && !hasBB) {
      representation = CARTOON_FALLBACK_REPRESENTATION;
    }

    settings.push({
      type: component.type,
      atomIndices: component.atomIndices,
      residueFilter: component.residueFilter,
      representation,
      colorScheme: defaults.colorScheme,
      visible: defaults.visible,
    });
  }

  return settings;
}

/**
 * Create a new Structure from a Molecule
 */
function createStructure(
  molecule: Molecule,
  name: string,
  index: number,
  totalCount: number,
  layoutMode: LayoutMode
): Structure {
  const classification = classifyMolecule(molecule);
  const componentSettings = generateComponentSettings(classification, molecule);

  // Get primary component's settings to sync with UI controls
  const primaryComponent = componentSettings.find(
    c => c.type === classification.primaryType
  );
  const defaultRepresentation = primaryComponent?.representation ?? 'ball-and-stick';
  const defaultColorScheme = primaryComponent?.colorScheme ?? 'cpk';

  return {
    id: generateStructureId(),
    name,
    molecule,
    visible: true,
    representation: defaultRepresentation,
    colorScheme: defaultColorScheme,
    componentSettings,
    classification,
    aromaticRingsDetected: !!molecule.aromaticRings,
    offset: layoutMode === 'side-by-side' ? calculateStructureOffset(index, totalCount) : [0, 0, 0],
  };
}

/**
 * Recalculate offsets for all structures based on layout mode
 */
function recalculateOffsets(
  structures: Map<string, Structure>,
  order: string[],
  layoutMode: LayoutMode
): Map<string, Structure> {
  // Early return for overlay mode - check if any structure needs updating
  if (layoutMode === 'overlay') {
    let needsUpdate = false;
    for (const id of order) {
      const s = structures.get(id);
      if (s && (s.offset[0] !== 0 || s.offset[1] !== 0 || s.offset[2] !== 0)) {
        needsUpdate = true;
        break;
      }
    }
    if (!needsUpdate) return structures; // No cloning needed
  }

  const newStructures = new Map(structures);
  order.forEach((id, index) => {
    const structure = newStructures.get(id);
    if (structure) {
      newStructures.set(id, {
        ...structure,
        offset: layoutMode === 'side-by-side' ? calculateStructureOffset(index, order.length) : [0, 0, 0],
      });
    }
  });
  return newStructures;
}

export const useMoleculeStore = create<MoleculeState>()(
  temporal(
    (set, get) => ({
  ...initialState,

  // ===== Structure management actions =====
  addStructure: (molecule, name) => {
    const { structures, structureOrder, layoutMode } = get();

    if (structures.size >= MAX_STRUCTURES) {
      set({ error: `Maximum of ${MAX_STRUCTURES} structures allowed` });
      return '';
    }

    // Generate name from molecule if not provided
    const structureName = name || molecule.name || `Structure ${structures.size + 1}`;

    const structure = createStructure(
      molecule,
      structureName,
      structureOrder.length,
      structureOrder.length + 1,
      layoutMode
    );

    const newStructures = new Map(structures);
    newStructures.set(structure.id, structure);
    const newOrder = [...structureOrder, structure.id];

    // Recalculate offsets for all structures
    const updatedStructures = recalculateOffsets(newStructures, newOrder, layoutMode);

    // Validate that current activeStructureId actually exists before preserving it
    const currentActiveId = get().activeStructureId;
    const isCurrentActiveValid = currentActiveId && updatedStructures.has(currentActiveId);

    set({
      structures: updatedStructures,
      structureOrder: newOrder,
      activeStructureId: isCurrentActiveValid ? currentActiveId : structure.id,
      error: null,
      loadedMoleculeId: null,
    });

    return structure.id;
  },

  removeStructure: (id) => {
    const { structures, structureOrder, activeStructureId, layoutMode, labels, selectedAtoms, measurements } = get();

    if (!structures.has(id)) return;

    const newStructures = new Map(structures);
    newStructures.delete(id);
    const newOrder = structureOrder.filter(sid => sid !== id);

    // Recalculate offsets
    const updatedStructures = recalculateOffsets(newStructures, newOrder, layoutMode);

    // Update active structure if needed
    let newActiveId = activeStructureId;
    if (activeStructureId === id) {
      newActiveId = newOrder.length > 0 ? newOrder[0] : null;
    }

    // Remove labels and selections for removed structure
    const newLabels = labels.filter(l => l.structureId !== id);
    const newSelectedAtoms = selectedAtoms.filter(ref => ref.structureId !== id);

    // Remove measurements that reference the removed structure
    const newMeasurements = measurements.filter(m =>
      !m.atomRefs.some(ref => ref.structureId === id)
    );

    set({
      structures: updatedStructures,
      structureOrder: newOrder,
      activeStructureId: newActiveId,
      labels: newLabels,
      selectedAtoms: newSelectedAtoms,
      measurements: newMeasurements,
    });
  },

  setActiveStructure: (id) => {
    const { structures } = get();
    if (id === null || structures.has(id)) {
      set({ activeStructureId: id });
    }
  },

  setStructureVisibility: (id, visible) => {
    const { structures } = get();
    const structure = structures.get(id);
    if (!structure || structure.visible === visible) return; // Early exit if unchanged

    const newStructures = new Map(structures);
    newStructures.set(id, { ...structure, visible });
    set({ structures: newStructures });
  },

  setStructureRepresentation: (id, rep) => {
    const { structures } = get();
    const structure = structures.get(id);
    if (!structure || structure.representation === rep) return; // Early exit if unchanged

    const newStructures = new Map(structures);
    newStructures.set(id, { ...structure, representation: rep });
    set({ structures: newStructures });
  },

  setStructureColorScheme: (id, scheme) => {
    const { structures } = get();
    const structure = structures.get(id);
    if (!structure || structure.colorScheme === scheme) return; // Early exit if unchanged

    // Also update componentSettings for smart defaults mode
    // This ensures Cartoon/other representations in component mode receive the new color scheme
    const newComponentSettings = structure.componentSettings.map(cs => ({
      ...cs,
      colorScheme: scheme,
    }));

    const newStructures = new Map(structures);
    newStructures.set(id, {
      ...structure,
      colorScheme: scheme,
      componentSettings: newComponentSettings,
    });
    set({ structures: newStructures });
  },

  setStructureComponentSettings: (id, settings) => {
    const { structures } = get();
    const structure = structures.get(id);
    if (!structure) return;

    const newStructures = new Map(structures);
    newStructures.set(id, { ...structure, componentSettings: settings });
    set({ structures: newStructures });
  },

  updateStructureComponentSetting: (structureId, componentType, updates) => {
    const { structures } = get();
    const structure = structures.get(structureId);
    if (!structure) return;

    const newComponentSettings = structure.componentSettings.map(cs =>
      cs.type === componentType ? { ...cs, ...updates } : cs
    );

    const newStructures = new Map(structures);
    newStructures.set(structureId, { ...structure, componentSettings: newComponentSettings });
    set({ structures: newStructures });
  },

  setLayoutMode: (mode) => {
    const { structures, structureOrder } = get();
    const updatedStructures = recalculateOffsets(structures, structureOrder, mode);
    set({ layoutMode: mode, structures: updatedStructures });
  },

  reorderStructures: (newOrder) => {
    const { structures, layoutMode } = get();
    // Validate that all IDs exist
    if (!newOrder.every(id => structures.has(id))) return;
    const updatedStructures = recalculateOffsets(structures, newOrder, layoutMode);
    set({ structureOrder: newOrder, structures: updatedStructures });
  },

  // ===== Legacy actions (backward compatibility) =====
  setMolecule: (molecule) => {
    if (!molecule) {
      set({
        structures: new Map(),
        structureOrder: [],
        activeStructureId: null,
        error: null,
        selectedAtoms: [],
        measurements: [],
        measurementMode: 'none',
        loadedMoleculeId: null,
        labels: [],
      });
      return;
    }

    // Clear all structures and add single structure
    const { layoutMode } = get();
    const structureName = molecule.name || 'Structure 1';
    const structure = createStructure(molecule, structureName, 0, 1, layoutMode);

    const newStructures = new Map<string, Structure>();
    newStructures.set(structure.id, structure);

    set({
      structures: newStructures,
      structureOrder: [structure.id],
      activeStructureId: structure.id,
      error: null,
      selectedAtoms: [],
      measurements: [],
      measurementMode: 'none',
      loadedMoleculeId: null,
      labels: [],
    });
  },

  setRepresentation: (representation) => {
    const { activeStructureId } = get();
    if (activeStructureId) {
      get().setStructureRepresentation(activeStructureId, representation);
    }
  },

  setColorScheme: (colorScheme) => {
    const { activeStructureId } = get();
    if (activeStructureId) {
      get().setStructureColorScheme(activeStructureId, colorScheme);
    }
  },

  // Hover actions
  setHoveredAtom: (hoveredAtom, hoveredAtomIndex, hoveredStructureId, hoverPosition) => {
    set({ hoveredAtom, hoveredAtomIndex, hoveredStructureId, hoverPosition });
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),

  // Selection actions
  selectAtom: (structureId, atomIndex) => {
    const { selectedAtoms, measurementMode, structures } = get();
    const structure = structures.get(structureId);
    if (!structure) return;

    const atomRef: QualifiedAtomRef = { structureId, atomIndex };

    // If not in measurement mode, just toggle selection
    if (measurementMode === 'none') {
      const isSelected = selectedAtoms.some(
        ref => ref.structureId === structureId && ref.atomIndex === atomIndex
      );
      set({
        selectedAtoms: isSelected
          ? selectedAtoms.filter(ref => !(ref.structureId === structureId && ref.atomIndex === atomIndex))
          : [...selectedAtoms, atomRef],
      });
      return;
    }

    // In measurement mode, add to selection
    const newSelection = [...selectedAtoms, atomRef];
    const requiredAtoms =
      measurementMode === 'distance' ? 2 :
      measurementMode === 'angle' ? 3 : 4;

    if (newSelection.length >= requiredAtoms) {
      // Create measurement with cross-structure support
      const atomRefs = newSelection.slice(0, requiredAtoms);
      const measurement = createMeasurementFromAtomRefs(
        measurementMode as MeasurementType,
        atomRefs,
        structures
      );
      if (measurement) {
        set({
          measurements: [...get().measurements, measurement],
          selectedAtoms: [],
        });
      }
    } else {
      set({ selectedAtoms: newSelection });
    }
  },

  selectAtomsByFilter: (structureId, predicate) => {
    const { structures, selectedAtoms } = get();
    const structure = structures.get(structureId);
    if (!structure) return;

    // Collect all matching atom indices in one pass
    const newRefs: QualifiedAtomRef[] = [];
    structure.molecule.atoms.forEach((atom, index) => {
      if (predicate(atom, index)) {
        newRefs.push({ structureId, atomIndex: index });
      }
    });

    if (newRefs.length > 0) {
      set({ selectedAtoms: [...selectedAtoms, ...newRefs] });
    }
  },

  undoLastSelection: () => {
    const { selectedAtoms } = get();
    if (selectedAtoms.length > 0) {
      set({ selectedAtoms: selectedAtoms.slice(0, -1) });
    }
  },

  clearSelection: () => set({ selectedAtoms: [] }),

  // Measurement actions
  setMeasurementMode: (mode) => set({
    measurementMode: mode,
    selectedAtoms: [],
    highlightedMeasurementId: null,
  }),

  addMeasurement: (measurement) => set({
    measurements: [...get().measurements, measurement],
  }),

  removeMeasurement: (id) => {
    const { highlightedMeasurementId } = get();
    set({
      measurements: get().measurements.filter((m) => m.id !== id),
      highlightedMeasurementId: highlightedMeasurementId === id ? null : highlightedMeasurementId,
    });
  },

  clearMeasurements: () => set({ measurements: [], selectedAtoms: [], highlightedMeasurementId: null }),

  setHighlightedMeasurement: (id) => set({ highlightedMeasurementId: id }),

  // Surface actions
  setSurfaceSettings: (settings) => set({
    surfaceSettings: { ...get().surfaceSettings, ...settings },
  }),

  // Auto-rotate
  setAutoRotate: (enabled) => set({ autoRotate: enabled }),

  // Saved molecules actions
  loadSavedMoleculesIndex: () => {
    set({ savedMolecules: getSavedMolecules() });
  },

  saveMoleculeToStorage: (name) => {
    const { structures, activeStructureId, measurements } = get();
    const activeStructure = activeStructureId ? structures.get(activeStructureId) : null;
    if (!activeStructure) return;

    // Save the active structure's molecule
    const entry = saveMolecule(activeStructure.molecule, measurements, name);
    set({
      savedMolecules: [entry, ...get().savedMolecules],
      loadedMoleculeId: entry.id,
    });
  },

  updateSavedMolecule: () => {
    const { structures, activeStructureId, measurements, loadedMoleculeId, savedMolecules } = get();
    const activeStructure = activeStructureId ? structures.get(activeStructureId) : null;
    if (!activeStructure || !loadedMoleculeId) return;

    const updatedEntry = updateMolecule(loadedMoleculeId, activeStructure.molecule, measurements);
    if (updatedEntry) {
      set({
        savedMolecules: savedMolecules.map((e) =>
          e.id === loadedMoleculeId ? updatedEntry : e
        ),
      });
    }
  },

  loadSavedMolecule: (id) => {
    const data = loadMolecule(id);
    if (data) {
      // Use setMolecule to clear and load single structure
      get().setMolecule(data.molecule);
      // Then restore measurements (need to migrate old format)
      // Old measurements use atomIndices, need to convert to atomRefs
      const { activeStructureId } = get();
      if (activeStructureId && data.measurements.length > 0) {
        const migratedMeasurements = data.measurements.map(m => ({
          ...m,
          atomRefs: m.atomRefs || m.atomIndices.map(idx => ({
            structureId: activeStructureId,
            atomIndex: idx,
          })),
        }));
        set({
          measurements: migratedMeasurements,
          loadedMoleculeId: id,
        });
      } else {
        set({ loadedMoleculeId: id });
      }
    }
  },

  deleteSavedMolecule: (id) => {
    const { loadedMoleculeId } = get();
    deleteMolecule(id);
    set({
      savedMolecules: get().savedMolecules.filter((e) => e.id !== id),
      loadedMoleculeId: loadedMoleculeId === id ? null : loadedMoleculeId,
    });
  },

  renameSavedMolecule: (id, newName) => {
    renameMolecule(id, newName);
    set({
      savedMolecules: get().savedMolecules.map((e) =>
        e.id === id ? { ...e, name: newName } : e
      ),
    });
  },

  clearAllSavedMolecules: () => {
    clearAllMolecules();
    set({
      savedMolecules: [],
      loadedMoleculeId: null,
    });
  },

  // Aromatic ring detection
  detectAromaticRingsIfNeeded: (structureId) => {
    const { structures, activeStructureId } = get();
    const targetId = structureId || activeStructureId;
    if (!targetId) return;

    const structure = structures.get(targetId);
    if (!structure || structure.aromaticRingsDetected) return;

    // Skip detection for large molecules (too expensive)
    if (structure.molecule.atoms.length > AROMATIC_DETECTION_THRESHOLD) {
      const newStructures = new Map(structures);
      newStructures.set(targetId, { ...structure, aromaticRingsDetected: true });
      set({ structures: newStructures });
      return;
    }

    // Detect aromatic rings
    const aromaticRings = detectAromaticRings(structure.molecule);
    const updatedMolecule = { ...structure.molecule, aromaticRings };

    const newStructures = new Map(structures);
    newStructures.set(targetId, {
      ...structure,
      molecule: updatedMolecule,
      aromaticRingsDetected: true,
    });
    set({ structures: newStructures });
  },

  // Context menu actions
  showContextMenu: (state) => {
    set({
      contextMenu: {
        visible: true,
        ...state,
      },
    });
  },

  hideContextMenu: () => {
    set({
      contextMenu: {
        visible: false,
        x: 0,
        y: 0,
        atomIndex: null,
      },
    });
  },

  // Label actions
  addLabel: (structureId, atomIndex, text) => {
    const id = `label-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    set({
      labels: [...get().labels, { id, structureId, atomIndex, text }],
    });
  },

  removeLabel: (id) => {
    set({
      labels: get().labels.filter((l) => l.id !== id),
    });
  },

  clearLabels: () => {
    set({ labels: [] });
  },

  // Utility functions
  getStructure: (id) => get().structures.get(id),

  getAtomFromRef: (ref) => {
    const structure = get().structures.get(ref.structureId);
    return structure?.molecule.atoms[ref.atomIndex];
  },

  // Viewer state actions
  setControlsReady: (ready) => set({ controlsReady: ready }),

  reset: () => set({
    ...initialState,
    structures: new Map(),
  }),
    }),
    {
      // Only track these fields for undo/redo (partialize)
      // Deep copy to ensure each history state is an independent snapshot
      partialize: (state): TemporalState => ({
        structures: new Map(
          Array.from(state.structures.entries()).map(([id, struct]) => [
            id,
            {
              ...struct,
              // Deep copy componentSettings array to ensure undo/redo works correctly
              componentSettings: struct.componentSettings.map(c => ({ ...c })),
            },
          ])
        ),
        structureOrder: [...state.structureOrder],
        measurements: state.measurements.map(m => ({ ...m })),
        labels: state.labels.map(l => ({ ...l })),
        surfaceSettings: { ...state.surfaceSettings },
      }),
      limit: UNDO_HISTORY_LIMIT,
      // Custom equality function to properly compare Map-based states
      equality: (pastState, currentState) => {
        return serializeForComparison(pastState) === serializeForComparison(currentState);
      },
    }
  )
);

// Export the temporal store for undo/redo access
export const temporalStore = useMoleculeStore.temporal;
