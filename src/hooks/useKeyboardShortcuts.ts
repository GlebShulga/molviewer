import { useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, temporalStore } from '../store/moleculeStore';
import { selectActiveStructure, selectSelectedAtomIndices } from '../store/selectors';

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  };
}

export function useKeyboardShortcuts(
  onExport?: () => void,
  onShowHelp?: () => void,
  onHomeView?: () => void,
) {
  // Use selectors for stable references
  const activeStructure = useMoleculeStore(selectActiveStructure);
  const selectedAtomIndices = useMoleculeStore(selectSelectedAtomIndices);
  const {
    setRepresentation,
    measurementMode,
    setMeasurementMode,
    clearSelection,
    undoLastSelection,
    autoRotate,
    setAutoRotate,
  } = useMoleculeStore(useShallow(state => ({
    setRepresentation: state.setRepresentation,
    measurementMode: state.measurementMode,
    setMeasurementMode: state.setMeasurementMode,
    clearSelection: state.clearSelection,
    undoLastSelection: state.undoLastSelection,
    autoRotate: state.autoRotate,
    setAutoRotate: state.setAutoRotate,
  })));

  const hasMolecule = !!activeStructure?.molecule;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;

      // Representation shortcuts (only when molecule loaded)
      if (hasMolecule) {
        switch (key) {
          case '1':
            setRepresentation('ball-and-stick');
            event.preventDefault();
            return;
          case '2':
            setRepresentation('stick');
            event.preventDefault();
            return;
          case '3':
            setRepresentation('spacefill');
            event.preventDefault();
            return;
          case 'd':
            if (!ctrl) {
              setMeasurementMode(measurementMode === 'distance' ? 'none' : 'distance');
              event.preventDefault();
            }
            return;
          case 'a':
            if (!ctrl) {
              setMeasurementMode(measurementMode === 'angle' ? 'none' : 'angle');
              event.preventDefault();
            }
            return;
          case 'r':
            if (!ctrl) {
              setAutoRotate(!autoRotate);
              event.preventDefault();
            }
            return;
        }
      }

      // General shortcuts
      switch (key) {
        case 'z':
          if (ctrl && !event.shiftKey) {
            event.preventDefault();
            temporalStore.getState().undo();
          } else if (ctrl && event.shiftKey) {
            event.preventDefault();
            temporalStore.getState().redo();
          }
          break;
        case 'y':
          if (ctrl) {
            event.preventDefault();
            temporalStore.getState().redo();
          }
          break;
        case 's':
          if (ctrl && onExport) {
            event.preventDefault();
            onExport();
          }
          break;
        case 'h':
          if (!ctrl && onHomeView) {
            event.preventDefault();
            onHomeView();
          }
          break;
        case '?':
          if (onShowHelp) {
            event.preventDefault();
            onShowHelp();
          }
          break;
        case 'escape':
          clearSelection();
          setMeasurementMode('none');
          event.preventDefault();
          break;
        case 'backspace':
          if (measurementMode !== 'none') {
            if (selectedAtomIndices.length > 0) {
              undoLastSelection();
            } else {
              // Cancel measurement mode if no atoms selected
              setMeasurementMode('none');
            }
            event.preventDefault();
          }
          break;
      }
    },
    [hasMolecule, setRepresentation, measurementMode, setMeasurementMode, clearSelection, undoLastSelection, selectedAtomIndices, autoRotate, setAutoRotate, onExport, onShowHelp, onHomeView]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: '1', description: 'Ball & Stick representation', action: () => {} },
  { key: '2', description: 'Stick representation', action: () => {} },
  { key: '3', description: 'Spacefill representation', action: () => {} },
  { key: 'D', description: 'Distance measurement tool', action: () => {} },
  { key: 'A', description: 'Angle measurement tool', action: () => {} },
  { key: 'H', description: 'Home view', action: () => {} },
  { key: 'R', description: 'Toggle auto-rotate', action: () => {} },
  { key: 'Ctrl+S', description: 'Export screenshot', action: () => {}, modifiers: { ctrl: true } },
  { key: 'Ctrl+Z', description: 'Undo', action: () => {}, modifiers: { ctrl: true } },
  { key: 'Ctrl+Y', description: 'Redo', action: () => {}, modifiers: { ctrl: true } },
  { key: 'Ctrl+Shift+Z', description: 'Redo', action: () => {}, modifiers: { ctrl: true, shift: true } },
  { key: '?', description: 'Show keyboard shortcuts', action: () => {} },
  { key: 'Esc', description: 'Clear selection', action: () => {} },
  { key: 'Backspace', description: 'Undo last atom selection or cancel measurement mode', action: () => {} },
];
