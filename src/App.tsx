import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, type MeasurementMode } from './store/moleculeStore';
import { selectActiveStructure, selectSelectedAtomIndices, selectTotalVisibleAtomCount, selectVisibleStructuresBoundingBox } from './store/selectors';
// Type only: the viewer (and three.js) loads lazily through ViewerStage.
import type { MoleculeViewerHandle } from './components/viewer/MoleculeViewer';
import { loadViewerStage, viewerLoadFailed } from './components/viewer/loadViewerStage';
import { viewerHandle } from './utils/viewerHandle';
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
import { OnboardingProvider, useOnboardingContext, WelcomeScreen, EXAMPLES } from './components/onboarding';
import { THEME_COLORS } from './config';
import { isWebGL2Supported } from './utils/webglDetection';
import { useInitialUrlLoad, loadStructureFromParams } from './hooks/useInitialUrlLoad';
import { useUrlSync } from './hooks/useUrlSync';
import { getWatermarkText } from './utils/watermark';
import { buildExportFilename, shareOrDownload } from './utils/exportImage';
import { showToast } from './utils/toast';
import { Toast } from './components/ui/Toast';
import { track } from './utils/track';
import { parsePathnameParams } from './utils/urlParams';
import { LandingInfo } from './components/ui/LandingInfo';
import { GestureHint } from './components/ui/GestureHint';
import { PageInfoLink } from './components/ui/PageInfoLink';
import { MeasurementHint } from './components/viewer/MeasurementHint';
import { StructureTitle } from './components/viewer/StructureTitle';
import { ColorLegend } from './components/viewer/ColorLegend';
import { useLandingShown } from './hooks/useLandingShown';
import { useMediaQuery } from './hooks/useMediaQuery';
import { Sun, Moon, Menu, X, Github } from 'lucide-react';
import styles from './App.module.css';
import './styles/globals.css';

// Loaded on demand: not needed for the first paint (plan 1.9). The sequence
// viewer, export panel and shortcuts modal stay eager: they must appear the
// moment a structure loads or a key is pressed.
const MeasurementPanel = lazy(() => import('./components/ui/MeasurementPanel').then((m) => ({ default: m.MeasurementPanel })));
const SpotlightTour = lazy(() => import('./components/onboarding/SpotlightTour').then((m) => ({ default: m.SpotlightTour })));
// The 3D viewer and three.js: started early by preloadViewer below.
const ViewerStage = lazy(loadViewerStage);

type StoreState = ReturnType<typeof useMoleculeStore.getState>;

/** A structure is loading or loaded, so the 3D viewer will be needed. */
const wantsViewer = (s: StoreState) => s.isLoading || s.structureOrder.length > 0;

/**
 * Starts the viewer download early. Never on idle: import() also runs the
 * module, and running three.js during first load would add blocking time.
 * A failure shows up later through ViewerStage's ErrorBoundary.
 */
const preloadViewer = () => {
  loadViewerStage().catch(() => {});
};

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className={styles.themeToggle}
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
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

export function EmptyOrWelcome({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const onboarding = useOnboardingContext();

  // The example links (welcome screen and empty state) load into the viewer;
  // useUrlSync then puts the structure's path in the address bar, as for a
  // sidebar load. `via` tags the load event, and only the welcome screen's
  // examples end onboarding: the empty state shows after it is over.
  const { completeWithExample } = onboarding;
  const loadExample = useCallback(async (path: string, via: string, completeOnboarding: boolean) => {
    const params = parsePathnameParams(path);
    if (!params) return;
    const store = useMoleculeStore.getState();
    store.setLoading(true);
    try {
      const { warning } = await loadStructureFromParams(params, new AbortController().signal, via);
      if (warning) store.setError(warning);
      if (completeOnboarding) completeWithExample();
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to load molecule');
    } finally {
      store.setLoading(false);
    }
  }, [completeWithExample]);
  const loadWelcomeExample = useCallback(
    (path: string) => loadExample(path, 'welcome_example', true),
    [loadExample]
  );

  if (onboarding.phase === 'welcome' || onboarding.phase === 'loading') {
    return (
      <WelcomeScreen
        onStart={onboarding.startTour}
        isLoading={onboarding.phase === 'loading'}
        onExample={loadWelcomeExample}
        onIntent={preloadViewer}
      />
    );
  }

  // Real links, as on the welcome screen: a plain click loads in place
  const handleExample = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    void loadExample(path, 'empty_example', false);
  };
  const intentHandlers = { onPointerEnter: preloadViewer, onFocus: preloadViewer, onTouchStart: preloadViewer };

  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>&#x2B21;</div>
      <p>Load a molecule to get started</p>
      {/* The sidebar is always visible on wide screens; on narrow ones it is a drawer or sheet */}
      <button type="button" className={styles.emptyPrimary} onClick={onOpenSidebar} {...intentHandlers}>
        Load a structure
      </button>
      <p className={styles.emptyExamples}>
        or open an example:{' '}
        {EXAMPLES.map((example, i) => (
          // The separator trails its link, so a wrapped line never starts with it
          <span key={example.path} className={styles.emptyExample}>
            <a href={example.path} onClick={(e) => handleExample(e, example.path)} {...intentHandlers}>
              {example.label}
            </a>
            {i < EXAMPLES.length - 1 && <span className={styles.emptySeparator}>·</span>}
          </span>
        ))}
      </p>
      <p className={styles.emptyHint}>Supported formats: PDB, CIF, SDF, MOL, XYZ</p>
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

  // "Try again" remounts the viewer after a render error. If the chunk itself
  // failed to download, the browser won't fetch it again, so it reloads.
  const [viewerBoundaryKey, setViewerBoundaryKey] = useState(0);
  const retryViewer = useCallback(() => {
    if (viewerLoadFailed()) {
      window.location.reload();
      return;
    }
    setViewerBoundaryKey((k) => k + 1);
  }, []);

  // Check if we have any structures loaded
  const hasStructures = structureOrder.length > 0;
  const landingShown = useLandingShown() !== null;

  // The welcome screen carries its own heading, so the header tagline would be
  // a second slogan on the same screen. It comes back as soon as the screen is
  // gone, whichever way the first structure arrived (the onboarding phase alone
  // would not say: a sidebar load leaves it at 'welcome').
  const showWelcome =
    !hasStructures && !isLoading && !error && (onboarding.phase === 'welcome' || onboarding.phase === 'loading');

  useEffect(() => {
    loadSavedMoleculesIndex();
  }, [loadSavedMoleculesIndex]);

  // Start downloading the viewer as soon as a structure is on its way, so the
  // chunk loads alongside the structure fetch instead of after it. Registered
  // before useInitialUrlLoad; the first check covers a load already under way.
  useEffect(() => {
    const preload = (state: StoreState) => {
      if (wantsViewer(state)) preloadViewer();
    };
    preload(useMoleculeStore.getState());
    return useMoleculeStore.subscribe(preload);
  }, []);

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
  // Up to 768px the sidebar is a drawer or sheet over the viewer
  // (App.module.css); wider, it is always there beside it.
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  // Widening past the drawer closes it, so narrowing again starts closed
  const [wasDrawer, setWasDrawer] = useState(isDrawer);
  if (wasDrawer !== isDrawer) {
    setWasDrawer(isDrawer);
    if (!isDrawer) setSidebarOpen(false);
  }
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

  // Track when structures change - set flag for pending home view.
  // On phones the sheet covers the viewer, so a load from it (sample, Fetch,
  // file, session) closes it to show the result. Removing a structure keeps it
  // open, and so does tour step 1, which points into the sheet. structureOrder
  // is in the undo history, so redoing an add also closes it; that's fine.
  useEffect(() => {
    if (structureOrderKey !== prevStructureOrderKeyRef.current) {
      if (structureOrder.length > 0) {
        setPendingHomeView(true);
      }
      const previousIds = prevStructureOrderKeyRef.current.split(',');
      const added = structureOrder.some(id => !previousIds.includes(id));
      if (added && sidebarOpen && !isTouringSidebar && window.innerWidth <= BOTTOM_SHEET_MAX_WIDTH) {
        setSidebarOpen(false);
      }
      prevStructureOrderKeyRef.current = structureOrderKey;
    }
  }, [structureOrderKey, structureOrder, sidebarOpen, isTouringSidebar]);

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

  // Close sidebar when clicking overlay or pressing Escape. Closing it during
  // the tour step that points into it ends the tour, as Skip would.
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const { skipTour } = onboarding;
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    if (isTouringSidebar) skipTour();
  }, [isTouringSidebar, skipTour]);

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

  // The open drawer/sheet is a modal dialog: focus moves into it, and back to
  // the menu button when it closes (unless focus already went elsewhere). Not
  // during tour step 1, which focuses its own tooltip.
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarCloseButtonRef = useRef<HTMLButtonElement>(null);
  const wasSidebarOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = wasSidebarOpenRef.current;
    wasSidebarOpenRef.current = sidebarOpen;
    if (!isDrawer || isTouringSidebar || wasOpen === sidebarOpen) return;
    if (sidebarOpen) {
      sidebarCloseButtonRef.current?.focus({ preventScroll: true });
    } else if (sidebarRef.current?.contains(document.activeElement) || document.activeElement === document.body) {
      menuButtonRef.current?.focus({ preventScroll: true });
    }
  }, [sidebarOpen, isTouringSidebar, isDrawer]);

  // iOS ignores overscroll-behavior on the sheet in some cases: lock the page
  // itself while the sheet is open, so a drag at its end can't scroll it.
  useEffect(() => {
    if (!sidebarOpen || window.innerWidth > BOTTOM_SHEET_MAX_WIDTH) return;
    const { documentElement: html, body } = document;
    const previous = [html.style.overflow, body.style.overflow];
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = previous[0];
      body.style.overflow = previous[1];
    };
  }, [sidebarOpen]);

  // The structure chip over the viewer: open the sheet (wide screens: the
  // sidebar is already there) at Molecule Info. Scrolls the sidebar itself,
  // never the page; the rects move together while the sheet slides in.
  const showMoleculeInfo = useCallback(() => {
    if (isDrawer) setSidebarOpen(true);
    requestAnimationFrame(() => {
      const sidebar = sidebarRef.current;
      const target = document.getElementById('molecule-info');
      if (!sidebar || !target) return;
      const offset = target.getBoundingClientRect().top - sidebar.getBoundingClientRect().top;
      sidebar.scrollTo({ top: sidebar.scrollTop + offset - 16, behavior: 'smooth' });
    });
  }, [isDrawer]);

  const handleExport = useCallback((options?: { scale: number; background: string | null; filename: string }) => {
    if (options) {
      setExportSettings(options);
    }
    const settings = options || exportSettings;
    const blob = viewerRef.current?.exportImage({
      scale: settings.scale,
      background: settings.background,
      watermark: getWatermarkText(),
    });
    if (!blob) return;
    track('export_png', { scale: settings.scale });
    // Still inside the tap: a phone gets the share sheet, the rest a download
    const filename = buildExportFilename(settings.filename || molecule?.name, 'png');
    shareOrDownload(blob, filename).then((result) => {
      if (result === 'downloaded') showToast('Image saved');
    }, () => setError('Could not save the image'));
  }, [exportSettings, molecule?.name, setError]);

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
      const atomIndex = residue.atomIndices[0];
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
          ref={menuButtonRef}
          className={styles.menuButton}
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <span className={styles.brand} data-testid="app-title">MolViewer</span>
        {!showWelcome && <span className={styles.tagline}>Interactive 3D Molecule Viewer</span>}
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
          ref={sidebarRef}
          className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''} ${isTouringSidebar ? styles.tourActive : ''}`}
          onTouchStart={handleSheetTouchStart}
          onTouchEnd={handleSheetTouchEnd}
          // A dialog only as the open drawer or sheet over the viewer
          role={sidebarOpen && isDrawer ? 'dialog' : undefined}
          aria-modal={(sidebarOpen && isDrawer) || undefined}
          aria-label={sidebarOpen && isDrawer ? 'Menu' : undefined}
        >
          <button
            ref={sidebarCloseButtonRef}
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

          {/* Next to the toolbar, also without a structure (a failed first load).
              The toast goes nearest the toolbar, where Export and Copy Link are. */}
          <div className={styles.toolbarStack}>
            <Toast />
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
            {hasStructures && <MeasurementHint />}
            {hasStructures && <AtomTooltip docked />}
          </div>

          {!hasStructures && !isLoading && !error && (
            <EmptyOrWelcome onOpenSidebar={openSidebar} />
          )}

          {hasStructures && (
            <>
              <GestureHint />
              <div className={styles.statusRow}>
                {/* The pill already names the structure: never both */}
                <div className={styles.statusLeft}>{landingShown ? <PageInfoLink /> : <StructureTitle onOpenDetails={showMoleculeInfo} />}</div>
                <div className={styles.statusRight}><ColorLegend /></div>
              </div>
              <Toolbar
                measurementMode={measurementMode}
                onMeasurementModeChange={handleMeasurementModeChange}
                onExport={() => handleExport()}
                onHomeView={handleHomeView}
                onShowShortcuts={handleShowShortcuts}
              />
              <ErrorBoundary
                key={viewerBoundaryKey}
                fallback={
                  <div className={styles.errorBoundaryFallback}>
                    <h2>Viewer error</h2>
                    <p>The 3D viewer could not be loaded or failed to render.</p>
                    <button type="button" onClick={retryViewer}>Try again</button>
                  </div>
                }
              >
                <Suspense
                  fallback={
                    <div className={`${styles.loadingOverlay} ${styles.viewerLoading}`}>
                      <div className={styles.spinner}></div>
                      <span>Loading viewer...</span>
                    </div>
                  }
                >
                  <ViewerStage
                    ref={setViewerRef}
                    autoRotate={autoRotate}
                    backgroundColor={THEME_COLORS[theme].background}
                    atomCount={totalAtomCount}
                    boundingBox={boundingBoxData}
                    measurementColors={THEME_COLORS[theme].measurement}
                  />
                </Suspense>
              </ErrorBoundary>
            </>
          )}
        </main>
      </div>

      {/* On phones and touch screens the docked card in the toolbar-side stack shows instead */}
      <AtomTooltip allowDocking />
      <ContextMenu />
      <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <OnboardingSpotlight setSidebarOpen={setSidebarOpen} />
    </div>
  );
}

const EmbedApp = lazy(() => import('./components/embed/EmbedApp'));

/** Keep in sync with the bottom-sheet media query in App.module.css. */
const BOTTOM_SHEET_MAX_WIDTH = 600;

/** Keep in sync with the drawer media query in App.module.css. */
const DRAWER_QUERY = '(max-width: 768px)';

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
