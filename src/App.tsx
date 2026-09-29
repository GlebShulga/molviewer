import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, type MeasurementMode } from './store/moleculeStore';
import { selectActiveStructure, selectSelectedAtomIndices, selectTotalVisibleAtomCount, selectVisibleStructuresBoundingBox } from './store/selectors';
import { MoleculeViewer, type MoleculeViewerHandle } from './components/viewer';
import { viewerHandle } from './utils/viewerHandle';
import { MoleculeScene } from './components/MoleculeScene';
import {
  FileUpload,
  ControlPanel,
  AtomTooltip,
  MoleculeMetadata,
  Toolbar,
  ShortcutsHelp,
  ExportPanel,
  SequenceViewer,
  ResidueNavigator,
  SavedMoleculesPanel,
  ContextMenu,
  StructureList,
} from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WebGLFallback } from './components/ui/WebGLFallback';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { OnboardingProvider, useOnboardingContext, WelcomeScreen } from './components/onboarding';
import { THEME_COLORS } from './config';
import { isWebGL2Supported } from './utils/webglDetection';
import { useInitialUrlLoad } from './hooks/useInitialUrlLoad';
import { useUrlSync } from './hooks/useUrlSync';
import { getWatermarkText } from './utils/watermark';
import { track } from './utils/track';
import { parsePathnameParams } from './utils/urlParams';
import { LandingInfo } from './components/ui/LandingInfo';
import { GestureHint } from './components/ui/GestureHint';
import { PageInfoLink } from './components/ui/PageInfoLink';
import { Sun, Moon, Menu, X, Github } from 'lucide-react';
import styles from './App.module.css';
import './styles/globals.css';

// Loaded on demand: not needed for the first paint (plan 1.9). The sequence
// viewer, export panel and shortcuts modal stay eager: they must appear the
// moment a structure loads or a key is pressed.
const MeasurementPanel = lazy(() => import('./components/ui/MeasurementPanel').then((m) => ({ default: m.MeasurementPanel })));
const SpotlightTour = lazy(() => import('./components/onboarding/SpotlightTour').then((m) => ({ default: m.SpotlightTour })));

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

function OnboardingSpotlight({ setSidebarOpen }: { setSidebarOpen: (open: boolean) => void }) {
  const onboarding = useOnboardingContext();
  if (onboarding.phase !== 'touring') return null;
  return (
    <Suspense fallback={null}>
      <SpotlightTour
        step={onboarding.tourStep}
        onNext={onboarding.nextStep}
        onPrev={onboarding.prevStep}
        onSkip={onboarding.skipTour}
        setSidebarOpen={setSidebarOpen}
      />
    </Suspense>
  );
}

function EmptyOrWelcome() {
  const onboarding = useOnboardingContext();

  if (onboarding.phase === 'welcome' || onboarding.phase === 'loading') {
    return <WelcomeScreen onStart={onboarding.startTour} isLoading={onboarding.phase === 'loading'} />;
  }

  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>&#x2B21;</div>
      <p>Upload a molecule file to get started</p>
      <p className={styles.emptyHint}>Supported formats: PDB, SDF, MOL, XYZ</p>
    </div>
  );
}

function AppContent() {
  const { theme } = useTheme();
  const webgl2Supported = isWebGL2Supported();
  const onboarding = useOnboardingContext();
  const isTouringSidebar = onboarding.phase === 'touring' && onboarding.tourStep === 1;

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
    setError,
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
    setError: state.setError,
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

  // Load what the startup URL asks for, then keep the address bar in sync.
  useInitialUrlLoad();
  useUrlSync();

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error, setError]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState({ scale: 2, background: '#0d1117' as string | null, filename: 'molecule' });
  const viewerRef = useRef<MoleculeViewerHandle>(null);
  const setViewerRef = useCallback((handle: MoleculeViewerHandle | null) => {
    viewerRef.current = handle;
    viewerHandle.set(handle);
  }, []);

  // Create a stable string key from structure order to detect changes
  const structureOrderKey = structureOrder.join(',');
  const prevStructureOrderKeyRef = useRef('');
  const [pendingHomeView, setPendingHomeView] = useState(false);

  const pendingCameraSnapshot = useMoleculeStore(state => state.pendingCameraSnapshot);
  const setPendingCameraSnapshot = useMoleculeStore(state => state.setPendingCameraSnapshot);

  // Track when structures change - set flag for pending home view
  useEffect(() => {
    if (structureOrderKey !== prevStructureOrderKeyRef.current) {
      if (structureOrder.length > 0) {
        setPendingHomeView(true);
      }
      prevStructureOrderKeyRef.current = structureOrderKey;
    }
  }, [structureOrderKey, structureOrder.length]);

  // Execute home view when all conditions are met.
  // If a session-load enqueued a camera snapshot, that takes precedence over
  // the auto-homeView (a session restore should land on the saved view).
  useEffect(() => {
    if (!pendingHomeView || !controlsReady || !boundingBoxData) return;
    setPendingHomeView(false);
    if (pendingCameraSnapshot) return; // camera-apply effect below will handle it
    viewerRef.current?.homeView();
  }, [pendingHomeView, controlsReady, boundingBoxData, pendingCameraSnapshot]);

  // Apply a session-restored camera once the scene is ready.
  // Gates on the same readiness signals as homeView (controlsReady + boundingBoxData
  // ensures structures have mounted and been measured).
  useEffect(() => {
    if (!pendingCameraSnapshot || !controlsReady || !boundingBoxData) return;
    const snapshot = pendingCameraSnapshot;
    setPendingCameraSnapshot(null);
    viewerRef.current?.applyCameraSnapshot(snapshot);
  }, [pendingCameraSnapshot, controlsReady, boundingBoxData, setPendingCameraSnapshot]);

  // Close sidebar when clicking overlay or pressing Escape
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // On phones the sidebar is a bottom sheet: swiping down from its top closes it.
  const sheetTouchStartY = useRef<number | null>(null);
  const handleSheetTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    // Only a swipe that can't be a scroll counts: the sheet and every
    // scrollable element under the finger (sequence, lists) must be at the top.
    let el = e.target instanceof HTMLElement ? e.target : null;
    let atTop = true;
    while (el) {
      if (el.scrollTop > 0) {
        atTop = false;
        break;
      }
      if (el === e.currentTarget) break;
      el = el.parentElement;
    }
    sheetTouchStartY.current = atTop ? e.touches[0].clientY : null;
  }, []);
  const handleSheetTouchEnd = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const start = sheetTouchStartY.current;
    sheetTouchStartY.current = null;
    if (start !== null && window.innerWidth <= BOTTOM_SHEET_MAX_WIDTH && e.changedTouches[0].clientY - start > 80) {
      closeSidebar();
    }
  }, [closeSidebar]);

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
      watermark: getWatermarkText(),
    });
    track('export_png', { scale: settings.scale });
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
        <span className={styles.brand} data-testid="app-title">MolViewer</span>
        <span className={styles.tagline}>Interactive 3D Molecule Viewer</span>
        <a
          href="https://github.com/GlebShulga/molviewer"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubLink}
          title="View on Github"
          aria-label="View on Github"
        >
          <Github size={20} />
        </a>
        <ThemeToggle />
      </header>

      <div className={styles.appContent}>
        {/* Mobile sidebar overlay */}
        <div
          className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.visible : ''} ${isTouringSidebar ? styles.tourActive : ''}`}
          onClick={closeSidebar}
          aria-hidden="true"
        />

        <aside
          className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''} ${isTouringSidebar ? styles.tourActive : ''}`}
          onTouchStart={handleSheetTouchStart}
          onTouchEnd={handleSheetTouchEnd}
        >
          <button
            className={styles.sidebarCloseButton}
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
          <LandingInfo />
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
          <Suspense fallback={null}>
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
          </Suspense>
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
              <button
                className={styles.errorClose}
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          )}

          {!hasStructures && !isLoading && !error && (
            <EmptyOrWelcome />
          )}

          {hasStructures && (
            <>
              <GestureHint />
              <PageInfoLink />
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
                  ref={setViewerRef}
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
      <OnboardingSpotlight setSidebarOpen={setSidebarOpen} />
    </div>
  );
}

const EmbedApp = lazy(() => import('./components/embed/EmbedApp'));

/** Keep in sync with the bottom-sheet media query in App.module.css. */
const BOTTOM_SHEET_MAX_WIDTH = 600;

/** /embed/* pages render a minimal viewer for <iframe>s. */
const IS_EMBED = typeof window !== 'undefined' && parsePathnameParams(window.location.pathname)?.embed === true;

function App() {
  if (IS_EMBED) {
    // No ThemeProvider: the embedding page picks the theme with ?bg=, not the
    // visitor's saved preference.
    return (
      <Suspense fallback={null}>
        <EmbedApp />
      </Suspense>
    );
  }
  return (
    <ThemeProvider>
      <OnboardingProvider>
        <AppContent />
      </OnboardingProvider>
    </ThemeProvider>
  );
}

export default App;
