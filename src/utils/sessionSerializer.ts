import type { Structure, Label3D, LayoutMode } from '../types';
import type { Measurement } from './measurements';
import type { ComponentSettings } from './moleculeTypeClassifier';
import {
  type MolViewerSession,
  type MolViewerSessionState,
  type SerializedStructure,
  type SerializedComponentSettings,
  type CameraSnapshot,
  type SurfaceSettingsSerialized,
  SCHEMA_VERSION,
  SessionVersionError,
} from '../types/session';
import packageJson from '../../package.json';

interface SerializableState {
  structures: Map<string, Structure>;
  structureOrder: string[];
  activeStructureId: string | null;
  layoutMode: LayoutMode;
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SurfaceSettingsSerialized;
  autoRotate: boolean;
}

function serializeComponentSettings(cs: ComponentSettings): SerializedComponentSettings {
  return {
    ...cs,
    residueFilter: cs.residueFilter ? Array.from(cs.residueFilter) : undefined,
  };
}

function deserializeComponentSettings(cs: SerializedComponentSettings): ComponentSettings {
  return {
    ...cs,
    residueFilter: cs.residueFilter ? new Set(cs.residueFilter) : undefined,
  };
}

function serializeStructure(s: Structure): SerializedStructure {
  return {
    id: s.id,
    name: s.name,
    // Aromatic rings are derived data: loads detect them again, so they are
    // not stored. The flag stays in the schema, always false.
    molecule: { ...s.molecule, aromaticRings: undefined },
    visible: s.visible,
    representation: s.representation,
    colorScheme: s.colorScheme,
    componentSettings: s.componentSettings.map(serializeComponentSettings),
    classification: s.classification,
    aromaticRingsDetected: false,
    offset: s.offset,
    source: s.source,
  };
}

function deserializeStructure(s: SerializedStructure): Structure {
  return {
    id: s.id,
    name: s.name,
    // Sessions saved by older versions stored rings from whatever detection
    // that version ran (or none, if Ball & Stick and Stick were never shown),
    // so they are dropped and detected again when a style that draws them is shown.
    molecule: { ...s.molecule, aromaticRings: undefined },
    visible: s.visible,
    representation: s.representation,
    colorScheme: s.colorScheme,
    componentSettings: s.componentSettings.map(deserializeComponentSettings),
    classification: s.classification,
    aromaticRingsDetected: false,
    offset: s.offset,
    source: s.source,
  };
}

export function serializeSession(
  state: SerializableState,
  camera: CameraSnapshot | null,
  name: string
): MolViewerSession {
  const sessionState: MolViewerSessionState = {
    structures: state.structureOrder
      .map(id => state.structures.get(id))
      .filter((s): s is Structure => s !== undefined)
      .map(serializeStructure),
    structureOrder: [...state.structureOrder],
    activeStructureId: state.activeStructureId,
    layoutMode: state.layoutMode,
    measurements: state.measurements.map(m => ({ ...m })),
    labels: state.labels.map(l => ({ ...l })),
    surfaceSettings: { ...state.surfaceSettings },
    autoRotate: state.autoRotate,
    camera,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: packageJson.version,
    name,
    state: sessionState,
  };
}

export interface DeserializedSession {
  structures: Map<string, Structure>;
  structureOrder: string[];
  activeStructureId: string | null;
  layoutMode: LayoutMode;
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SurfaceSettingsSerialized;
  autoRotate: boolean;
  camera: CameraSnapshot | null;
}

export function deserializeSession(session: MolViewerSession): DeserializedSession {
  if (typeof session.schemaVersion !== 'number') {
    throw new SessionVersionError(NaN);
  }
  if (session.schemaVersion > SCHEMA_VERSION) {
    throw new SessionVersionError(session.schemaVersion);
  }
  // Future: switch on schemaVersion to apply migrations (v1 -> v2, etc.)

  const structures = new Map<string, Structure>();
  for (const s of session.state.structures) {
    structures.set(s.id, deserializeStructure(s));
  }

  return {
    structures,
    structureOrder: session.state.structureOrder,
    activeStructureId: session.state.activeStructureId,
    layoutMode: session.state.layoutMode,
    measurements: session.state.measurements,
    labels: session.state.labels,
    surfaceSettings: session.state.surfaceSettings,
    autoRotate: session.state.autoRotate,
    camera: session.state.camera,
  };
}
