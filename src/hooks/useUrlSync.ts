/**
 * Keeps the address bar (and window title) in sync with what's loaded, so
 * readable /pdb/ID, /af/ID and /compound/slug addresses are what people copy.
 *
 * Rule: the URL shows the first structure in `structureOrder` that has an
 * address (RCSB, AlphaFold or PubChem). Local files have none. Based on the loaded structures, not on "the last thing loaded", so
 * Add mode, removals and undo all behave.
 *
 * Paused while:
 * - the startup URL load is pending (initialLoadSettled), or anything loads;
 * - on /s/:id share pages until the user loads something new (syncEnabled).
 *   Intended behaviour, not a bug: after a share is restored, *adding* a
 *   structure switches syncing back on and the address becomes the share's
 *   first structure. The scene has moved on from the shared one; to keep it,
 *   the user creates a new share.
 * - always on /embed/* pages, whose address must never change.
 *
 * Uses history.replaceState: nothing listens for popstate, so pushState
 * would make Back change the address without changing the scene.
 */
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../store/moleculeStore';
import { useUrlSyncStore } from '../store/urlSyncStore';
import { sourceToPath } from '../utils/urlParams';
import { normalizePath, parseRoute, structurePath } from '../../site/routes';
import type { Structure } from '../types';

export const DEFAULT_TITLE = 'MolViewer: Free Online 3D Molecule Viewer';

export interface UrlTarget {
  /** Path plus search, e.g. `/pdb/4HHB?repr=cartoon`. */
  url: string;
}

type SyncStructure = Pick<Structure, 'name' | 'source' | 'representation' | 'colorScheme'>;

/**
 * Pure part of the window title: it names the first structure in the scene
 * (whatever its source, so local files count too) and changes only when
 * that structure changes. The server-rendered title of a landing page is
 * kept while the page's own structure is shown at its own address.
 * Returns undefined to leave the title as it is.
 */
export function computeTitle(input: {
  first: Pick<Structure, 'id' | 'name' | 'source'> | undefined;
  /** Id of the structure the title currently names, or null if none yet. */
  titledId: string | null;
  becameEmpty: boolean;
  pathname: string;
  /** Address the page was opened at when it carried a structure (/pdb/3DNI), else null. */
  initialStructurePath: string | null;
}): string | undefined {
  const { first, titledId, becameEmpty, pathname, initialStructurePath } = input;
  if (!first) return becameEmpty ? DEFAULT_TITLE : undefined;
  if (first.id === titledId) return undefined;
  const isLandingStructure =
    titledId === null &&
    initialStructurePath !== null &&
    pathname === initialStructurePath &&
    sourceToPath(first.source) === initialStructurePath;
  return isLandingStructure ? undefined : `${first.name} - MolViewer`;
}

/** `/pdb/3DNI` when the page was opened at a structure's readable address, else null. */
function structurePathOf(pathname: string): string | null {
  const route = parseRoute(pathname);
  return route.page === 'structure' && !route.embed ? structurePath(route.structure) : null;
}

/**
 * Canonical form of the address the page was opened at, so it compares
 * equal to what the sync writes: '/pdb/4hhb/' -> '/pdb/4HHB'.
 */
function canonicalPath(pathname: string): string {
  const route = parseRoute(pathname);
  if (route.page === 'share') return `/s/${route.id}`;
  if (route.page === 'structure') return (route.embed ? '/embed' : '') + structurePath(route.structure);
  return normalizePath(pathname);
}

/**
 * Pure part of the sync: where should the address point now?
 * Returns null when it should stay as it is.
 */
export function computeUrlTarget(input: {
  pathname: string;
  search: string;
  structures: SyncStructure[];
  /** The scene went from non-empty to empty through a user action. */
  becameEmpty: boolean;
}): UrlTarget | null {
  const { pathname, search, structures, becameEmpty } = input;
  const first = structures.find((s) => sourceToPath(s.source) !== null);

  let targetPath: string;
  const params = new URLSearchParams();

  if (!first) {
    // An empty scene is not a reason to leave the current address (a failed
    // load keeps /pdb/ZZZZ next to its error). Only an emptied scene, or a
    // scene of local files only, goes back to the home address.
    if (structures.length === 0 && !becameEmpty) return null;
    targetPath = '/';
  } else {
    const path = sourceToPath(first.source)!;
    targetPath = path;
    // Keep ?repr= / ?color= only while they still describe the view: drop
    // them once the user changes that structure's representation or colors.
    const current = new URLSearchParams(search);
    const repr = current.get('repr');
    const color = current.get('color');
    if (repr && repr === first.representation) params.set('repr', repr);
    if (color && color === first.colorScheme) params.set('color', color);
  }

  const query = params.toString();
  const url = query ? `${targetPath}?${query}` : targetPath;
  return url === pathname + search ? null : { url };
}

export function useUrlSync(): void {
  const { structures, structureOrder, isLoading } = useMoleculeStore(
    useShallow((s) => ({ structures: s.structures, structureOrder: s.structureOrder, isLoading: s.isLoading }))
  );
  const { initialLoadSettled, syncEnabled } = useUrlSyncStore(
    useShallow((s) => ({ initialLoadSettled: s.initialLoadSettled, syncEnabled: s.syncEnabled }))
  );
  const prevCountRef = useRef<number | null>(null);
  const titledIdRef = useRef<string | null>(null);
  // Address the page was opened at (what the server rendered #page-info for).
  const initialPathRef = useRef<string>(canonicalPath(window.location.pathname));
  const initialStructurePathRef = useRef<string | null | undefined>(undefined);
  if (initialStructurePathRef.current === undefined) {
    initialStructurePathRef.current = structurePathOf(window.location.pathname);
  }

  useEffect(() => {
    const count = structureOrder.length;
    const prevCount = prevCountRef.current;
    prevCountRef.current = count;

    const { pathname, search } = window.location;
    if (pathname.startsWith('/embed/')) return;
    if (!initialLoadSettled || isLoading || !syncEnabled) return;

    const ordered = structureOrder
      .map((id) => structures.get(id))
      .filter((s): s is Structure => s !== undefined);
    const becameEmpty = prevCount !== null && prevCount > 0 && count === 0;

    const title = computeTitle({
      first: ordered[0],
      titledId: titledIdRef.current,
      becameEmpty,
      pathname: canonicalPath(pathname),
      initialStructurePath: initialStructurePathRef.current ?? null,
    });
    if (title) document.title = title;
    titledIdRef.current = ordered[0]?.id ?? null;

    const target = computeUrlTarget({ pathname, search, structures: ordered, becameEmpty });
    if (!target) return;

    window.history.replaceState(window.history.state, '', target.url);

    // The text below the viewer describes the page the server rendered
    // (a structure, a share, a compound). Hide it once the address points
    // somewhere else. The home page's content is site-wide, so it stays.
    const pageInfo = document.getElementById('page-info');
    const initialPath = initialPathRef.current;
    if (pageInfo && initialPath !== '/') {
      pageInfo.hidden = canonicalPath(window.location.pathname) !== initialPath;
    }
  }, [structures, structureOrder, isLoading, initialLoadSettled, syncEnabled]);
}
