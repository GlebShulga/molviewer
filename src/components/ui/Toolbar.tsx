import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';
import {
  Circle,
  Hexagon,
  Maximize,
  Ruler,
  Triangle,
  Camera,
  Home,
  Keyboard,
  Undo2,
  Redo2,
  RotateCw,
  Link,
  Check,
  Ellipsis,
} from 'lucide-react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { useActiveStructure } from '../../hooks';
import { buildShareUrl, sourceToPath } from '../../utils/urlParams';
import { viewerHandle } from '../../utils/viewerHandle';
import { track } from '../../utils/track';
import { showToast } from '../../utils/toast';
import { hasBackboneData } from '../../utils/backboneExtraction';
import { representationAvailability } from '../../utils/representationAvailability';
import { isTouchScreen } from '../../utils/touch';
import styles from './Toolbar.module.css';

export type MeasurementMode = 'none' | 'distance' | 'angle' | 'dihedral';

export interface ToolbarProps {
  measurementMode?: MeasurementMode;
  onMeasurementModeChange?: (mode: MeasurementMode) => void;
  onExport?: () => void;
  onHomeView?: () => void;
  onShowShortcuts?: () => void;
}

interface ToolbarButton {
  icon: React.ReactNode;
  label: string;
  /** Tooltip, when it says more than the label. */
  title?: string;
  /** Keyboard shortcut as shown to people ("Ctrl+Z"): goes into the tooltip and aria-keyshortcuts. */
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  /** A toggle: announces `active` as aria-pressed. Copy Link's check mark is not one. */
  toggle?: boolean;
  disabled?: boolean;
}

const REPRESENTATION_ICONS = {
  'ball-and-stick': <Hexagon size={18} />,
  'stick': <Maximize size={18} style={{ transform: 'rotate(45deg)' }} />,
  'spacefill': <Circle size={18} />,
} as const;

function buttonTitle(button: ToolbarButton): string {
  if (button.title) return button.title;
  return button.shortcut ? `${button.label} (${button.shortcut})` : button.label;
}

/** aria-keyshortcuts spells modifiers out ("Control+Z"). */
function ariaKeyShortcuts(shortcut: string | undefined): string | undefined {
  return shortcut?.replace(/^Ctrl\+/, 'Control+');
}

export function Toolbar({
  measurementMode = 'none',
  onMeasurementModeChange,
  onExport,
  onHomeView,
  onShowShortcuts,
}: ToolbarProps) {
  // Use new hook for active structure access
  const activeStructure = useActiveStructure();
  const { setRepresentation, autoRotate, setAutoRotate, structureCount } = useMoleculeStore(useShallow(state => ({
    setRepresentation: state.setRepresentation,
    autoRotate: state.autoRotate,
    setAutoRotate: state.setAutoRotate,
    structureCount: state.structureOrder.length,
  })));
  // Copy Link shares the active structure's readable address (/pdb/ID, /af/ID, ...).
  const linkSource = activeStructure?.source && sourceToPath(activeStructure.source) ? activeStructure.source : null;

  // Copy link state
  const [linkCopied, setLinkCopied] = useState(false);
  const handleCopyLink = useCallback(() => {
    const repr = activeStructure?.representation;
    const color = activeStructure?.colorScheme;
    // The camera only when the link reopens the same scene: with several
    // structures (overlay or side by side), a fresh load of this one alone
    // has different world coordinates. Share Link covers whole scenes.
    const camera = linkSource && structureCount === 1 ? viewerHandle.get()?.getCameraSnapshot() ?? null : null;
    const url = buildShareUrl({ source: linkSource, repr, color, camera });
    navigator.clipboard.writeText(url).then(() => {
      track('link_copied', { value: camera ? 'view' : 'plain' });
      // The check icon below is out of sight when Copy Link is in the "More" menu
      showToast('Link copied');
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      // Clipboard API can fail in iframes or older browsers — ignore silently
    });
  }, [activeStructure, linkSource, structureCount]);

  // Get undo/redo state from temporal store
  const { pastStates, futureStates, undo, redo } = useStore(temporalStore);

  // Derive molecule and representation from active structure
  const molecule = activeStructure?.molecule ?? null;
  const representation = activeStructure?.representation ?? 'ball-and-stick';
  const hasMolecule = !!molecule;

  // The sheet's Representation buttons use the same rule (utils/representationAvailability)
  const visible = activeStructure?.visible ?? true;
  const hasBackbone = useMemo(
    () => (molecule ? hasBackboneData(molecule) : false),
    [molecule]
  );
  const representationButtons = useMemo<ToolbarButton[]>(() => {
    const atomCount = molecule?.atoms.length ?? 0;
    const repButton = (rep: 'ball-and-stick' | 'stick' | 'spacefill', label: string, shortcut: string): ToolbarButton => {
      const availability = representationAvailability(rep, { visible, atomCount, hasBackbone, touch: isTouchScreen() });
      return {
        icon: REPRESENTATION_ICONS[rep],
        label,
        title: availability.available ? undefined : `${label}: ${availability.reason}`,
        shortcut,
        onClick: () => setRepresentation(rep),
        active: representation === rep,
        toggle: true,
        disabled: !molecule || !availability.available,
      };
    };
    return [
      repButton('ball-and-stick', 'Ball & Stick', '1'),
      repButton('stick', 'Stick', '2'),
      repButton('spacefill', 'Spacefill', '3'),
    ];
  }, [setRepresentation, representation, molecule, visible, hasBackbone]);

  const measurementButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Ruler size={18} />,
      label: 'Distance',
      shortcut: 'D',
      onClick: () => onMeasurementModeChange?.(measurementMode === 'distance' ? 'none' : 'distance'),
      active: measurementMode === 'distance',
      toggle: true,
      disabled: !hasMolecule,
    },
    {
      icon: <Triangle size={18} />,
      label: 'Angle',
      shortcut: 'A',
      onClick: () => onMeasurementModeChange?.(measurementMode === 'angle' ? 'none' : 'angle'),
      active: measurementMode === 'angle',
      toggle: true,
      disabled: !hasMolecule,
    },
  ], [onMeasurementModeChange, measurementMode, hasMolecule]);

  const viewButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Home size={18} />,
      // e2e waits on button[title*="Reset View"]: keep this casing
      label: 'Reset View',
      shortcut: 'H',
      onClick: () => onHomeView?.(),
      disabled: !hasMolecule,
    },
    {
      icon: <RotateCw size={18} />,
      label: 'Auto Rotate',
      shortcut: 'R',
      onClick: () => setAutoRotate(!autoRotate),
      active: autoRotate,
      toggle: true,
      disabled: !hasMolecule,
    },
    {
      icon: <Camera size={18} />,
      label: 'Export',
      shortcut: 'Ctrl+S',
      onClick: () => onExport?.(),
      disabled: !hasMolecule,
    },
    {
      icon: linkCopied ? <Check size={18} /> : <Link size={18} />,
      label: linkCopied ? 'Link Copied!' : 'Copy Link',
      title: linkCopied ? 'Link Copied!' : structureCount === 1 ? 'Copy link to this structure and view' : 'Copy link to this structure',
      onClick: handleCopyLink,
      active: linkCopied,
      disabled: !hasMolecule || !linkSource,
    },
  ], [onHomeView, setAutoRotate, autoRotate, hasMolecule, onExport, linkCopied, handleCopyLink, linkSource, structureCount]);

  const undoRedoButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Undo2 size={18} />,
      label: 'Undo',
      shortcut: 'Ctrl+Z',
      onClick: () => undo(),
      disabled: pastStates.length === 0,
    },
    {
      icon: <Redo2 size={18} />,
      label: 'Redo',
      shortcut: 'Ctrl+Y',
      onClick: () => redo(),
      disabled: futureStates.length === 0,
    },
  ], [undo, redo, pastStates.length, futureStates.length]);

  const helpButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Keyboard size={18} />,
      label: 'Shortcuts',
      shortcut: '?',
      onClick: () => onShowShortcuts?.(),
    },
  ], [onShowShortcuts]);

  // Phones: Undo/Redo and the View group move into the "More" menu (CSS
  // decides which one shows, so both are always rendered).
  const [menuOpen, setMenuOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtons = useMemo(() => [...undoRedoButtons, ...viewButtons], [undoRedoButtons, viewButtons]);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) moreButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeMenu(true);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
      items[(next + items.length) % items.length].focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menuOpen, closeMenu]);

  const renderButtonGroup = (buttons: ToolbarButton[], onboardingId?: string, className?: string) => (
    <div className={clsx(styles.toolbarGroup, className)} data-onboarding={onboardingId}>
      {buttons.map((button, index) => (
        <button
          key={index}
          className={clsx(styles.toolbarButton, button.active && styles.active)}
          onClick={button.onClick}
          disabled={button.disabled}
          title={buttonTitle(button)}
          aria-label={button.label}
          aria-keyshortcuts={ariaKeyShortcuts(button.shortcut)}
          aria-pressed={button.toggle ? !!button.active : undefined}
        >
          {button.icon}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.toolbarDock} ref={dockRef}>
      <div className={styles.toolbar} data-testid="toolbar">
        {renderButtonGroup(representationButtons, 'repr-buttons')}
        <div className={styles.toolbarDivider} />
        {renderButtonGroup(measurementButtons, 'measurement-buttons')}
        <div className={clsx(styles.toolbarDivider, styles.wideOnly)} />
        {renderButtonGroup(undoRedoButtons, undefined, styles.wideOnly)}
        <div className={clsx(styles.toolbarDivider, styles.wideOnly)} />
        {renderButtonGroup(viewButtons, 'view-buttons', styles.wideOnly)}
        <div className={clsx(styles.toolbarGroup, styles.moreGroup)}>
          <button
            ref={moreButtonRef}
            className={clsx(styles.toolbarButton, menuOpen && styles.active)}
            onClick={() => setMenuOpen(open => !open)}
            title="More"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-onboarding="more-menu"
          >
            <Ellipsis size={18} />
          </button>
        </div>
        <div className={clsx(styles.toolbarDivider, styles.helpDivider)} />
        <div className={styles.helpGroup}>
          {helpButtons.map((button, index) => (
            <button
              key={index}
              className={clsx(styles.toolbarButton, button.active && styles.active)}
              onClick={button.onClick}
              disabled={button.disabled}
              title={buttonTitle(button)}
              aria-label={button.label}
              aria-keyshortcuts={ariaKeyShortcuts(button.shortcut)}
            >
              {button.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Outside .toolbar: on phones the toolbar scrolls sideways, which would clip the menu */}
      {menuOpen && (
        <div ref={menuRef} className={styles.moreMenu} role="menu" aria-label="More actions">
          {menuButtons.map((button, index) => (
            <button
              key={index}
              // A toggle (Auto Rotate) announces its state, as aria-pressed does in the toolbar
              role={button.toggle ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={button.toggle ? !!button.active : undefined}
              className={clsx(styles.menuItem, button.active && styles.menuItemActive)}
              onClick={() => {
                // Back to "More", so a keyboard or screen reader isn't left on
                // nothing. After a tap the programmatic focus shows no ring.
                closeMenu(true);
                button.onClick();
              }}
              disabled={button.disabled}
              title={button.title}
            >
              {button.icon}
              <span>{button.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
