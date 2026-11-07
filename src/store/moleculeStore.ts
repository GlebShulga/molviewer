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
  type StructureSource,
  type ContextMenuState,
  type Label3D,
  MAX_STRUCTURES,
} from '../types';

/** Maximum number of undo/redo history states to prevent memory issues */
const UNDO_HISTORY_LIMIT = 50;
import {
  createMeasurementFromAtomRefs,
  matchesStoredValue,
  refreshDihedrals,
  type Measurement,
  type MeasurementType,
} from '../utils/measurements';
import { detectAromaticRings } from '../utils/aromaticDetection';
import { clearSelectorCaches } from './selectors';
import { useUrlSyncStore } from './urlSyncStore';
import { roundAtoms, track, type EventProps } from '../utils/track';
import { showToast } from '../utils/toast';
import { isStyleLimited, styleFallbackMessage } from '../utils/representationAvailability';
import { AROMATIC_DETECTION_THRESHOLD, GPU_PICKING_THRESHOLD } from '../config';
import { SMART_DEFAULTS } from '../config/smartDefaults';
import { DEFAULT_SURFACE_COLOR } from '../colors';
import {
  loadMoleculeAsync,
  getSavedMolecules,
  deleteMolecule,
  clearAllMolecules,
  renameMolecule,
  saveSession as saveSessionToStorage,
  updateSession as updateSessionInStorage,
  loadSessionAsync,
  SavedEntryReadError,
  type SavedMoleculeEntry,
} from '../utils/moleculeStorage';
import {
  serializeSession,
  deserializeSession,
} from '../utils/sessionSerializer';
import type { MolViewerSession, CameraSnapshot } from '../types/session';

// Forward declaration for TemporalState type used in serializeForComparison
interface TemporalState {
  structures: Map<string, Structure>;
  structureOrder: string[];
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SurfaceSettings;
}

/**
 * Keys left out of the undo comparison. zundo compares the previous and next
 * state on every store write (hover included), and serializing these took
 * 90-106 ms per write on 4V6X:
 * - 'molecule': large, and doesn't change for representation/colorScheme/visibility operations.
 * - 'aromaticRingsDetected': computed lazily and mutates the structure in place.
 * - 'classification' and 'source' (an uploaded file's whole text): set only when a
 *   structure is created; share and session loads clear the history.
 * - 'atomIndices': componentSettings[].atomIndices (1.55 MB on 4V6X) never changes
 *   by a user action (setStructureComponentSettings and updateStructureComponentSetting
 *   could, but have no callers outside tests). This also drops the deprecated
 *   Measurement.atomIndices, whose atoms atomRefs still carries into the comparison.
 */
const SKIPPED_IN_COMPARISON = new Set([
  'molecule',
  'aromaticRingsDetected',
  'classification',
  'source',
  'atomIndices',
]);

/**
 * Serialize a TemporalState for comparison.
 * Handles Map objects by converting them to sorted arrays, and leaves out
 * SKIPPED_IN_COMPARISON.
 */
function serializeForComparison(state: TemporalState): string {
  return JSON.stringify(state, (key, value) => {
    if (SKIPPED_IN_COMPARISON.has(key)) {
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
  generateComponentSettings,
  mergeComponentSettings,
  type ComponentSettings,
  type MoleculeComponentType,
} from '../utils/moleculeTypeClassifier';

/** Components that follow the structure's Style choice (the rest keep their smart defaults). */
const POLYMER_COMPONENTS = new Set<MoleculeComponentType>(['protein', 'dna', 'rna']);

/**
 * Schemes that color by position along a chain, which says nothing about
 * ligands, ions or water: the parsers mark their atoms 'coil' (Secondary
 * structure would draw a heme grey) and their residue numbers aren't sequence
 * positions (Rainbow). Next to a polymer they keep their smart default (CPK).
 */
const CHAIN_SCHEMES = new Set<ColorScheme>(['secondaryStructure', 'rainbow']);

const isSurfaceRepresentation = (rep: RepresentationType) => rep === 'surface-vdw' || rep === 'surface-sas';

/**
 * Event fields for an action on one atom (measure, label, atom menu): the
 * structure's rounded size, the style the atom is drawn in and whether it was
 * picked on the GPU. A structure split into components (protein, ligand,
 * ion...) draws each visible one on its own (StructureRepresentation.tsx), so
 * a ligand next to a Cartoon protein is drawn in Ball & Stick, and GPU picking
 * depends on the atoms its component draws, not on the whole structure.
 */
function pickProps(structure: Structure, atomIndex: number): EventProps {
  const component = structure.classification?.hasMultipleTypes
    ? structure.componentSettings.find((c) => c.visible && c.atomIndices.includes(atomIndex))
    : undefined;
  const style = component?.representation ?? structure.representation;
  const drawn = component ? component.atomIndices.length : structure.molecule.atoms.length;
  return {
    // A surface component draws its atoms in Ball & Stick (ComponentRepresentation.tsx)
    value: isSurfaceRepresentation(style) ? 'ball-and-stick' : style,
    format: drawn >= GPU_PICKING_THRESHOLD ? 'gpu' : 'cpu',
    atoms: roundAtoms(structure.molecule.atoms.length),
  };
}

/**
 * The structure in a new style. Multi-component structures (protein + ligands,
 * ...) are drawn from componentSettings, so the style must reach the polymer
 * components too: otherwise picking Stick for 4HHB changes nothing. Ligands,
 * ions and water keep their own styles; Cartoon restores the polymers' smart
 * default. Surfaces are drawn from `representation` alone, so componentSettings
 * stay as they were and switching back from a surface restores them.
 * Applies even when `rep` is already the structure's style, so it also repairs
 * polymer components that disagree with it.
 */
export function withRepresentation(structure: Structure, rep: RepresentationType): Structure {
  const componentSettings = isSurfaceRepresentation(rep)
    ? structure.componentSettings
    : structure.componentSettings.map((cs) =>
        POLYMER_COMPONENTS.has(cs.type)
          ? { ...cs, representation: rep === 'cartoon' ? SMART_DEFAULTS[cs.type].representation : rep }
          : cs
      );
  return withValidColor({ ...structure, representation: rep, componentSettings });
}

/**
 * Cartoon never shows CPK: element colors on a backbone ribbon are all carbon
 * grey (colorSchemeAvailability). CPK under Cartoon becomes the polymer
 * components' smart default (Secondary structure for proteins, Rainbow for
 * DNA and RNA), with the primary component's for the structure, as on load.
 * Ligands, ions and water beside a polymer never take a chain scheme
 * (CHAIN_SCHEMES): they get their smart default (CPK) instead.
 * Applied wherever a style or color is set, links, the widget and sessions
 * included, so sessions saved before the ligand rule are repaired on load.
 * Returns the same object when nothing changes.
 */
export function withValidColor(structure: Structure): Structure {
  const cartoonCpk = structure.representation === 'cartoon' && structure.colorScheme === 'cpk';
  const hasPolymer = structure.componentSettings.some((cs) => POLYMER_COMPONENTS.has(cs.type));
  const componentSettings = structure.componentSettings.map((cs) => {
    const invalid = POLYMER_COMPONENTS.has(cs.type)
      ? cartoonCpk && cs.colorScheme === 'cpk'
      : hasPolymer && CHAIN_SCHEMES.has(cs.colorScheme);
    return invalid ? { ...cs, colorScheme: SMART_DEFAULTS[cs.type].colorScheme } : cs;
  });
  const componentsChanged = componentSettings.some((cs, i) => cs !== structure.componentSettings[i]);
  if (!cartoonCpk && !componentsChanged) return structure;
  const primary = structure.classification?.primaryType;
  const colorScheme = cartoonCpk
    ? SMART_DEFAULTS[primary && POLYMER_COMPONENTS.has(primary) ? primary : 'protein'].colorScheme
    : structure.colorScheme;
  return { ...structure, colorScheme, componentSettings };
}

/**
 * Cartoon instead of a style the atom-count limit blocks on this device
 * (isStyleLimited), for structures that arrive without the buttons: shared and
 * saved sessions. `fellBackFrom` is the blocked style, for the toast.
 */
export function styleSafeStructure(structure: Structure): { structure: Structure; fellBackFrom?: RepresentationType } {
  // Only the surface is drawn: whatever the polymer components hold is unseen
  if (isSurfaceRepresentation(structure.representation)) return { structure };
  const styles = [
    structure.representation,
    ...structure.componentSettings.filter((cs) => POLYMER_COMPONENTS.has(cs.type)).map((cs) => cs.representation),
  ];
  const fellBackFrom = styles.find((rep) => isStyleLimited(rep, structure.molecule));
  return fellBackFrom ? { structure: withRepresentation(structure, 'cartoon'), fellBackFrom } : { structure };
}

/**
 * Loads from the Saved panel (sessions and saved molecules) read their entry
 * asynchronously, so a slow read could finish after the user asked for
 * something else. Each such load takes a number; when its read finishes it is
 * applied only if nothing has superseded it since: a later saved load, any
 * other scene load (file, sample, fetch, share link, URL), deleting the entry
 * being loaded, or clearing all entries.
 */
let latestSavedLoad = 0;
let pendingSavedLoadId: string | null = null;

function startSavedLoad(id: string): number {
  pendingSavedLoadId = id;
  return ++latestSavedLoad;
}

/** Whether a saved load is still the one to apply; if so it is no longer pending. */
function isCurrentSavedLoad(load: number): boolean {
  if (load !== latestSavedLoad) return false;
  pendingSavedLoadId = null;
  return true;
}

function cancelPendingSavedLoad(): void {
  if (pendingSavedLoadId === null) return;
  latestSavedLoad++;
  pendingSavedLoadId = null;
}

/**
 * A session's structures as they can be shown here: through styleSafeStructure,
 * with one toast if any fell back, and withValidColor, for sessions saved with
 * Cartoon + CPK.
 */
function sessionStructures(structures: Map<string, Structure>): Map<string, Structure> {
  let fellBackFrom: RepresentationType | undefined;
  const result = new Map<string, Structure>();
  for (const [id, structure] of structures) {
    const safe = styleSafeStructure(structure);
    fellBackFrom ??= safe.fellBackFrom;
    result.set(id, withValidColor(safe.structure));
  }
  if (fellBackFrom) showToast(styleFallbackMessage(fellBackFrom));
  return result;
}

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

  // Pending camera to apply once the viewer is ready (e.g. after loadSession).
  // App.tsx watches this and applies via the viewer's imperative handle.
  pendingCameraSnapshot: CameraSnapshot | null;


  // ===== Structure management actions =====
  addStructure: (molecule: Molecule, name?: string, source?: StructureSource) => string;
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
  setMolecule: (molecule: Molecule | null, source?: StructureSource) => void;
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
  /** Loads a single-molecule entry saved by older versions (new saves are sessions). */
  loadSavedMolecule: (id: string) => Promise<void>;
  deleteSavedMolecule: (id: string) => void;
  renameSavedMolecule: (id: string, newName: string) => void;
  clearAllSavedMolecules: () => void;

  // Session save/load (full viewer state)
  buildSession: (name: string, camera: CameraSnapshot | null) => MolViewerSession;
  saveSession: (name: string, camera: CameraSnapshot | null) => Promise<SavedMoleculeEntry>;
  updateSessionEntry: (id: string, camera: CameraSnapshot | null) => Promise<void>;
  loadSession: (session: MolViewerSession) => CameraSnapshot | null;
  loadSavedSession: (id: string) => Promise<CameraSnapshot | null>;

  /**
   * Apply a deserialized share payload as the current viewer state.
   * Generates fresh structure IDs and remaps references in measurements/labels.
   */
  applyShareableSession: (payload: import('../utils/shareSession').DeserializedShareableSession & {
    sourceStructures: import('../utils/shareSession').ShareableStructure[];
  }) => void;

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
  setPendingCameraSnapshot: (snapshot: CameraSnapshot | null) => void;


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
  pendingCameraSnapshot: null as CameraSnapshot | null,

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
 * Create a new Structure from a Molecule
 */
function createStructure(
  molecule: Molecule,
  name: string,
  index: number,
  totalCount: number,
  layoutMode: LayoutMode,
  source?: StructureSource
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
    source,
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
  addStructure: (molecule, name, source) => {
    const { structures, structureOrder, layoutMode } = get();

    if (structures.size >= MAX_STRUCTURES) {
      set({ error: `Maximum of ${MAX_STRUCTURES} structures allowed` });
      return '';
    }
    // The user asked for this structure after any pending saved load
    cancelPendingSavedLoad();

    // Generate name from molecule if not provided
    const structureName = name || molecule.name || `Structure ${structures.size + 1}`;

    const structure = createStructure(
      molecule,
      structureName,
      structureOrder.length,
      structureOrder.length + 1,
      layoutMode,
      source
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
    // User-initiated loads switch address-bar syncing back on (src/hooks/useUrlSync.ts).
    useUrlSyncStore.getState().enableSync();

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
    newStructures.set(id, withRepresentation(structure, rep));
    set({ structures: newStructures });
  },

  setStructureColorScheme: (id, scheme) => {
    const { structures } = get();
    const structure = structures.get(id);
    if (!structure) return;

    // Also update componentSettings for smart defaults mode
    // This ensures Cartoon/other representations in component mode receive the new color scheme
    const newComponentSettings = structure.componentSettings.map(cs => ({
      ...cs,
      colorScheme: scheme,
    }));
    // CPK asked for under Cartoon, or a chain scheme for ligands beside a
    // polymer, gives the smart default instead
    const updated = withValidColor({ ...structure, colorScheme: scheme, componentSettings: newComponentSettings });
    // Early exit if unchanged: the colors actually applied, so no empty undo step
    if (
      updated.colorScheme === structure.colorScheme &&
      updated.componentSettings.every((cs, i) => cs.colorScheme === structure.componentSettings[i]?.colorScheme)
    ) return;

    const newStructures = new Map(structures);
    newStructures.set(id, updated);
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
  setMolecule: (molecule, source) => {
    cancelPendingSavedLoad();
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
    const structure = createStructure(molecule, structureName, 0, 1, layoutMode, source);

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
    useUrlSyncStore.getState().enableSync();
  },

  setRepresentation: (representation) => {
    const { activeStructureId, structures } = get();
    const structure = activeStructureId ? structures.get(activeStructureId) : undefined;
    // A click on the style already shown changes nothing and isn't counted
    if (!structure || structure.representation === representation) return;
    get().setStructureRepresentation(structure.id, representation);
    track('representation_changed', { value: representation, atoms: roundAtoms(structure.molecule.atoms.length) });
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
        // Across two structures, the last atom picked speaks for the measurement
        track('measurement_added', { kind: measurementMode, ...pickProps(structure, atomIndex) });
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

  loadSavedMolecule: async (id) => {
    // Async: entries of 50,000+ atoms live in IndexedDB
    const load = startSavedLoad(id);
    const data = await loadMoleculeAsync(id);
    // Something the user did since (see latestSavedLoad) wins over this load
    if (!isCurrentSavedLoad(load)) return;
    // null: the data is missing, or the read failed (the loader logged that)
    if (!data) throw new SavedEntryReadError('This saved molecule could not be read.');

    // Use setMolecule to clear and load single structure. Stored rings are
    // dropped so they are detected again, as for a session.
    get().setMolecule({ ...data.molecule, aromaticRings: undefined });
    // Then restore measurements. A saved molecule is one structure with a new
    // ID, so every ref points at it. Old saves carry only atomIndices; a
    // measurement that spanned several structures lost the others and is dropped.
    // Older saves also kept measurements taken on other structures: those
    // would land on unrelated atoms, so a measurement is kept only if its
    // stored value matches these atoms.
    // loadedMoleculeId stays null (setMolecule cleared it): it only drives the
    // Update button, which these entries never get.
    const { activeStructureId, structures } = get();
    if (activeStructureId && data.measurements.length > 0) {
      const migratedMeasurements = data.measurements
        .filter(m => new Set(m.atomRefs?.map(ref => ref.structureId)).size <= 1)
        .map(m => ({
          ...m,
          atomRefs: (m.atomRefs?.map(ref => ref.atomIndex) ?? m.atomIndices).map(idx => ({
            structureId: activeStructureId,
            atomIndex: idx,
          })),
        }))
        .filter(m => matchesStoredValue(m, structures));
      set({ measurements: refreshDihedrals(migratedMeasurements, structures) });
    }
  },

  deleteSavedMolecule: (id) => {
    const { loadedMoleculeId } = get();
    // A load of this entry still reading would find it gone; drop it quietly
    if (pendingSavedLoadId === id) cancelPendingSavedLoad();
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
    cancelPendingSavedLoad();
    clearAllMolecules();
    set({
      savedMolecules: [],
      loadedMoleculeId: null,
    });
  },

  // ===== Session actions =====
  buildSession: (name, camera) => {
    const state = get();
    return serializeSession(
      {
        structures: state.structures,
        structureOrder: state.structureOrder,
        activeStructureId: state.activeStructureId,
        layoutMode: state.layoutMode,
        measurements: state.measurements,
        labels: state.labels,
        surfaceSettings: state.surfaceSettings,
        autoRotate: state.autoRotate,
      },
      camera,
      name
    );
  },

  saveSession: async (name, camera) => {
    const session = get().buildSession(name, camera);
    const entry = await saveSessionToStorage(session);
    set({
      savedMolecules: [entry, ...get().savedMolecules],
      loadedMoleculeId: entry.id,
    });
    return entry;
  },

  updateSessionEntry: async (id, camera) => {
    const { savedMolecules } = get();
    const existing = savedMolecules.find((e) => e.id === id);
    if (!existing) return;
    const session = get().buildSession(existing.name, camera);
    const updated = await updateSessionInStorage(id, session);
    if (updated) {
      set({
        savedMolecules: get().savedMolecules.map((e) => (e.id === id ? updated : e)),
      });
    }
  },

  loadSession: (session) => {
    cancelPendingSavedLoad();
    const data = deserializeSession(session);

    // Pause undo/redo tracking during the swap so the load is not undoable
    // into a half-loaded state.
    const temporal = useMoleculeStore.temporal.getState();
    temporal.pause();
    try {
      clearSelectorCaches();
      const structures = sessionStructures(data.structures);
      set({
        ...initialState,
        structures,
        structureOrder: data.structureOrder,
        activeStructureId: data.activeStructureId,
        layoutMode: data.layoutMode,
        measurements: refreshDihedrals(data.measurements, structures),
        labels: data.labels,
        surfaceSettings: data.surfaceSettings,
        autoRotate: data.autoRotate,
        savedMolecules: get().savedMolecules,
        // Enqueue camera so App.tsx applies it once the scene is ready.
        // This preempts the auto-homeView triggered by structure-order changes.
        pendingCameraSnapshot: data.camera,
      });
    } finally {
      temporal.resume();
      // Clear any history accumulated before the load, so the loaded state
      // becomes the new baseline.
      temporal.clear();
    }
    useUrlSyncStore.getState().enableSync();
    return data.camera;
  },

  loadSavedSession: async (id) => {
    const load = startSavedLoad(id);
    const session = await loadSessionAsync(id);
    // Something the user did since (see latestSavedLoad) wins over this load
    if (!isCurrentSavedLoad(load)) return null;
    // null: the data is missing, or the read failed (the loader logged that)
    if (!session) throw new SavedEntryReadError('This saved session could not be read.');
    const camera = get().loadSession(session);
    set({ loadedMoleculeId: id });
    return camera;
  },

  applyShareableSession: (payload) => {
    cancelPendingSavedLoad();
    const temporal = useMoleculeStore.temporal.getState();
    temporal.pause();
    try {
      clearSelectorCaches();

      const newStructures = new Map<string, Structure>();
      const newOrder: string[] = [];
      const idRemap = new Map<string, string>();

      payload.structures.forEach((fs, idx) => {
        const shareable = fs.shareableStructure;
        const structure = createStructure(
          fs.molecule,
          shareable.name,
          idx,
          payload.structures.length,
          payload.layoutMode,
          fs.source
        );
        // Override defaults with the shared view state
        structure.representation = shareable.representation;
        structure.colorScheme = shareable.colorScheme;
        structure.visible = shareable.visible;
        // The shared style per component type, on atom lists from this load
        structure.componentSettings = mergeComponentSettings(structure.componentSettings, shareable.componentSettings);

        idRemap.set(shareable.id, structure.id);
        newStructures.set(structure.id, structure);
        newOrder.push(structure.id);
      });

      // Measurements on a structure that couldn't be restored are dropped,
      // like labels below, rather than left pointing at nothing.
      const remappedMeasurements = payload.measurements
        .filter(m => m.atomRefs.every(ref => idRemap.has(ref.structureId)))
        .map(m => ({
          ...m,
          atomRefs: m.atomRefs.map(ref => ({
            structureId: idRemap.get(ref.structureId)!,
            atomIndex: ref.atomIndex,
          })),
        }));

      const remappedLabels = payload.labels
        .map(l => {
          const newId = idRemap.get(l.structureId);
          if (!newId) return null;
          return { ...l, structureId: newId };
        })
        .filter((l): l is Label3D => l !== null);

      // After representation and componentSettings are restored above
      const structures = sessionStructures(newStructures);
      set({
        ...initialState,
        structures,
        structureOrder: newOrder,
        activeStructureId: newOrder[0] ?? null,
        layoutMode: payload.layoutMode,
        measurements: refreshDihedrals(remappedMeasurements, structures),
        labels: remappedLabels,
        surfaceSettings: payload.surfaceSettings,
        autoRotate: payload.autoRotate,
        savedMolecules: get().savedMolecules,
        pendingCameraSnapshot: payload.camera,
      });
    } finally {
      temporal.resume();
      temporal.clear();
    }
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

    // Detect aromatic rings. The molecule is replaced only when rings were
    // found: a new molecule object makes every view of the structure rebuild
    // (Cartoon, surface), which is wasted when there is nothing to draw.
    const aromaticRings = detectAromaticRings(structure.molecule);
    const molecule = aromaticRings.length > 0
      ? { ...structure.molecule, aromaticRings }
      : structure.molecule;

    const newStructures = new Map(structures);
    newStructures.set(targetId, {
      ...structure,
      molecule,
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
    const { structures, activeStructureId } = get();
    const structureId = state.structureId ?? activeStructureId;
    const structure = structureId ? structures.get(structureId) : undefined;
    if (structure && state.atomIndex !== null) track('atom_menu_opened', pickProps(structure, state.atomIndex));
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
    const structure = get().structures.get(structureId);
    if (structure) track('label_added', pickProps(structure, atomIndex));
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
  setPendingCameraSnapshot: (snapshot) => set({ pendingCameraSnapshot: snapshot }),


  reset: () => {
    clearSelectorCaches();
    set({
      ...initialState,
      structures: new Map(),
    });
  },
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

// Expose the store on window for e2e tests (mirrors the pattern in viewerRefs.ts).
// Keeps test setup fast for boundary checks that would otherwise require many
// sequential UI uploads.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__mol3d_store = useMoleculeStore;
}
