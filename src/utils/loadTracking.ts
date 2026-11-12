/**
 * One structure load as product events: structure_load_started, then exactly
 * one of structure_loaded, structure_load_failed or structure_load_cancelled,
 * and structure_rendered once the structure's first frame is drawn.
 *
 * Every loader (sidebar file, sample and lookups, URL and share loads, the
 * welcome examples, the onboarding tour, the Saved panel) goes through
 * startLoad(). Cancellation (aborted, superseded by a Replace load, refused at
 * the structure limit) is not a drop-off, so it has its own event.
 *
 * The first frame: the scene reports which molecule each structure renderer
 * committed (noteStructureCommitted, src/components/MultiStructureRenderer.tsx)
 * and when React Three Fiber has drawn a frame (noteFrameDrawn, from its
 * after-render effect). The store reports structures that are gone
 * (forgetRemovedStructures), so nothing waits for them.
 */
import type { Molecule } from '../types';
import { entryKind, roundAtoms, track, type EventProps } from './track';
import { classifyLoadError } from './loadErrors';

export type LoadSource = 'file' | 'sample' | 'rcsb' | 'af' | 'pubchem' | 'share' | 'saved';
export type CancelReason = 'aborted' | 'superseded' | 'limit';

export interface LoadStart {
  source: LoadSource;
  /**
   * True when a person started this load in this tab (a file, a lookup, a
   * sample, an example, a Saved entry); false for an automatic load from the
   * URL. Required with no default: the activation funnel counts only these,
   * and a missing value would be stored as 0.
   */
  userInitiated: boolean;
  /** File format, for files and inline samples. */
  format?: string;
  /** File size in bytes (sent as KB to two significant figures). */
  bytes?: number;
  /** How the load was started, e.g. 'welcome_example' (the event's `value`). */
  via?: string;
}

/** A structure as the store holds it: its first frame is timed by this molecule object. */
export interface LoadedStructure {
  id: string;
  molecule: Molecule;
  /** A hidden structure (a session can restore one) is drawn only when shown: nothing to time. */
  visible: boolean;
}

export interface LoadAttempt {
  /**
   * The load is in the store. `structure` is the one whose first frame is
   * timed (for a session, the active one), read back from the store: the
   * store may hold another object than the parsed molecule. Undefined when
   * there is none to time; a hidden one isn't timed either.
   */
  loaded(structure: LoadedStructure | undefined): void;
  failed(err: unknown): void;
  cancelled(reason: CancelReason): void;
}

/** performance.now() of the last time the tab was hidden. */
let lastHiddenAt = -Infinity;
let watchingVisibility = false;

function watchVisibility(): void {
  if (watchingVisibility || typeof document === 'undefined') return;
  watchingVisibility = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) lastHiddenAt = performance.now();
  });
}

interface PendingRender {
  props: EventProps;
  started: number;
  hiddenAtStart: boolean;
  /** The molecule the renderer showed under this id before the load: its commits don't count. */
  previous: Molecule | undefined;
  /** The loaded molecule (or its copy with aromatic rings) has been committed: the next frame draws it. */
  committed: boolean;
}

/** Loaded structures waiting for their first frame, by structure id. */
const pendingRenders = new Map<string, PendingRender>();

/**
 * The molecule each mounted structure renderer last committed. The signal is
 * the molecule, not the id: a saved session keeps its structure ids, so
 * reopening it reuses the renderers, and hiding and showing a structure
 * commits its old molecule again.
 */
const committedMolecules = new Map<string, Molecule>();

export function startLoad(start: LoadStart): LoadAttempt {
  watchVisibility();
  const started = performance.now();
  const hiddenAtStart = typeof document !== 'undefined' && document.hidden;
  const base: EventProps = {
    source: start.source,
    entry: entryKind(),
    user: start.userInitiated ? 1 : 0,
    ...(start.format ? { format: start.format } : {}),
    // At least 1 for any content: 0 means no size was sent
    ...(start.bytes !== undefined ? { kb: start.bytes > 0 ? Math.max(1, roundAtoms(start.bytes / 1024)) : 0 } : {}),
    ...(start.via ? { value: start.via } : {}),
  };
  track('structure_load_started', base);

  let settled = false;
  /** True the first time only: a load reports one outcome. */
  const settle = () => !settled && (settled = true);
  const elapsed = () => Math.round(performance.now() - started);

  return {
    loaded(structure) {
      if (!settle()) return;
      const props = { ...base, atoms: roundAtoms(structure?.molecule.atoms.length ?? 0) };
      track('structure_loaded', { ...props, duration: elapsed() });
      // Hidden: its first frame comes when someone shows it, which would time the wait
      if (!structure?.visible) return;
      const shown = committedMolecules.get(structure.id);
      pendingRenders.set(structure.id, {
        props,
        started,
        hiddenAtStart,
        previous: shown,
        // The store update can reach the scene before the loader reports in
        committed: shown === structure.molecule,
      });
    },
    failed(err) {
      if (!settle()) return;
      track('structure_load_failed', { ...base, detail: classifyLoadError(err), duration: elapsed() });
    },
    cancelled(reason) {
      if (!settle()) return;
      track('structure_load_cancelled', { ...base, detail: reason });
    },
  };
}

/**
 * Called by the scene when a structure's renderer has committed a molecule
 * (its geometry is built). For a load waiting on that structure, a molecule
 * other than the one shown before the load is the loaded one, or its copy
 * with aromatic rings: the next frame drawn draws it.
 */
export function noteStructureCommitted(structureId: string, molecule: Molecule): void {
  committedMolecules.set(structureId, molecule);
  const pending = pendingRenders.get(structureId);
  if (pending && molecule !== pending.previous) pending.committed = true;
}

/**
 * Called when a structure's renderer unmounts (hidden or removed). A load
 * still waiting on it stops: when shown again, its first frame would time the wait.
 */
export function noteStructureUnmounted(structureId: string): void {
  committedMolecules.delete(structureId);
  pendingRenders.delete(structureId);
}

/**
 * Called after every frame React Three Fiber draws. Sends structure_rendered
 * for each load whose molecule was committed before this frame. A hidden tab
 * draws no frames, so it waits until the tab is shown.
 */
export function noteFrameDrawn(): void {
  if (pendingRenders.size === 0) return;
  for (const [id, pending] of pendingRenders) {
    if (!pending.committed) continue;
    pendingRenders.delete(id);
    // Frames stop in hidden tabs: such a time measures the wait, not the render
    const hidden = pending.hiddenAtStart || lastHiddenAt >= pending.started || document.hidden;
    track('structure_rendered', {
      ...pending.props,
      duration: Math.round(performance.now() - pending.started),
      ...(hidden ? { detail: 'hidden' } : {}),
    });
  }
}

/** Called by the store when its structures change: a structure that is gone will never be drawn. */
export function forgetRemovedStructures(exists: (structureId: string) => boolean): void {
  for (const id of pendingRenders.keys()) {
    if (!exists(id)) pendingRenders.delete(id);
  }
}

/** For tests. */
export function resetLoadTrackingForTests(): void {
  pendingRenders.clear();
  committedMolecules.clear();
  lastHiddenAt = -Infinity;
}
