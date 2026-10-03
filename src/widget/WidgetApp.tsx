/**
 * The 3D viewer inside ChatGPT / Claude (the MCP app's render tool). Like the
 * /embed viewer, but its input comes from the host bridge instead of the URL,
 * and it adds style/color pickers, fullscreen and a confidence legend.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { ExternalLink, Maximize2, Minimize2, RotateCw, Scan } from 'lucide-react';
import { useMoleculeStore } from '../store/moleculeStore';
import { selectActiveStructure, selectTotalVisibleAtomCount, selectVisibleStructuresBoundingBox } from '../store/selectors';
import { MoleculeViewer, type MoleculeViewerHandle } from '../components/viewer';
import { MoleculeScene } from '../components/MoleculeScene';
import { AtomTooltip } from '../components/ui/AtomTooltip';
import { THEME_COLORS } from '../config';
import { PLDDT_BANDS } from '../colors';
import { loadStructureFromSource } from '../utils/structureLoader';
import { calculateColorSchemeContext } from '../utils/atomColor';
import { track } from '../utils/track';
import type { ColorScheme, RepresentationType, StructureSource } from '../types';
import { openInMolViewerUrl, type WidgetLoad, type WidgetPayload, type WidgetView } from '../../site/appContract';
import { payloadKey, type HostBridge, type HostSnapshot } from './bridge';
import styles from './WidgetApp.module.css';

const STYLES: { value: RepresentationType; label: string }[] = [
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'ball-and-stick', label: 'Ball & stick' },
  { value: 'stick', label: 'Stick' },
  { value: 'spacefill', label: 'Spacefill' },
  { value: 'surface-vdw', label: 'Surface' },
];

const COLORS: { value: ColorScheme; label: string }[] = [
  { value: 'chain', label: 'Chain' },
  { value: 'secondaryStructure', label: 'Secondary structure' },
  { value: 'cpk', label: 'Element' },
  { value: 'residueType', label: 'Residue type' },
  { value: 'bfactor', label: 'B-factor' },
  { value: 'rainbow', label: 'Rainbow' },
];

function toSource(load: WidgetLoad): StructureSource {
  switch (load.kind) {
    case 'pdb':
      return { type: 'rcsb', id: load.id };
    case 'alphafold':
      return { type: 'alphafold', id: load.id };
    case 'compound':
      return { type: 'pubchem', cid: load.cid, slug: load.slug };
  }
}

export default function WidgetApp({ host }: { host: HostBridge }) {
  const [snapshot, setSnapshot] = useState<HostSnapshot>(() => host.snapshot());
  const [payload, setPayload] = useState<WidgetPayload | null>(null);
  const [view, setView] = useState<WidgetView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const viewerRef = useRef<MoleculeViewerHandle>(null);
  const homedFor = useRef<string | null>(null);

  const { isLoading, notice, autoRotate, controlsReady } = useMoleculeStore(
    useShallow((s) => ({
      isLoading: s.isLoading,
      notice: s.error,
      autoRotate: s.autoRotate,
      controlsReady: s.controlsReady,
    }))
  );
  const structure = useMoleculeStore(selectActiveStructure);
  const totalAtomCount = useMoleculeStore(selectTotalVisibleAtomCount);
  const boundingBoxData = useMoleculeStore(selectVisibleStructuresBoundingBox);

  useEffect(() => {
    host.onChange(setSnapshot);
    host.onPayload(setPayload);
    host.onToolError(setLoadError);
  }, [host]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', snapshot.theme);
  }, [snapshot.theme]);

  // Load the structure for each new tool result (and on retry).
  useEffect(() => {
    if (!payload) return;
    const key = payloadKey(payload);
    const restored = host.loadState(key) ?? payload.view;
    const controller = new AbortController();
    const store = () => useMoleculeStore.getState();
    store().reset();
    setLoadError(null);
    setView(restored);
    store().setLoading(true);
    (async () => {
      try {
        const { molecule, name, warning } = await loadStructureFromSource(toSource(payload.load), controller.signal);
        if (controller.signal.aborted) return;
        const id = store().addStructure(molecule, name, toSource(payload.load));
        if (id) {
          store().setStructureRepresentation(id, restored.repr);
          store().setStructureColorScheme(id, restored.color);
        }
        store().setAutoRotate(restored.spin);
        if (warning) store().setError(warning);
        if (attempt === 0) track('widget_view', { source: payload.load.kind, ref: host.hostName });
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load the structure');
      } finally {
        if (!controller.signal.aborted) store().setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [payload, attempt, host]);

  const updateView = useCallback(
    (next: Partial<WidgetView>) => {
      if (!payload || !view || !structure) return;
      const merged = { ...view, ...next };
      setView(merged);
      const store = useMoleculeStore.getState();
      if (next.repr) store.setStructureRepresentation(structure.id, next.repr);
      if (next.color) store.setStructureColorScheme(structure.id, next.color);
      if (next.spin !== undefined) store.setAutoRotate(next.spin);
      host.saveState(payloadKey(payload), merged);
    },
    [payload, view, structure, host]
  );

  const getBoundingBox = useCallback(() => {
    if (!boundingBoxData) return null;
    return {
      min: new THREE.Vector3(boundingBoxData.minX, boundingBoxData.minY, boundingBoxData.minZ),
      max: new THREE.Vector3(boundingBoxData.maxX, boundingBoxData.maxY, boundingBoxData.maxZ),
      center: new THREE.Vector3(boundingBoxData.centerX, boundingBoxData.centerY, boundingBoxData.centerZ),
    };
  }, [boundingBoxData]);

  // Frame each new structure once it's measured and the controls exist.
  useEffect(() => {
    if (!structure || !controlsReady || !boundingBoxData || homedFor.current === structure.id) return;
    viewerRef.current?.homeView();
    homedFor.current = structure.id;
  }, [structure, controlsReady, boundingBoxData]);

  const colorContext = useMemo(() => (structure ? calculateColorSchemeContext(structure.molecule) : null), [structure]);
  const isAlphaFold = payload?.load.kind === 'alphafold';
  const showLegend = isAlphaFold && view?.color === 'bfactor' && !!structure;
  const fullscreen = snapshot.displayMode === 'fullscreen';
  // In fullscreen the host's own controls (ChatGPT's close button, composer) sit
  // over the frame. Insets the host reports override the CSS fallback for phones.
  const safeArea = fullscreen ? snapshot.safeArea : undefined;
  const safeAreaStyle = safeArea
    ? ({
        '--safe-top': `${safeArea.top}px`,
        '--safe-right': `${safeArea.right}px`,
        '--safe-bottom': `${safeArea.bottom}px`,
        '--safe-left': `${safeArea.left}px`,
      } as CSSProperties)
    : undefined;

  const openFull = () => {
    if (!payload || !view) return;
    track('widget_open_full', { source: payload.load.kind, ref: host.hostName });
    void host.openLink(openInMolViewerUrl(payload, view, host.hostName));
  };

  const theme = THEME_COLORS[snapshot.theme];

  return (
    <div className={fullscreen ? `${styles.widget} ${styles.fullscreen}` : styles.widget} style={safeAreaStyle}>
      {structure && (
        <MoleculeViewer
          ref={viewerRef}
          autoRotate={autoRotate}
          backgroundColor={theme.background}
          atomCount={totalAtomCount}
          getBoundingBox={getBoundingBox}
        >
          <MoleculeScene measurementColors={theme.measurement} />
        </MoleculeViewer>
      )}

      {!payload && loadError && (
        <div className={styles.status} role="alert">
          <span>{loadError}</span>
        </div>
      )}
      {!payload && !loadError && (
        <div className={styles.status}>
          <div className={styles.spinner} />
          <span>Waiting for the structure...</span>
        </div>
      )}
      {payload && isLoading && (
        <div className={styles.status}>
          <div className={styles.spinner} />
          <span>Loading {payload.title}...</span>
        </div>
      )}
      {payload && loadError && !isLoading && (
        <div className={styles.status} role="alert">
          <span>{loadError}</span>
          <button type="button" className={styles.retry} onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {notice && structure && !isLoading && (
        <div className={styles.note} role="status">
          {notice}
        </div>
      )}

      {structure && view && (
        <div className={styles.toolbar}>
          {/* Key facts in the picture: the chat answer under it is sometimes empty. */}
          <p className={styles.caption} title={payload?.caption ?? payload?.title}>
            {payload?.caption ?? payload?.title}
          </p>
          <select
            className={styles.select}
            aria-label="Style"
            value={view.repr}
            onChange={(e) => updateView({ repr: e.target.value as RepresentationType })}
          >
            {STYLES.map((s) => (
              <option key={s.value} value={s.value} disabled={s.value === 'cartoon' && !colorContext?.hasBackboneData}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label="Color"
            value={view.color}
            onChange={(e) => updateView({ color: e.target.value as ColorScheme })}
          >
            {COLORS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value === 'bfactor' && isAlphaFold ? 'Confidence (pLDDT)' : c.label}
              </option>
            ))}
          </select>
          <button type="button" className={styles.control} onClick={() => viewerRef.current?.homeView()} title="Reset view" aria-label="Reset view">
            <Scan size={16} />
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={() => updateView({ spin: !autoRotate })}
            title={autoRotate ? 'Stop rotating' : 'Rotate'}
            aria-label={autoRotate ? 'Stop rotating' : 'Rotate'}
            aria-pressed={autoRotate}
          >
            <RotateCw size={16} />
          </button>
          {snapshot.canFullscreen && (
            <button
              type="button"
              className={styles.control}
              onClick={() => void host.requestDisplayMode(fullscreen ? 'inline' : 'fullscreen')}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
        </div>
      )}

      {showLegend && (
        <div className={styles.legend} aria-label="AlphaFold confidence (pLDDT)">
          {PLDDT_BANDS.map((b) => (
            <span key={b.label} className={styles.legendItem}>
              <span className={styles.swatch} style={{ backgroundColor: b.color }} />
              {b.label} {b.range}
            </span>
          ))}
        </div>
      )}

      {payload && view && (
        <button type="button" className={styles.openLink} onClick={openFull}>
          <span className={styles.brand}>MolViewer</span>
          Open full viewer <ExternalLink size={12} aria-hidden="true" />
        </button>
      )}
      <AtomTooltip />
    </div>
  );
}
