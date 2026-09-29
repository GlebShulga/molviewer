/**
 * Minimal viewer for /embed/* pages (plan 2.3). Loaded lazily, so the main
 * app bundle doesn't grow.
 *
 * Query parameters: repr, color (applied by useInitialUrlLoad), spin=1
 * (auto-rotate), bg=light|dark, ui=minimal (hide the viewer buttons).
 * The "Open in MolViewer" link is always shown: every embed links back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { Maximize2, RotateCw, ExternalLink } from 'lucide-react';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectTotalVisibleAtomCount, selectVisibleStructuresBoundingBox } from '../../store/selectors';
import { MoleculeViewer, type MoleculeViewerHandle } from '../viewer';
import { MoleculeScene } from '../MoleculeScene';
import { AtomTooltip } from '../ui';
import { useInitialUrlLoad } from '../../hooks/useInitialUrlLoad';
import { THEME_COLORS } from '../../config';
import { embedTarget } from '../../../site/embed';
import styles from './EmbedApp.module.css';

const params = new URLSearchParams(window.location.search);
const BG: 'light' | 'dark' = params.get('bg') === 'light' ? 'light' : 'dark';
const MINIMAL_UI = params.get('ui') === 'minimal';
const SPIN = params.get('spin') === '1' || params.get('spin') === 'true';

function openUrl(): string {
  const target = embedTarget(window.location.pathname);
  const url = new URL(target?.pagePath ?? '/', window.location.origin);
  for (const key of ['repr', 'color']) {
    const v = params.get(key);
    if (v) url.searchParams.set(key, v);
  }
  return url.toString();
}

export default function EmbedApp() {
  useInitialUrlLoad();

  const { structureOrder, isLoading, error, autoRotate, setAutoRotate, controlsReady } = useMoleculeStore(
    useShallow((s) => ({
      structureOrder: s.structureOrder,
      isLoading: s.isLoading,
      error: s.error,
      autoRotate: s.autoRotate,
      setAutoRotate: s.setAutoRotate,
      controlsReady: s.controlsReady,
    }))
  );
  const totalAtomCount = useMoleculeStore(selectTotalVisibleAtomCount);
  const boundingBoxData = useMoleculeStore(selectVisibleStructuresBoundingBox);
  const viewerRef = useRef<MoleculeViewerHandle>(null);
  const [homed, setHomed] = useState(false);

  // Notices over a loaded structure fade out, as in the main app.
  const setError = useMoleculeStore((s) => s.setError);
  useEffect(() => {
    if (!error || structureOrder.length === 0) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error, structureOrder.length, setError]);

  // Embeds ignore the visitor's saved theme: the host page picks it with ?bg=.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', BG);
    if (SPIN) setAutoRotate(true);
  }, [setAutoRotate]);

  const getBoundingBox = useCallback(() => {
    if (!boundingBoxData) return null;
    return {
      min: new THREE.Vector3(boundingBoxData.minX, boundingBoxData.minY, boundingBoxData.minZ),
      max: new THREE.Vector3(boundingBoxData.maxX, boundingBoxData.maxY, boundingBoxData.maxZ),
      center: new THREE.Vector3(boundingBoxData.centerX, boundingBoxData.centerY, boundingBoxData.centerZ),
    };
  }, [boundingBoxData]);

  // Frame the structure once it's measured and the controls exist.
  useEffect(() => {
    if (homed || !controlsReady || !boundingBoxData || structureOrder.length === 0) return;
    viewerRef.current?.homeView();
    setHomed(true);
  }, [homed, controlsReady, boundingBoxData, structureOrder.length]);

  return (
    <div className={styles.embed}>
      {structureOrder.length > 0 && (
        <MoleculeViewer
          ref={viewerRef}
          autoRotate={autoRotate}
          backgroundColor={THEME_COLORS[BG].background}
          atomCount={totalAtomCount}
          getBoundingBox={getBoundingBox}
        >
          <MoleculeScene measurementColors={THEME_COLORS[BG].measurement} />
        </MoleculeViewer>
      )}

      {isLoading && (
        <div className={styles.status}>
          <div className={styles.spinner} />
          <span>Loading structure...</span>
        </div>
      )}
      {/* Nothing loaded: the message replaces the viewer. A structure is shown
          (e.g. a flat 2D PubChem fallback): a small note that never blocks input. */}
      {error && !isLoading && structureOrder.length === 0 && (
        <div className={styles.status} role="alert">
          {error}
        </div>
      )}
      {error && !isLoading && structureOrder.length > 0 && (
        <div className={styles.note} role="status">
          {error}
        </div>
      )}

      <a className={styles.openLink} href={openUrl()} target="_blank" rel="noopener">
        <span className={styles.brand}>MolViewer</span>
        Open in MolViewer <ExternalLink size={12} aria-hidden="true" />
      </a>

      {!MINIMAL_UI && structureOrder.length > 0 && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.control}
            onClick={() => viewerRef.current?.homeView()}
            title="Reset view"
            aria-label="Reset view"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={() => setAutoRotate(!autoRotate)}
            title={autoRotate ? 'Stop rotating' : 'Rotate'}
            aria-label={autoRotate ? 'Stop rotating' : 'Rotate'}
            aria-pressed={autoRotate}
          >
            <RotateCw size={16} />
          </button>
        </div>
      )}
      <AtomTooltip />
    </div>
  );
}
