/**
 * Loads the structure the startup URL asks for: /pdb/:id, /af/:id,
 * /compound/:slug, /compound/cid/:cid, /s/:id, /embed/..., or the legacy
 * ?pdb= and ?af= parameters. Runs once on mount.
 *
 * Every exit settles `initialLoadSettled` (src/store/urlSyncStore.ts) so the
 * address-bar sync can start, except an aborted run: StrictMode runs this
 * effect twice in development and aborts the first run, and settling then
 * would let the sync fire while the real load is still in flight.
 */
import { useEffect } from 'react';
import {
  applySceneLoad,
  beginSceneLoad,
  finishSceneLoad,
  isCurrentSceneLoad,
  notAppliedReason,
  useMoleculeStore,
  type SceneLoadToken,
} from '../store/moleculeStore';
import { useUrlSyncStore } from '../store/urlSyncStore';
import { getInitialUrlLoad, parseViewParams, type UrlMoleculeParams } from '../utils/urlParams';
import { loadSharedSession, deserializeShareableSession } from '../utils/shareSession';
import { loadStructureFromSource, resolvePubchemCid } from '../utils/structureLoader';
import { cidForSlug, slugForCid } from '../../site/compoundSlugs';
import { track } from '../utils/track';
import { startLoad, type LoadSource } from '../utils/loadTracking';
import { colorToShow, styleFallbackMessage, styleToShow } from '../utils/representationAvailability';
import { showToast } from '../utils/toast';
import type { StructureSource } from '../types';

const settle = () => useUrlSyncStore.getState().settleInitialLoad();

export const UNSUPPORTED_URL_PARAM =
  'Opening structures from other websites (?url=) is no longer supported. Download the file and drop it into the sidebar instead.';

/** Turn parsed URL params into a structure source (resolving compound slugs to CIDs). */
async function toSource(params: UrlMoleculeParams, signal: AbortSignal): Promise<StructureSource> {
  switch (params.source) {
    case 'rcsb':
      return { type: 'rcsb', id: params.id! };
    case 'alphafold':
      return { type: 'alphafold', id: params.id! };
    case 'pubchem': {
      if (params.cid !== undefined) return { type: 'pubchem', cid: params.cid, slug: slugForCid(params.cid) };
      if (!params.slug) throw new Error('No compound given');
      // Curated slugs map straight to a CID. Anything else falls back to a
      // name lookup (only reachable in development: the server 404s unknown slugs).
      const cid = cidForSlug(params.slug) ?? (await resolvePubchemCid(params.slug.replace(/-/g, ' '), signal));
      return { type: 'pubchem', cid, slug: params.slug };
    }
    case 'share':
      throw new Error('Share links are restored separately');
  }
}

/**
 * What a share link couldn't bring back: structures that failed to load,
 * and labels or measurements whose atom isn't in the structure any more.
 */
export function shareRestoreNotice(skipped: string[], droppedReferences: number): string | null {
  const parts: string[] = [];
  if (skipped.length) parts.push(`Some structures in this share could not be restored: ${skipped.join(', ')}`);
  if (droppedReferences === 1) parts.push('1 label or measurement no longer matches the structure and was left out.');
  else if (droppedReferences > 1) {
    parts.push(`${droppedReferences} labels or measurements no longer match the structure and were left out.`);
  }
  return parts.length ? parts.join('. ') : null;
}

function trackSource(source: StructureSource): string {
  return source.type === 'alphafold' ? 'af' : source.type === 'inline' ? 'file' : source.type;
}

const LOAD_SOURCE: Record<Exclude<UrlMoleculeParams['source'], 'share'>, LoadSource> = {
  rcsb: 'rcsb',
  alphafold: 'af',
  pubchem: 'pubchem',
};

/**
 * Loads one structure from parsed URL params and adds it to the store. Shared
 * by the startup load below and the example links on the welcome screen
 * (src/App.tsx), so both report the same events. Everything that belongs to the
 * startup load only (view params, embed tracking, the initial-load gate) stays
 * at the call site.
 *
 * The structure is added through the token (applySceneLoad): nothing is
 * added once a later Replace load has applied, or when the store refuses it
 * (the structure limit), and the caller then shows nothing either.
 */
export async function loadStructureFromParams(
  params: UrlMoleculeParams,
  signal: AbortSignal,
  token: SceneLoadToken,
  start: {
    /** True for an example click, false for the automatic load from the URL. */
    userInitiated: boolean;
    /** Goes into the events' `value`, to tell example clicks from URL loads. */
    via?: string;
  }
): Promise<{ structId: string | null; source: StructureSource; warning?: string }> {
  const attempt = startLoad({
    source: params.source === 'share' ? 'share' : LOAD_SOURCE[params.source],
    userInitiated: start.userInitiated,
    via: start.via,
  });
  // One try around the whole load, adding to the store included (applySceneLoad
  // passes on what addStructure throws): every started load reports an outcome
  try {
    const source = await toSource(params, signal);
    const { molecule, name, warning } = await loadStructureFromSource(source, signal);
    if (signal.aborted) {
      attempt.cancelled('aborted');
      return { structId: null, source };
    }

    let structId = '';
    if (!applySceneLoad(token, () => (structId = useMoleculeStore.getState().addStructure(molecule, name, source)) !== '')) {
      // A later Replace load applied meanwhile, or the store refused it ('')
      attempt.cancelled(notAppliedReason(token));
      return { structId: null, source };
    }
    attempt.loaded(useMoleculeStore.getState().getStructure(structId));
    return { structId, source, warning };
  } catch (err) {
    if (signal.aborted) attempt.cancelled('aborted');
    else if (!isCurrentSceneLoad(token)) attempt.cancelled('superseded');
    else attempt.failed(err);
    throw err;
  }
}

export function useInitialUrlLoad(): void {
  useEffect(() => {
    if (useMoleculeStore.getState().structureOrder.length > 0) {
      settle();
      return;
    }

    const params = getInitialUrlLoad(window.location);
    if (!params) {
      // Nothing to load (or unparseable params such as ?pdb=abc).
      if (new URLSearchParams(window.location.search).has('url')) {
        // Old links from before ?url= was removed: say why nothing loaded.
        useMoleculeStore.getState().setError(UNSUPPORTED_URL_PARAM);
      }
      settle();
      return;
    }

    const viewParams = parseViewParams(window.location.search);
    const controller = new AbortController();
    const { signal } = controller;
    const store = () => useMoleculeStore.getState();

    if (params.source === 'share') {
      (async () => {
        // Opening a share link is a load from the URL, not something done in this tab
        const attempt = startLoad({ source: 'share', userInitiated: false });
        const token = beginSceneLoad('replace');
        try {
          const session = await loadSharedSession(params.id!, signal);
          const deserialized = await deserializeShareableSession(session, signal);
          // Aborted (StrictMode's first run), or overtaken by a later Replace load that applied
          if (signal.aborted) return attempt.cancelled('aborted');
          let droppedReferences = 0;
          if (!applySceneLoad(token, () => {
            ({ droppedReferences } = store().applyShareableSession({ ...deserialized, sourceStructures: session.structures }));
          })) return attempt.cancelled('superseded');
          document.title = 'Shared session - MolViewer';
          const notice = shareRestoreNotice(deserialized.skipped, droppedReferences);
          if (notice) store().setError(notice);
          // One event per share, sized by the structure now active, which
          // style switches made next are counted against
          const { structures, activeStructureId } = store();
          attempt.loaded(structures.get(activeStructureId ?? ''));
        } catch (err) {
          if (signal.aborted) return attempt.cancelled('aborted');
          if (!isCurrentSceneLoad(token)) return attempt.cancelled('superseded');
          attempt.failed(err);
          store().setError(err instanceof Error ? err.message : 'Failed to load shared session');
        } finally {
          // Always: a load left open would keep isLoading on, which stops the address-bar sync
          finishSceneLoad(token);
          if (!signal.aborted) settle();
        }
      })();
      return () => controller.abort();
    }

    (async () => {
      const token = beginSceneLoad('add');
      try {
        // The landing auto-load: nobody clicked anything yet
        const { structId, source, warning } = await loadStructureFromParams(params, signal, token, { userInitiated: false });
        if (signal.aborted || !isCurrentSceneLoad(token)) return;

        if (structId) {
          const molecule = store().structures.get(structId)?.molecule;
          // Cartoon without a backbone, or a style over the atom-count limit,
          // shows what the buttons would allow (styleToShow), with a toast
          const shown = viewParams.repr && molecule ? styleToShow(viewParams.repr, molecule) : viewParams.repr;
          if (viewParams.repr && shown) {
            store().setStructureRepresentation(structId, shown);
            if (shown !== viewParams.repr) showToast(styleFallbackMessage(viewParams.repr, shown));
          }
          // After the style: a scheme Cartoon's fallback can't show becomes CPK
          if (viewParams.color) {
            const color = viewParams.repr && shown && molecule
              ? colorToShow(viewParams.color, viewParams.repr, shown, molecule)
              : viewParams.color;
            store().setStructureColorScheme(structId, color);
          }
          // ?view= from Copy Link: applied by App once the viewer is ready, like a share's camera.
          if (viewParams.camera) store().setPendingCameraSnapshot(viewParams.camera);
        }
        if (warning) store().setError(warning);
        if (params.embed) {
          track('embed_view', { source: trackSource(source), ref: referrerHost() });
        }
      } catch (err) {
        if (signal.aborted || !isCurrentSceneLoad(token)) return;
        store().setError(err instanceof Error ? err.message : 'Failed to load molecule');
      } finally {
        finishSceneLoad(token);
        if (!signal.aborted) settle();
      }
    })();

    return () => controller.abort();
  }, []);
}

/** Host of the page embedding us (document.referrer), without path or query. */
function referrerHost(): string {
  try {
    return document.referrer ? new URL(document.referrer).host : '';
  } catch {
    return '';
  }
}
