import type { Molecule } from './molecule';
import type {
  RepresentationType,
  ColorScheme,
  LayoutMode,
  Label3D,
} from './multiStructure';
import type { Measurement } from '../utils/measurements';
import type {
  MoleculeClassification,
  ComponentSettings,
} from '../utils/moleculeTypeClassifier';

export const SCHEMA_VERSION = 1;

export interface SurfaceSettingsSerialized {
  type: 'vdw' | 'sas';
  opacity: number;
  probeRadius: number;
  wireframe: boolean;
  visible: boolean;
  color: string;
}

/**
 * `Set<string>` is not JSON-serializable, so `residueFilter` is stored as an array.
 */
export type SerializedComponentSettings = Omit<ComponentSettings, 'residueFilter'> & {
  residueFilter?: string[];
};

export interface SerializedStructure {
  id: string;
  name: string;
  molecule: Molecule;
  visible: boolean;
  representation: RepresentationType;
  colorScheme: ColorScheme;
  componentSettings: SerializedComponentSettings[];
  classification: MoleculeClassification | null;
  aromaticRingsDetected: boolean;
  offset: [number, number, number];
}

export interface CameraSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

export interface MolViewerSessionState {
  structures: SerializedStructure[];
  structureOrder: string[];
  activeStructureId: string | null;
  layoutMode: LayoutMode;
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SurfaceSettingsSerialized;
  autoRotate: boolean;
  camera: CameraSnapshot | null;
}

export interface MolViewerSession {
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  name: string;
  state: MolViewerSessionState;
}

export class SessionVersionError extends Error {
  constructor(public foundVersion: number) {
    super(
      `Session was saved by a newer version of MolViewer (schema v${foundVersion}). ` +
      `This build supports up to schema v${SCHEMA_VERSION}.`
    );
    this.name = 'SessionVersionError';
  }
}
