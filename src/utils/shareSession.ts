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
import { componentStyle, type ComponentStyle } from './moleculeTypeClassifier';
import type { CameraSnapshot } from '../types/session';
import type { Measurement } from './measurements';
import { loadStructureFromSource } from './structureLoader';
import type { Atom, Molecule } from '../types';

/**
 * 2: components store their style only (no atom lists or Cartoon filter),
 * which builds before it read and crashed without. This build opens 1 and 2.
 */
export const SHARE_SCHEMA_VERSION = 2;

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
  /** Each component's style. v1 links also hold atom lists and a Cartoon filter, ignored on load. */
  componentSettings: ComponentStyle[];
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
  insertionCode?: string;
  residueName?: string;
  name?: string;
  altLoc?: string;
  /** The only field SDF, MOL, XYZ and PubChem atoms have. Missing in identities written before it was added. */
  element?: string;
}

export type SharedAtomRef = QualifiedAtomRef & { atom?: SharedAtomIdentity };
export type SharedLabel = Label3D & { atom?: SharedAtomIdentity };
export type SharedMeasurement = Omit<Measurement, 'atomRefs'> & { atomRefs: SharedAtomRef[] };

export function atomIdentity(atom: Atom): SharedAtomIdentity {
  return {
    chainId: atom.chainId,
    residueNumber: atom.residueNumber,
    insertionCode: atom.insertionCode,
    residueName: atom.residueName,
    name: atom.name,
    altLoc: atom.altLoc,
    element: atom.element,
  };
}

/** '' and a missing value are the same (JSON drops undefined fields). */
const same = (a: unknown, b: unknown) => (a === '' ? undefined : a) === (b === '' ? undefined : b);

function matchesIdentity(atom: Atom, id: SharedAtomIdentity): boolean {
  return (
    same(atom.chainId, id.chainId) &&
    same(atom.residueNumber, id.residueNumber) &&
    same(atom.insertionCode, id.insertionCode) &&
    same(atom.residueName, id.residueName) &&
    same(atom.name, id.name) &&
    same(atom.altLoc, id.altLoc) &&
    // Compared only when stored: identities written before it was added still match
    (id.element === undefined || same(atom.element, id.element))
  );
}

/**
 * Whether an identity can find its atom anywhere but at the stored index.
 * SDF, MOL, XYZ and PubChem atoms have no chain, residue or name, and an
 * element alone would find the first atom of that element.
 */
function canLocate(id: SharedAtomIdentity): boolean {
  return id.chainId !== undefined || id.residueNumber !== undefined || id.name !== undefined;
}

/**
 * First atom index an old share (references without an identity) can't be
 * trusted at in `molecule`, loaded now from `source`: Infinity when every
 * index is as the old parsers numbered it, 0 when none is.
 *
 * The parsers changed which atoms they keep in two places. Alternate
 * locations: the PDB parser kept all of them, now it keeps one per residue;
 * the mmCIF parser kept '.' and 'A', now the first one seen per residue.
 * XYZ: the old parser dropped blank lines first, so a blank comment line
 * made it read the first atom as the comment and number the rest one lower.
 * Atoms before the first difference keep their indices.
 *
 * Production has read XYZ files as today since b431797 (2026-11-06), so an
 * identity-less reference to a blank-comment XYZ file made since then is
 * right. Links and Saved sessions carry no creation date to tell the two
 * apart, so both are dropped (with the notice): those made since the fix
 * lose their labels, but no older one puts a label on the wrong atom.
 */
export function legacyIndexCutoff(molecule: Molecule, source: StructureSource | undefined): number {
  if (!source) return 0;
  const firstIndex = (test: (atom: Atom) => boolean) => {
    const i = molecule.atoms.findIndex(test);
    return i >= 0 ? i : Infinity;
  };
  const format = source.type === 'inline' ? source.format : source.type === 'pubchem' ? 'sdf' : 'cif';
  switch (format) {
    case 'pdb':
      return firstIndex((a) => !!a.altLoc);
    case 'cif':
      return firstIndex((a) => !!a.altLoc && a.altLoc !== 'A');
    case 'xyz': {
      const lines = source.type === 'inline' ? source.data.split(/\r?\n/) : [];
      const countLine = lines.findIndex((line) => line.trim());
      return countLine >= 0 && !lines[countLine + 1]?.trim() ? 0 : Infinity;
    }
    default:
      return Infinity;
  }
}

/**
 * Index of the atom a shared reference means in `molecule`, or null. The
 * atom at the stored index wins when it still matches (cheap, and right
 * when two atoms share an identity); otherwise the one atom with that
 * identity, if the identity can locate one. Several matches (a chainless
 * file whose segments restart their numbering) give null: the identity
 * can't say which atom was meant, so the reference is dropped and counted
 * like a missing atom. Old references without an identity use the index if
 * it is in range and below `legacyCutoff` (legacyIndexCutoff).
 */
export function resolveSharedAtom(
  molecule: Molecule,
  ref: { atomIndex: number; atom?: SharedAtomIdentity },
  legacyCutoff: number
): number | null {
  const { atomIndex, atom: id } = ref;
  const atIndex = Number.isInteger(atomIndex) && atomIndex >= 0 ? molecule.atoms[atomIndex] : undefined;
  if (!id) return atIndex && atomIndex < legacyCutoff ? atomIndex : null;
  if (atIndex && matchesIdentity(atIndex, id)) return atomIndex;
  if (!canLocate(id)) return null;
  let found: number | null = null;
  for (let i = 0; i < molecule.atoms.length; i++) {
    if (!matchesIdentity(molecule.atoms[i], id)) continue;
    if (found !== null) return null;
    found = i;
  }
  return found;
}

export interface ShareableSession {
  schemaVersion: 1 | typeof SHARE_SCHEMA_VERSION;
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
      // Styles only: the opener classifies the molecule it loads
      componentSettings: s.componentSettings.map(componentStyle),
      visible: s.visible,
    });
  }

  // No identity for atoms an older session kept: the opener reads the source
  // with today's parsers, so it checks those indices as an old link's
  const identityOf = (structureId: string, atomIndex: number): SharedAtomIdentity | undefined => {
    const structure = state.structures.get(structureId);
    const atom = structure?.legacyAtoms ? undefined : structure?.molecule.atoms[atomIndex];
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
  if (session.schemaVersion !== 1 && session.schemaVersion !== SHARE_SCHEMA_VERSION) {
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

/** A failed share request, with the HTTP status (callers decide what to report). */
export class ShareRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** A known refusal: shown to the user without an error report. */
    readonly expected: boolean
  ) {
    super(message);
    this.name = 'ShareRequestError';
  }
}

/** POST current state to /api/share, return the short ID. */
export async function createShareLink(payload: ShareableSession): Promise<string> {
  const resp = await fetch('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    // The WAF rate limit answers with an HTML page, not our JSON
    if (resp.status === 429) {
      throw new ShareRequestError('Too many share links in a short time. Try again in a few seconds.', 429, true);
    }
    const err = await resp.json().catch(() => ({}) as { error?: string });
    // Our own refusals carry a JSON message: 403 on a pages.dev address, 503
    // when storage is down. An HTML 403/503 is Cloudflare's, a real failure.
    const expected = (resp.status === 403 || resp.status === 503) && typeof err.error === 'string';
    throw new ShareRequestError(err.error ?? `Share request failed (${resp.status})`, resp.status, expected);
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
