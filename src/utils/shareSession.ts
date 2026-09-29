/**
 * Shareable session URLs (Cloudflare KV-backed).
 *
 * Stores source *references* (PDB id, AlphaFold id, URL, or small inline payloads)
 * rather than full atom dumps — keeps shares <10 KB in the common case so they
 * fit comfortably in KV.
 */
import type {
  Structure,
  StructureSource,
  RepresentationType,
  ColorScheme,
  LayoutMode,
  Label3D,
} from '../types';
import type { ComponentSettings } from './moleculeTypeClassifier';
import type { CameraSnapshot, SerializedComponentSettings } from '../types/session';
import type { Measurement } from './measurements';
import { loadStructureFromSource } from './structureLoader';
import type { Molecule } from '../types';

export const SHARE_SCHEMA_VERSION = 1;

/** v1: refuse to share inline payloads larger than this. Lifts the cap on the share link. */
export const MAX_INLINE_BYTES = 256 * 1024;

interface SerializedSurfaceSettings {
  type: 'vdw' | 'sas';
  opacity: number;
  probeRadius: number;
  wireframe: boolean;
  visible: boolean;
  color: string;
}

export interface ShareableStructure {
  /** Original structure id — used to remap references in measurements/labels on load. */
  id: string;
  source: StructureSource;
  name: string;
  representation: RepresentationType;
  colorScheme: ColorScheme;
  componentSettings: SerializedComponentSettings[];
  visible: boolean;
}

export interface ShareableSession {
  schemaVersion: typeof SHARE_SCHEMA_VERSION;
  structures: ShareableStructure[];
  layoutMode: LayoutMode;
  camera: CameraSnapshot | null;
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SerializedSurfaceSettings;
  autoRotate: boolean;
}

export interface ShareableSourceState {
  structureOrder: string[];
  structures: Map<string, Structure>;
  layoutMode: LayoutMode;
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SerializedSurfaceSettings;
  autoRotate: boolean;
}

export class UnshareableStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnshareableStructureError';
  }
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

/**
 * Build a ShareableSession payload from the current store state.
 * Throws UnshareableStructureError if any structure has no source or has an
 * inline payload exceeding MAX_INLINE_BYTES.
 */
export function serializeShareableSession(
  state: ShareableSourceState,
  camera: CameraSnapshot | null
): ShareableSession {
  const structures: ShareableStructure[] = [];
  for (const id of state.structureOrder) {
    const s = state.structures.get(id);
    if (!s) continue;
    if (!s.source) {
      throw new UnshareableStructureError(
        `Structure "${s.name}" has no source. Sharing works for PDB/AlphaFold structures or small uploaded files.`
      );
    }
    if (s.source.type === 'inline' && s.source.data.length > MAX_INLINE_BYTES) {
      throw new UnshareableStructureError(
        `Uploaded structure "${s.name}" is too large to share (${(s.source.data.length / 1024).toFixed(0)} KB > ${MAX_INLINE_BYTES / 1024} KB).`
      );
    }
    structures.push({
      id: s.id,
      source: s.source,
      name: s.name,
      representation: s.representation,
      colorScheme: s.colorScheme,
      componentSettings: s.componentSettings.map(serializeComponentSettings),
      visible: s.visible,
    });
  }

  return {
    schemaVersion: SHARE_SCHEMA_VERSION,
    structures,
    layoutMode: state.layoutMode,
    camera,
    measurements: state.measurements.map(m => ({ ...m })),
    labels: state.labels.map(l => ({ ...l })),
    surfaceSettings: { ...state.surfaceSettings },
    autoRotate: state.autoRotate,
  };
}

interface FetchedStructure {
  molecule: Molecule;
  source: StructureSource;
  shareableStructure: ShareableStructure;
}

export interface DeserializedShareableSession {
  structures: FetchedStructure[];
  layoutMode: LayoutMode;
  camera: CameraSnapshot | null;
  measurements: Measurement[];
  labels: Label3D[];
  surfaceSettings: SerializedSurfaceSettings;
  autoRotate: boolean;
  /** Names of structures that couldn't be restored (e.g. source types this version no longer loads). */
  skipped: string[];
}

export async function deserializeShareableSession(
  session: ShareableSession,
  signal?: AbortSignal
): Promise<DeserializedShareableSession> {
  if (session.schemaVersion !== SHARE_SCHEMA_VERSION) {
    throw new Error(`Unsupported share schema v${session.schemaVersion}`);
  }

  // One structure that can't be loaded (a removed source type, a withdrawn
  // entry) must not lose the rest of the scene.
  const results = await Promise.allSettled(
    session.structures.map(async (s): Promise<FetchedStructure> => ({
      molecule: (await loadStructureFromSource(s.source, signal)).molecule,
      source: s.source,
      shareableStructure: s,
    }))
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const fetched: FetchedStructure[] = [];
  const skipped: string[] = [];
  let firstError: unknown;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') fetched.push(r.value);
    else {
      skipped.push(session.structures[i].name || `Structure ${i + 1}`);
      firstError ??= r.reason;
    }
  });
  if (fetched.length === 0 && session.structures.length > 0) throw firstError;

  return {
    structures: fetched,
    skipped,
    layoutMode: session.layoutMode,
    camera: session.camera,
    measurements: session.measurements,
    labels: session.labels,
    surfaceSettings: session.surfaceSettings,
    autoRotate: session.autoRotate,
  };
}

/** Helper for components: rebuilds the per-structure component settings from the share payload. */
export function shareableComponentSettings(s: ShareableStructure): ComponentSettings[] {
  return s.componentSettings.map(deserializeComponentSettings);
}

/** POST current state to /api/share, return the short ID. */
export async function createShareLink(payload: ShareableSession): Promise<string> {
  const resp = await fetch('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `Share request failed (${resp.status})`);
  }
  const { id } = (await resp.json()) as { id: string };
  return id;
}

export async function loadSharedSession(id: string, signal?: AbortSignal): Promise<ShareableSession> {
  const resp = await fetch(`/api/share/${id}`, { signal });
  if (!resp.ok) {
    if (resp.status === 404) throw new Error('Share link not found or expired');
    throw new Error(`Failed to load share (${resp.status})`);
  }
  return (await resp.json()) as ShareableSession;
}
