import { Fragment, useMemo, useState, useRef, useEffect, type CSSProperties } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../../../store/moleculeStore';
import { useSelectedAtomsForStructure } from '../../../hooks';
import { selectStructureById, selectStructureExists, selectStructureNamesInOrder } from '../../../store/selectors';
import {
  analyzeResidues,
  atomResidueId,
  getOneLetterCode,
  residueId,
  residueLabel,
  isAminoAcid,
  type Residue,
} from '../../../utils/residueAnalysis';
import { getChainColor, useMolecularColors } from '../../../colors';
import { CollapsibleSection } from '../CollapsibleSection';
import styles from './SequenceViewer.module.css';

// Pure function — no component state dependencies
function getResidueSecondaryStructure(residue: Residue): 'helix' | 'sheet' | 'coil' {
  if (residue.atoms.length === 0) return 'coil';
  const ss = residue.atoms[0].secondaryStructure;
  return ss || 'coil';
}

/**
 * Scrolls the strip, and only the strip, until the residue shows.
 * scrollIntoView would also scroll the sidebar: a row hovered in the
 * Residues panel would move away from under the pointer.
 *
 * - Never while a pointer rests in the strip: moving it would slide other
 *   residues under the pointer, which highlight in turn (or, between them,
 *   the selected residue does). Only where the main pointer can hover: on
 *   touch screens :hover stays on whatever was tapped last, resting nowhere.
 * - Otherwise one rule for both layouts (wrapped rows scrolling down on
 *   wider screens, one row scrolling sideways on phones): a residue fully in
 *   view stays put; one that isn't is centred, as far as the strip can scroll.
 * - At once, not smoothly: during a smooth scroll the browser reports the
 *   strip where it was, so the next highlight would be measured wrong.
 */
function scrollStripTo(strip: HTMLElement, residue: HTMLElement): void {
  if (window.matchMedia('(hover: hover)').matches && strip.matches(':hover')) return;
  const area = strip.getBoundingClientRect();
  const top = area.top + strip.clientTop;
  const left = area.left + strip.clientLeft;
  const box = residue.getBoundingClientRect();

  const inView =
    box.top >= top && box.bottom <= top + strip.clientHeight &&
    box.left >= left && box.right <= left + strip.clientWidth;
  if (inView) return;
  strip.scrollTo({
    top: strip.scrollTop + box.top + box.height / 2 - (top + strip.clientHeight / 2),
    left: strip.scrollLeft + box.left + box.width / 2 - (left + strip.clientWidth / 2),
    behavior: 'instant',
  });
}

interface SequenceViewerProps {
  /** The panel's own structure (not necessarily the active one) and the residue's atoms. */
  onResidueClick?: (structureId: string, atomIndices: number[]) => void;
  onResidueHover?: (structureId: string, residue: Residue | null) => void;
}

export function SequenceViewer({ onResidueClick, onResidueHover }: SequenceViewerProps) {
  // Use useShallow to stabilize references and avoid getSnapshot caching errors
  const {
    structureOrder,
    activeStructureId,
    setActiveStructure,
    hoveredAtomIndex,
    hoveredStructureId,
  } = useMoleculeStore(useShallow(state => ({
    structureOrder: state.structureOrder,
    activeStructureId: state.activeStructureId,
    setActiveStructure: state.setActiveStructure,
    hoveredAtomIndex: state.hoveredAtomIndex,
    hoveredStructureId: state.hoveredStructureId,
  })));

  // Get structure names using memoized selector (no useShallow needed - selector is memoized)
  const structureNames = useMoleculeStore(selectStructureNamesInOrder);

  // Get current structure - use active structure or first structure
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  // Use selector to check if localSelectedId exists (stable reference)
  const localIdExistsSelector = useMemo(
    () => selectStructureExists(localSelectedId || ''),
    [localSelectedId]
  );
  const localIdExists = useMoleculeStore(localIdExistsSelector);

  // Sync with active structure - no structures dependency
  useEffect(() => {
    if (activeStructureId && (!localSelectedId || !localIdExists)) {
      setLocalSelectedId(activeStructureId);
    } else if (!localSelectedId && structureOrder.length > 0) {
      setLocalSelectedId(structureOrder[0]);
    }
  }, [activeStructureId, localSelectedId, localIdExists, structureOrder]);

  const selectedStructureId = localSelectedId;

  // Use selector to get structure (stable reference)
  const structureSelector = useMemo(
    () => selectStructureById(selectedStructureId || ''),
    [selectedStructureId]
  );
  const currentStructure = useMoleculeStore(structureSelector);
  const molecule = currentStructure?.molecule;

  // Handle structure selection change
  const handleStructureChange = (id: string) => {
    setLocalSelectedId(id);
    setActiveStructure(id);
  };

  // Selected atom indices for current structure using the new hook
  const selectedAtomRefs = useSelectedAtomsForStructure(selectedStructureId || '');
  const selectedAtomIndices = useMemo(
    () => selectedAtomRefs.map(ref => ref.atomIndex),
    [selectedAtomRefs]
  );
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [hoveredResidue, setHoveredResidue] = useState<string | null>(null);
  const sequenceRef = useRef<HTMLDivElement>(null);
  // The 3D view's colors (Cartoon, Structure scheme), so the sequence and its
  // legend match the molecule and the legend over the viewer
  const { secondaryStructure: ssColors } = useMolecularColors();
  const ssColorVars = {
    '--ss-helix': ssColors.helix,
    '--ss-sheet': ssColors.sheet,
    '--ss-coil': ssColors.coil,
  } as CSSProperties;

  // Analyze residues and chains
  const chains = useMemo(() => {
    if (!molecule) return [];
    return analyzeResidues(molecule.atoms);
  }, [molecule]);

  // Filter to only show protein chains (with amino acids)
  const proteinChains = useMemo(() => {
    return chains.filter(chain =>
      chain.residues.some(r => isAminoAcid(r.name))
    );
  }, [chains]);

  // Reset active chain when structure changes or set to first protein chain
  useEffect(() => {
    if (proteinChains.length > 0) {
      setActiveChain(proteinChains[0].id);
    }
  }, [selectedStructureId, proteinChains]);

  // The residue (residueId) of the hovered or selected atom: by name too,
  // so a ligand numbered like a residue doesn't highlight that residue
  const highlightedResidueId = useMemo(() => {
    if (!molecule) return null;

    // Check hovered atom first - only if hovering on the selected structure
    if (hoveredAtomIndex !== null && hoveredStructureId === selectedStructureId) {
      const atom = molecule.atoms[hoveredAtomIndex];
      if (atom && atom.residueNumber !== undefined) return atomResidueId(atom);
    }

    // Then check selected atoms for this structure
    if (selectedAtomIndices.length > 0) {
      const atom = molecule.atoms[selectedAtomIndices[selectedAtomIndices.length - 1]];
      if (atom && atom.residueNumber !== undefined) return atomResidueId(atom);
    }

    return null;
  }, [molecule, hoveredAtomIndex, hoveredStructureId, selectedStructureId, selectedAtomIndices]);

  // Scroll to the highlighted residue (found by its data-highlighted mark:
  // an id can hold any character a selector would need escaped)
  useEffect(() => {
    if (highlightedResidueId && sequenceRef.current) {
      const element = sequenceRef.current.querySelector<HTMLElement>('[data-highlighted]');
      if (element) scrollStripTo(sequenceRef.current, element);
    }
  }, [highlightedResidueId]);

  const activeChainData = proteinChains.find(c => c.id === activeChain);
  const activeChainResidues = useMemo(
    () => activeChainData?.residues.filter(r => isAminoAcid(r.name)) ?? [],
    [activeChainData]
  );

  // Don't render if no protein chains
  if (proteinChains.length === 0) {
    return null;
  }

  const handleResidueClick = (residue: Residue) => {
    if (onResidueClick && selectedStructureId) {
      onResidueClick(selectedStructureId, residue.atomIndices);
    }
  };

  const handleResidueHover = (residue: Residue | null) => {
    setHoveredResidue(residue ? residueId(residue.chainId, residue.name, residue.number, residue.insertionCode) : null);
    if (selectedStructureId) onResidueHover?.(selectedStructureId, residue);
  };

  return (
    <CollapsibleSection title="Sequence" defaultOpen={true} storageKey="sequence">
      <div className={styles.sequenceViewer} style={ssColorVars}>
        {/* Structure selector - only show when multiple structures */}
        {structureOrder.length > 1 && (
          <div className={styles.structureSelector}>
            <select
              value={selectedStructureId || ''}
              onChange={(e) => handleStructureChange(e.target.value)}
              className={styles.structureSelect}
            >
              {structureNames.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Chain tabs */}
        {proteinChains.length > 1 && (
          <div className={styles.chainTabs}>
            {proteinChains.map(chain => (
              <button
                key={chain.id}
                className={clsx(
                  styles.chainTab,
                  activeChain === chain.id && styles.activeChainTab
                )}
                onClick={() => setActiveChain(chain.id)}
                style={{
                  '--chain-color': getChainColor(chain.id),
                } as CSSProperties}
              >
                <span className={styles.chainBadge}>{chain.id}</span>
                <span className={styles.chainLength}>
                  {chain.residues.filter(r => isAminoAcid(r.name)).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Sequence display */}
        {activeChainData && (
          <div className={styles.sequenceContainer} ref={sequenceRef}>
            <div className={styles.sequence}>
              {activeChainResidues.map((residue, index) => {
                // Different residues, different React keys: 52 and 52A
                const key = residueId(residue.chainId, residue.name, residue.number, residue.insertionCode);
                const label = residueLabel(residue.number, residue.insertionCode);
                const isHighlighted = key === highlightedResidueId;
                const isHovered = key === hoveredResidue;
                const ss = getResidueSecondaryStructure(residue);

                return (
                  <Fragment key={key}>
                    {/* Group label before every 10-residue block */}
                    {index % 10 === 0 && (
                      <span className={styles.groupLabel}>{label}</span>
                    )}
                    <button
                      data-residue-key={key}
                      data-residue-chain={residue.chainId}
                      data-residue={label}
                      data-highlighted={isHighlighted || undefined}
                      className={clsx(
                        styles.residue,
                        isHighlighted && styles.highlighted,
                        isHovered && styles.hovered,
                        ss === 'helix' && styles.helix,
                        ss === 'sheet' && styles.sheet,
                        ss === 'coil' && styles.coil
                      )}
                      onClick={() => handleResidueClick(residue)}
                      onMouseEnter={() => handleResidueHover(residue)}
                      onMouseLeave={() => handleResidueHover(null)}
                      title={`${residue.name} ${label} (${ss})`}
                    >
                      <span className={styles.residueCode}>
                        {getOneLetterCode(residue.name)}
                      </span>
                    </button>
                    {/* Spacer after every 10th residue */}
                    {(index + 1) % 10 === 0 && (
                      <span className={styles.groupSpacer} />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: ssColors.helix }} />
            <span>Helix</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: ssColors.sheet }} />
            <span>Sheet</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: ssColors.coil }} />
            <span>Coil</span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
