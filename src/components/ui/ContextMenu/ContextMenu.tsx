import { useEffect, useRef, useState } from 'react';
import {
  Focus,
  Palette,
  EyeOff,
  Tag,
  Ruler,
  Link,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../../../store/moleculeStore';
import { selectTotalVisibleAtomCount } from '../../../store/selectors';
import { chainKey, residueLabel, sameResidue } from '../../../utils/residueAnalysis';
import styles from './ContextMenu.module.css';

/** Padding from viewport edge when adjusting menu position */
const MENU_VIEWPORT_PADDING = 10;

interface ContextMenuProps {
  onFocusAtom?: (structureId: string, atomIndex: number) => void;
  onAddLabel?: (atomIndex: number) => void;
}

export function ContextMenu({ onFocusAtom, onAddLabel }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);
  const {
    structures,
    contextMenu,
    hideContextMenu,
    setMeasurementMode,
    selectAtom,
    selectAtomsByFilter,
    addLabel,
  } = useMoleculeStore(useShallow(state => ({
    structures: state.structures,
    contextMenu: state.contextMenu,
    hideContextMenu: state.hideContextMenu,
    setMeasurementMode: state.setMeasurementMode,
    selectAtom: state.selectAtom,
    selectAtomsByFilter: state.selectAtomsByFilter,
    addLabel: state.addLabel,
  })));

  const totalAtomCount = useMoleculeStore(selectTotalVisibleAtomCount);
  const canMeasure = totalAtomCount >= 2;

  // Get the molecule from the structure context
  const structureId = contextMenu.structureId || '';
  const structure = structures.get(structureId);
  const molecule = structure?.molecule;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        hideContextMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideContextMenu();
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.visible, hideContextMenu]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!contextMenu.visible) {
      setAdjustedPosition(null);
      return;
    }
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = contextMenu.x;
    let adjustedY = contextMenu.y;

    if (contextMenu.x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - MENU_VIEWPORT_PADDING;
    }
    if (contextMenu.y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - MENU_VIEWPORT_PADDING;
    }

    setAdjustedPosition({ x: adjustedX, y: adjustedY });
  }, [contextMenu.visible, contextMenu.x, contextMenu.y]);

  if (!contextMenu.visible || contextMenu.atomIndex === null || !molecule) {
    return null;
  }

  const atom = molecule.atoms[contextMenu.atomIndex];
  if (!atom) return null;

  const handleMeasureFrom = () => {
    setMeasurementMode('distance');
    // Use 2-arg signature with structureId
    selectAtom(structureId, contextMenu.atomIndex!);
    hideContextMenu();
  };

  const handleFocus = () => {
    if (onFocusAtom && contextMenu.atomIndex !== null) {
      onFocusAtom(structureId, contextMenu.atomIndex);
    }
    hideContextMenu();
  };

  const handleAddLabel = () => {
    if (contextMenu.atomIndex === null) return;

    // Build label text from atom info
    let labelText = atom.element;
    if (contextMenu.residueName && contextMenu.residueNumber !== undefined) {
      labelText = `${contextMenu.residueName}${residueLabel(contextMenu.residueNumber, atom.insertionCode)}`;
      if (atom.name) {
        labelText += ` ${atom.name}`;
      }
    }

    // Use 3-arg signature with structureId
    addLabel(structureId, contextMenu.atomIndex, labelText);
    onAddLabel?.(contextMenu.atomIndex);
    hideContextMenu();
  };

  // A file without chain IDs is one chain, 'Unknown' (chainKey)
  const chain = chainKey(atom);

  const handleSelectChain = () => {
    // Select all atoms in the same chain (batched, single state update)
    selectAtomsByFilter(structureId, (a) => chainKey(a) === chain);
    hideContextMenu();
  };

  const handleSelectResidue = () => {
    if (contextMenu.residueNumber === undefined) return;
    const atomIndex = contextMenu.atomIndex!;

    // Select all atoms in the same residue (batched, single state update):
    // chain, name, number and insertion code (sameResidue), so 52 and 52A are
    // different residues, and so are MET 1 and a ligand numbered 1
    if (atom.chainId) {
      selectAtomsByFilter(structureId, (a) => sameResidue(a, atom));
    } else {
      // Without chain IDs, segments from simulation packages restart their
      // numbering, so a residue is the run of atoms around this one with its
      // id. A file listing a residue's hydrogens apart from its heavy atoms
      // selects only the run clicked.
      const inRun = (i: number) => !molecule.atoms[i].chainId && sameResidue(molecule.atoms[i], atom);
      let first = atomIndex;
      while (first > 0 && inRun(first - 1)) first--;
      let last = atomIndex;
      while (last < molecule.atoms.length - 1 && inRun(last + 1)) last++;
      selectAtomsByFilter(structureId, (_, i) => i >= first && i <= last);
    }
    hideContextMenu();
  };

  // Build title
  let title = atom.element;
  if (contextMenu.residueName && contextMenu.residueNumber !== undefined) {
    title = `${contextMenu.residueName}${residueLabel(contextMenu.residueNumber, atom.insertionCode)} ${atom.name || atom.element}`;
  }
  if (atom.chainId) {
    title += ` (Chain ${atom.chainId})`;
  }

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{
        left: adjustedPosition?.x ?? contextMenu.x,
        top: adjustedPosition?.y ?? contextMenu.y,
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <button className={styles.closeButton} onClick={hideContextMenu} aria-label="Close menu">
          <X size={14} />
        </button>
      </div>

      <div className={styles.menuItems}>
        <button className={styles.menuItem} onClick={handleFocus}>
          <Focus size={14} />
          <span>Focus</span>
        </button>

        <button
          className={styles.menuItem}
          onClick={handleMeasureFrom}
          disabled={!canMeasure}
          title={!canMeasure ? 'Need at least 2 atoms to measure' : undefined}
        >
          <Ruler size={14} />
          <span>Measure from here</span>
        </button>

        <button className={styles.menuItem} onClick={handleAddLabel}>
          <Tag size={14} />
          <span>Add label</span>
        </button>

        <div className={styles.separator} />

        {contextMenu.residueNumber !== undefined && (
          <button className={styles.menuItem} onClick={handleSelectResidue}>
            <Link size={14} />
            <span>Select residue</span>
          </button>
        )}

        {/* Not for a file without chain IDs: its one chain is everything */}
        {atom.chainId && (
          <button className={styles.menuItem} onClick={handleSelectChain}>
            <Palette size={14} />
            <span>Select chain {atom.chainId}</span>
          </button>
        )}

        <div className={styles.separator} />

        <button className={styles.menuItem} disabled>
          <EyeOff size={14} />
          <span>Hide (coming soon)</span>
        </button>
      </div>
    </div>
  );
}
