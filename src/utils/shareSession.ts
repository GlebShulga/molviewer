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
  QualifiedAtomRef,
} from '../types';
import type { ComponentSettings } from './moleculeTypeClassifier';
import type { CameraSnapshot, SerializedComponentSettings } from '../types/session';
import type { Measurement } from './measurements';
import { loadStructureFromSource } from './structureLoader';
import type { Atom, Molecule } from '../types';

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

/**
 * What a share stores about each atom a label or measurement points at,
 * next to its index. A share re-reads its source on load, and a parser
 * change (alternate locations, say) can shift atom indices; the identity
 * finds the same atom again. Shares made before this have no identity and
 * use the index alone.
 */
export interface SharedAtomIdentity {
  chainId?: string;
  residueNumber?: number;
  residueName?: string;
  name?: string;
  altLoc?: string;
}

export type SharedAtomRef = QualifiedAtomRef & { atom?: SharedAtomIdentity };
export type SharedLabel = Label3D & { atom?: SharedAtomIdentity };
export type SharedMeasurement = Omit<Measurement, 'atomRefs'> & { atomRefs: SharedAtomRef[] };

export function atomIdentity(atom: Atom): SharedAtomIdentity {
  return {
    chainId: atom.chainId,
    residueNumber: atom.residueNumber,
    residueName: atom.residueName,
    name: atom.name,
    altLoc: atom.altLoc,
  };
}

/** '' and a missing value are the same (JSON drops undefined fields). */
const same = (a: unknown, b: unknown) => (a === '' ? undefined : a) === (b === '' ? undefined : b);

function matchesIdentity(atom: Atom, id: SharedAtomIdentity): boolean {
  return (
    same(atom.chainId, id.chainId) &&
    same(atom.residueNumber, id.residueNumber) &&
    same(atom.residueName, id.residueName) &&
    same(atom.name, id.name) &&
    same(atom.altLoc, id.altLoc)
  );
}

/**
 * Index of the atom a shared reference means in `molecule`, or null. The
 * atom at the stored index wins when it still matches (cheap, and right
 * when two atoms share an identity); otherwise the first atom with that
 * identity. Old references without an identity use the index if in range.
 */
export function resolveSharedAtom(molecule: Molecule, ref: { atomIndex: number; atom?: SharedAtomIdentity }): number | null {
  const { atomIndex, atom: id } = ref;
  const atIndex = Number.isInteger(atomIndex) && atomIndex >= 0 ? molecule.atoms[atomIndex] : undefined;
  if (!id) return atIndex ? atomIndex : null;
  if (atIndex && matchesIdentity(atIndex, id)) return atomIndex;
  const found = molecule.atoms.findIndex((a) => matchesIdentity(a, id));
  return found >= 0 ? found : null;
}

export interface ShareableSession {
  schemaVersion: typeof SHARE_SCHEMA_VERSION;
  structures: ShareableStructure[];
  layoutMode: LayoutMode;
  camera: CameraSnapshot | null;
  measurements: SharedMeasurement[];
  labels: SharedLabel[];
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

  const identityOf = (structureId: string, atomIndex: number): SharedAtomIdentity | undefined => {
    const atom = state.structures.get(structureId)?.molecule.atoms[atomIndex];
    return atom ? atomIdentity(atom) : undefined;
  };

  return {
    schemaVersion: SHARE_SCHEMA_VERSION,
    structures,
    layoutMode: state.layoutMode,
    camera,
    measurements: state.measurements.map(m => ({
      ...m,
      atomRefs: m.atomRefs.map(ref => ({ ...ref, atom: identityOf(ref.structureId, ref.atomIndex) })),
    })),
    labels: state.labels.map(l => ({ ...l, atom: identityOf(l.structureId, l.atomIndex) })),
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
  measurements: SharedMeasurement[];
  labels: SharedLabel[];
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
