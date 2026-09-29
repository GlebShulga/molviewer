/**
 * State that gates address-bar syncing (see src/hooks/useUrlSync.ts).
 * Kept out of moleculeStore so it never enters undo/redo history.
 */
import { create } from 'zustand';
import { getInitialUrlLoad } from '../utils/urlParams';

interface UrlSyncState {
  /**
   * False while the startup URL load (/pdb/ID, ?pdb=, /s/:id, ...) is pending.
   * Until it settles the scene is legitimately empty, and syncing would wipe
   * the address to `/`.
   */
  initialLoadSettled: boolean;
  /**
   * False on share (/s/:id) and embed pages, whose address must stay as is.
   * User-initiated loads switch it back on (see moleculeStore actions).
   */
  syncEnabled: boolean;
  settleInitialLoad: () => void;
  enableSync: () => void;
}

export function initialUrlSyncState(location: { pathname: string; search: string }) {
  return {
    // Same parse the URL-load effect uses, so the flag can't wait for a load
    // that will never start (e.g. ?pdb=abc parses to null and never loads).
    initialLoadSettled: getInitialUrlLoad(location) === null,
    syncEnabled: !(location.pathname.startsWith('/s/') || location.pathname.startsWith('/embed/')),
  };
}

export const useUrlSyncStore = create<UrlSyncState>()((set, get) => ({
  ...initialUrlSyncState(
    typeof window !== 'undefined' ? window.location : { pathname: '/', search: '' }
  ),
  // Idempotent: once settled, stays settled.
  settleInitialLoad: () => {
    if (!get().initialLoadSettled) set({ initialLoadSettled: true });
  },
  enableSync: () => {
    if (!get().syncEnabled) set({ syncEnabled: true });
  },
}));
