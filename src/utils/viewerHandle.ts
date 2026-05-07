import type { MoleculeViewerHandle } from '../components/viewer/MoleculeViewer';

/**
 * Module-level reference to the active MoleculeViewer's imperative handle.
 * Set by App.tsx; read by panels (e.g. session save/load) that need camera APIs
 * but do not have a direct ref to the viewer.
 */
const holder: { current: MoleculeViewerHandle | null } = { current: null };

export const viewerHandle = {
  set(handle: MoleculeViewerHandle | null) {
    holder.current = handle;
  },
  get(): MoleculeViewerHandle | null {
    return holder.current;
  },
};
