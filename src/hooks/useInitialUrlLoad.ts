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
import { useMoleculeStore } from '../store/moleculeStore';
import { useUrlSyncStore } from '../store/urlSyncStore';
import { getInitialUrlLoad, parseViewParams, type UrlMoleculeParams } from '../utils/urlParams';
import { loadSharedSession, deserializeShareableSession } from '../utils/shareSession';
import { loadStructureFromSource, resolvePubchemCid } from '../utils/structureLoader';
import { cidForSlug, slugForCid } from '../../site/compoundSlugs';
import { entryKind, track } from '../utils/track';
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

function trackSource(source: StructureSource): string {
  return source.type === 'alphafold' ? 'af' : source.type === 'inline' ? 'file' : source.type;
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
        store().setLoading(true);
        try {
          const session = await loadSharedSession(params.id!, signal);
          const deserialized = await deserializeShareableSession(session, signal);
          if (signal.aborted) return;
          store().applyShareableSession({ ...deserialized, sourceStructures: session.structures });
          document.title = 'Shared session - MolViewer';
          if (deserialized.skipped.length) {
            store().setError(`Some structures in this share could not be restored: ${deserialized.skipped.join(', ')}`);
          }
          track('structure_loaded', { source: 'share', entry: entryKind() });
        } catch (err) {
          if (signal.aborted) return;
          store().setError(err instanceof Error ? err.message : 'Failed to load shared session');
        } finally {
          if (!signal.aborted) {
            store().setLoading(false);
            settle();
          }
        }
      })();
      return () => controller.abort();
    }

    (async () => {
      store().setLoading(true);
      try {
        const source = await toSource(params, signal);
        const { molecule, name, warning } = await loadStructureFromSource(source, signal);
        if (signal.aborted) return;

        const structId = store().addStructure(molecule, name, source);
        if (structId) {
          if (viewParams.repr) store().setStructureRepresentation(structId, viewParams.repr);
          if (viewParams.color) store().setStructureColorScheme(structId, viewParams.color);
        }
        if (warning) store().setError(warning);
        track('structure_loaded', { source: trackSource(source), entry: entryKind() });
        if (params.embed) {
          track('embed_view', { source: trackSource(source), ref: referrerHost() });
        }
      } catch (err) {
        if (signal.aborted) return;
        store().setError(err instanceof Error ? err.message : 'Failed to load molecule');
      } finally {
        if (!signal.aborted) {
          store().setLoading(false);
          settle();
        }
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
