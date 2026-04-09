import { useMemo, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { useActiveStructure } from '../../hooks';
import { buildShareUrl } from '../../utils/urlParams';
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
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

const REPRESENTATION_ICONS = {
  'ball-and-stick': <Hexagon size={18} />,
  'stick': <Maximize size={18} style={{ transform: 'rotate(45deg)' }} />,
  'spacefill': <Circle size={18} />,
} as const;

export function Toolbar({
  measurementMode = 'none',
  onMeasurementModeChange,
  onExport,
  onHomeView,
  onShowShortcuts,
}: ToolbarProps) {
  // Use new hook for active structure access
  const activeStructure = useActiveStructure();
  const { setRepresentation, autoRotate, setAutoRotate, moleculeSource } = useMoleculeStore(useShallow(state => ({
    setRepresentation: state.setRepresentation,
    autoRotate: state.autoRotate,
    setAutoRotate: state.setAutoRotate,
    moleculeSource: state.moleculeSource,
  })));

  // Copy link state
  const [linkCopied, setLinkCopied] = useState(false);
  const handleCopyLink = useCallback(() => {
    const repr = activeStructure?.representation;
    const color = activeStructure?.colorScheme;
    const url = buildShareUrl({
      pdbId: moleculeSource?.type === 'rcsb' ? moleculeSource.id : undefined,
      uniprotId: moleculeSource?.type === 'alphafold' ? moleculeSource.id : undefined,
      externalUrl: moleculeSource?.type === 'url' ? moleculeSource.url : undefined,
      repr,
      color,
    });
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      // Clipboard API can fail in iframes or older browsers — ignore silently
    });
  }, [activeStructure, moleculeSource]);

  // Get undo/redo state from temporal store
  const { pastStates, futureStates, undo, redo } = useStore(temporalStore);

  // Derive molecule and representation from active structure
  const molecule = activeStructure?.molecule ?? null;
  const representation = activeStructure?.representation ?? 'ball-and-stick';
  const hasMolecule = !!molecule;

  const representationButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: REPRESENTATION_ICONS['ball-and-stick'],
      label: 'Ball & Stick (1)',
      onClick: () => setRepresentation('ball-and-stick'),
      active: representation === 'ball-and-stick',
      disabled: !hasMolecule,
    },
    {
      icon: REPRESENTATION_ICONS['stick'],
      label: 'Stick (2)',
      onClick: () => setRepresentation('stick'),
      active: representation === 'stick',
      disabled: !hasMolecule,
    },
    {
      icon: REPRESENTATION_ICONS['spacefill'],
      label: 'Spacefill (3)',
      onClick: () => setRepresentation('spacefill'),
      active: representation === 'spacefill',
      disabled: !hasMolecule,
    },
  ], [setRepresentation, representation, hasMolecule]);

  const measurementButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Ruler size={18} />,
      label: 'Distance (D)',
      onClick: () => onMeasurementModeChange?.(measurementMode === 'distance' ? 'none' : 'distance'),
      active: measurementMode === 'distance',
      disabled: !hasMolecule,
    },
    {
      icon: <Triangle size={18} />,
      label: 'Angle (A)',
      onClick: () => onMeasurementModeChange?.(measurementMode === 'angle' ? 'none' : 'angle'),
      active: measurementMode === 'angle',
      disabled: !hasMolecule,
    },
  ], [onMeasurementModeChange, measurementMode, hasMolecule]);

  const viewButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Home size={18} />,
      label: 'Reset View (H)',
      onClick: () => onHomeView?.(),
      disabled: !hasMolecule,
    },
    {
      icon: <RotateCw size={18} />,
      label: 'Auto Rotate (R)',
      onClick: () => setAutoRotate(!autoRotate),
      active: autoRotate,
      disabled: !hasMolecule,
    },
    {
      icon: <Camera size={18} />,
      label: 'Export (Ctrl+S)',
      onClick: () => onExport?.(),
      disabled: !hasMolecule,
    },
    {
      icon: linkCopied ? <Check size={18} /> : <Link size={18} />,
      label: linkCopied ? 'Link Copied!' : 'Copy Link',
      onClick: handleCopyLink,
      active: linkCopied,
      disabled: !hasMolecule || !moleculeSource,
    },
  ], [onHomeView, setAutoRotate, autoRotate, hasMolecule, onExport, linkCopied, handleCopyLink, moleculeSource]);

  const undoRedoButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Undo2 size={18} />,
      label: 'Undo (Ctrl+Z)',
      onClick: () => undo(),
      disabled: pastStates.length === 0,
    },
    {
      icon: <Redo2 size={18} />,
      label: 'Redo (Ctrl+Y)',
      onClick: () => redo(),
      disabled: futureStates.length === 0,
    },
  ], [undo, redo, pastStates.length, futureStates.length]);

  const helpButtons = useMemo<ToolbarButton[]>(() => [
    {
      icon: <Keyboard size={18} />,
      label: 'Shortcuts (?)',
      onClick: () => onShowShortcuts?.(),
    },
  ], [onShowShortcuts]);

  const renderButtonGroup = (buttons: ToolbarButton[], onboardingId?: string) => (
    <div className={styles.toolbarGroup} data-onboarding={onboardingId}>
      {buttons.map((button, index) => (
        <button
          key={index}
          className={clsx(styles.toolbarButton, button.active && styles.active)}
          onClick={button.onClick}
          disabled={button.disabled}
          title={button.label}
          aria-label={button.label}
          aria-pressed={button.active}
        >
          {button.icon}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.toolbar}>
      {renderButtonGroup(representationButtons, 'repr-buttons')}
      <div className={styles.toolbarDivider} />
      {renderButtonGroup(measurementButtons, 'measurement-buttons')}
      <div className={styles.toolbarDivider} />
      {renderButtonGroup(undoRedoButtons)}
      <div className={styles.toolbarDivider} />
      {renderButtonGroup(viewButtons, 'view-buttons')}
      <div className={clsx(styles.toolbarDivider, styles.helpDivider)} />
      <div className={styles.helpGroup}>
        {helpButtons.map((button, index) => (
          <button
            key={index}
            className={clsx(styles.toolbarButton, button.active && styles.active)}
            onClick={button.onClick}
            disabled={button.disabled}
            title={button.label}
            aria-label={button.label}
          >
            {button.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
