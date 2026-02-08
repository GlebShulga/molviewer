import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, type MeasurementMode } from './store/moleculeStore';
import { selectActiveStructure, selectSelectedAtomIndices, selectTotalVisibleAtomCount, selectVisibleStructuresBoundingBox } from './store/selectors';
import { MoleculeViewer, type MoleculeViewerHandle } from './components/viewer';
import { MoleculeScene } from './components/MoleculeScene';
import {
  FileUpload,
  ControlPanel,
  AtomTooltip,
  MoleculeMetadata,
  Toolbar,
  ShortcutsHelp,
  ExportPanel,
  MeasurementPanel,
  ResidueNavigator,
  SavedMoleculesPanel,
  ContextMenu,
  SequenceViewer,
  StructureList,
} from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WebGLFallback } from './components/ui/WebGLFallback';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { THEME_COLORS } from './config';
import { isWebGL2Supported } from './utils/webglDetection';
import { Sun, Moon, Menu, X } from 'lucide-react';
import styles from './App.module.css';
import './styles/globals.css';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className={styles.themeToggle}
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function AppContent() {
  const { theme } = useTheme();
  const webgl2Supported = isWebGL2Supported();

  // Use selectors for stable references
  const activeStructure = useMoleculeStore(selectActiveStructure);
  const selectedAtomIndices = useMoleculeStore(selectSelectedAtomIndices);

  const {
    structureOrder,
    activeStructureId,
    isLoading,
    error,
    measurementMode,
    setMeasurementMode,
    measurements,
    removeMeasurement,
    clearMeasurements,
    autoRotate,
    loadSavedMoleculesIndex,
    highlightedMeasurementId,
    setHighlightedMeasurement,
    selectAtom,
    setHoveredAtom,
    controlsReady,
  } = useMoleculeStore(useShallow(state => ({
    structureOrder: state.structureOrder,
    activeStructureId: state.activeStructureId,
    isLoading: state.isLoading,
    error: state.error,
    measurementMode: state.measurementMode,
    setMeasurementMode: state.setMeasurementMode,
    measurements: state.measurements,
    removeMeasurement: state.removeMeasurement,
    clearMeasurements: state.clearMeasurements,
    autoRotate: state.autoRotate,
    loadSavedMoleculesIndex: state.loadSavedMoleculesIndex,
    highlightedMeasurementId: state.highlightedMeasurementId,
    setHighlightedMeasurement: state.setHighlightedMeasurement,
    selectAtom: state.selectAtom,
    setHoveredAtom: state.setHoveredAtom,
    controlsReady: state.controlsReady,
  })));

  // Get molecule from active structure
  const molecule = activeStructure?.molecule ?? null;

  // Use selectors for computed values (memoized selectors return stable references)
  const totalAtomCount = useMoleculeStore(selectTotalVisibleAtomCount);
  const boundingBoxData = useMoleculeStore(selectVisibleStructuresBoundingBox);

  // Convert bounding box data to THREE.Vector3 objects
  const getBoundingBox = useCallback(() => {
    if (!boundingBoxData) return null;
    const min = new THREE.Vector3(boundingBoxData.minX, boundingBoxData.minY, boundingBoxData.minZ);
    const max = new THREE.Vector3(boundingBoxData.maxX, boundingBoxData.maxY, boundingBoxData.maxZ);
    const center = new THREE.Vector3(boundingBoxData.centerX, boundingBoxData.centerY, boundingBoxData.centerZ);
    return { min, max, center };
  }, [boundingBoxData]);

  // Check if we have any structures loaded
  const hasStructures = structureOrder.length > 0;

  useEffect(() => {
    loadSavedMoleculesIndex();
  }, [loadSavedMoleculesIndex]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState({ scale: 2, background: '#0d1117' as string | null, filename: 'molecule' });
  const viewerRef = useRef<MoleculeViewerHandle>(null);

  // Create a stable string key from structure order to detect changes
  const structureOrderKey = structureOrder.join(',');
  const prevStructureOrderKeyRef = useRef('');
  const [pendingHomeView, setPendingHomeView] = useState(false);

  // Track when structures change - set flag for pending home view
  useEffect(() => {
    if (structureOrderKey !== prevStructureOrderKeyRef.current) {
      if (structureOrder.length > 0) {
        setPendingHomeView(true);
      }
      prevStructureOrderKeyRef.current = structureOrderKey;
    }
  }, [structureOrderKey, structureOrder.length]);

  // Execute home view when all conditions are met
  useEffect(() => {
    if (pendingHomeView && controlsReady && boundingBoxData) {
      setPendingHomeView(false);
      viewerRef.current?.homeView();
    }
  }, [pendingHomeView, controlsReady, boundingBoxData]);

  // Close sidebar when clicking overlay or pressing Escape
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        closeSidebar();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen, closeSidebar]);

  const handleExport = useCallback((options?: { scale: number; background: string | null; filename: string }) => {
    if (options) {
      setExportSettings(options);
    }
    const settings = options || exportSettings;
    viewerRef.current?.exportImage({
      scale: settings.scale,
      background: settings.background,
      filename: settings.filename || molecule?.name || 'molecule',
    });
  }, [exportSettings, molecule?.name]);

  const handleHomeView = useCallback(() => {
    viewerRef.current?.homeView();
  }, []);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcuts(true);
  }, []);

  // Register keyboard shortcuts
  useKeyboardShortcuts(handleExport, handleShowShortcuts, handleHomeView);

  const handleMeasurementModeChange = useCallback((mode: MeasurementMode) => {
    setMeasurementMode(mode);
  }, [setMeasurementMode]);

  // Sequence viewer handlers
  // Note: SequenceViewer manages its own structure selection internally
  // These handlers receive atom indices for the currently selected structure in SequenceViewer
  const handleSequenceResidueClick = useCallback((atomIndices: number[]) => {
    if (atomIndices.length > 0 && activeStructureId) {
      // Select the first atom of the residue (e.g., CA for amino acids)
      // Use 2-arg signature with structureId
      selectAtom(activeStructureId, atomIndices[0]);
    }
  }, [selectAtom, activeStructureId]);

  const handleSequenceResidueHover = useCallback((residue: Parameters<NonNullable<React.ComponentProps<typeof SequenceViewer>['onResidueHover']>>[0]) => {
    if (residue && residue.atoms.length > 0 && molecule && activeStructureId) {
      // Hover the first atom of the residue
      const atomIndex = residue.startIndex;
      const atom = molecule.atoms[atomIndex];
      if (atom) {
        // Use 4-arg signature with structureId
        setHoveredAtom(atom, atomIndex, activeStructureId, null);
      }
    } else {
      setHoveredAtom(null, null, null, null);
    }
  }, [molecule, activeStructureId, setHoveredAtom]);

  if (!webgl2Supported) {
    return <WebGLFallback />;
  }

  // ARIA live status message
  const statusMessage = isLoading
    ? 'Loading molecule...'
    : error
      ? error
      : molecule
        ? `${molecule.name} loaded with ${molecule.atoms.length} atoms`
        : '';

  return (
    <div className={styles.app}>
      <a href="#viewer-main" className={styles.skipLink}>Skip to main content</a>
      <div aria-live="polite" className="srOnly">{statusMessage}</div>
      <header className={styles.appHeader}>
        <button
          className={styles.menuButton}
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1>MolViewer</h1>
        <span className={styles.tagline}>Interactive 3D Molecule Viewer</span>
        <ThemeToggle />
      </header>

      <div className={styles.appContent}>
        {/* Mobile sidebar overlay */}
        <div
          className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.visible : ''}`}
          onClick={closeSidebar}
          aria-hidden="true"
        />

        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
          <button
            className={styles.sidebarCloseButton}
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
          <FileUpload />
          <StructureList />
          <SavedMoleculesPanel />
          {hasStructures && (
            <SequenceViewer
              onResidueClick={handleSequenceResidueClick}
              onResidueHover={handleSequenceResidueHover}
            />
          )}
          <ControlPanel />
          <MoleculeMetadata />
          <MeasurementPanel
            measurements={measurements}
            mode={measurementMode}
            selectedAtomIndices={selectedAtomIndices}
            highlightedMeasurementId={highlightedMeasurementId}
            totalAtomCount={totalAtomCount}
            onModeChange={handleMeasurementModeChange}
            onDeleteMeasurement={removeMeasurement}
            onClearAll={clearMeasurements}
            onHighlightMeasurement={setHighlightedMeasurement}
          />
          <ResidueNavigator />
          <ExportPanel onExport={handleExport} />
        </aside>

        <main id="viewer-main" className={styles.viewerContainer}>
          {isLoading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.spinner}></div>
              <span>Loading molecule...</span>
            </div>
          )}

          {error && (
            <div className={styles.errorMessage} role="alert">
              <span className={styles.errorIcon}>!</span>
              <span>{error}</span>
            </div>
          )}

          {!hasStructures && !isLoading && !error && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>&#x2B21;</div>
              <p>Upload a molecule file to get started</p>
              <p className={styles.emptyHint}>Supported formats: PDB, SDF, MOL, XYZ</p>
            </div>
          )}

          {hasStructures && (
            <>
              <Toolbar
                measurementMode={measurementMode}
                onMeasurementModeChange={handleMeasurementModeChange}
                onExport={() => handleExport()}
                onHomeView={handleHomeView}
                onShowShortcuts={handleShowShortcuts}
              />
              <ErrorBoundary
                fallback={
                  <div className={styles.errorBoundaryFallback}>
                    <h2>Rendering Error</h2>
                    <p>Failed to render the molecule. Please try a different file.</p>
                  </div>
                }
              >
                <MoleculeViewer
                  ref={viewerRef}
                  autoRotate={autoRotate}
                  backgroundColor={THEME_COLORS[theme].background}
                  atomCount={totalAtomCount}
                  getBoundingBox={getBoundingBox}
                >
                  <MoleculeScene measurementColors={THEME_COLORS[theme].measurement} />
                </MoleculeViewer>
              </ErrorBoundary>
            </>
          )}
        </main>
      </div>

      <AtomTooltip />
      <ContextMenu />
      <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
