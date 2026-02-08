import { useMemo, useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../../../store/moleculeStore';
import { useSelectedAtomsForStructure } from '../../../hooks';
import { selectStructureById, selectStructureExists, selectStructureNamesInOrder } from '../../../store/selectors';
import {
  analyzeResidues,
  getOneLetterCode,
  isAminoAcid,
  type Residue,
} from '../../../utils/residueAnalysis';
import { getChainColor, useMolecularColors } from '../../../colors';
import { CollapsibleSection } from '../CollapsibleSection';
import styles from './SequenceViewer.module.css';

interface SequenceViewerProps {
  onResidueClick?: (atomIndices: number[]) => void;
  onResidueHover?: (residue: Residue | null) => void;
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
  const { secondaryStructureUI: ssColors } = useMolecularColors();

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

  // Set active chain to first protein chain if none selected
  useEffect(() => {
    if (proteinChains.length > 0 && !activeChain) {
      setActiveChain(proteinChains[0].id);
    }
  }, [proteinChains, activeChain]);

  // Get secondary structure for a residue
  const getResidueSecondaryStructure = (residue: Residue): 'helix' | 'sheet' | 'coil' => {
    if (residue.atoms.length === 0) return 'coil';
    const ss = residue.atoms[0].secondaryStructure;
    return ss || 'coil';
  };

  // Find the residue key that contains the hovered/selected atom
  const highlightedResidueKey = useMemo(() => {
    if (!molecule) return null;

    // Check hovered atom first - only if hovering on the selected structure
    if (hoveredAtomIndex !== null && hoveredStructureId === selectedStructureId) {
      const atom = molecule.atoms[hoveredAtomIndex];
      if (atom?.chainId && atom?.residueNumber !== undefined) {
        return `${atom.chainId}-${atom.residueNumber}`;
      }
    }

    // Then check selected atoms for this structure
    if (selectedAtomIndices.length > 0) {
      const atom = molecule.atoms[selectedAtomIndices[selectedAtomIndices.length - 1]];
      if (atom?.chainId && atom?.residueNumber !== undefined) {
        return `${atom.chainId}-${atom.residueNumber}`;
      }
    }

    return null;
  }, [molecule, hoveredAtomIndex, hoveredStructureId, selectedStructureId, selectedAtomIndices]);

  // Scroll to highlighted residue
  useEffect(() => {
    if (highlightedResidueKey && sequenceRef.current) {
      const element = sequenceRef.current.querySelector(
        `[data-residue-key="${highlightedResidueKey}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [highlightedResidueKey]);

  // Don't render if no protein chains
  if (proteinChains.length === 0) {
    return null;
  }

  const activeChainData = proteinChains.find(c => c.id === activeChain);

  const handleResidueClick = (residue: Residue) => {
    if (onResidueClick) {
      const atomIndices = residue.atoms.map((_, i) => residue.startIndex + i);
      onResidueClick(atomIndices);
    }
  };

  const handleResidueHover = (residue: Residue | null) => {
    setHoveredResidue(residue ? `${residue.chainId}-${residue.number}` : null);
    onResidueHover?.(residue);
  };

  return (
    <CollapsibleSection title="Sequence" defaultOpen={true} storageKey="sequence">
      <div className={styles.sequenceViewer}>
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
                } as React.CSSProperties}
              >
                <span className={styles.chainBadge}>{chain.id}</span>
                <span className={styles.chainLength}>
                  {chain.residues.filter(r => isAminoAcid(r.name)).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Secondary structure bar */}
        {activeChainData && (
          <div className={styles.ssBar}>
            {activeChainData.residues.filter(r => isAminoAcid(r.name)).map(residue => {
              const ss = getResidueSecondaryStructure(residue);
              return (
                <div
                  key={`ss-${residue.chainId}-${residue.number}`}
                  className={styles.ssBlock}
                  style={{ backgroundColor: ssColors[ss] }}
                  title={`${residue.name}${residue.number}: ${ss}`}
                />
              );
            })}
          </div>
        )}

        {/* Sequence display */}
        {activeChainData && (
          <div className={styles.sequenceContainer} ref={sequenceRef}>
            <div className={styles.sequence}>
              {activeChainData.residues.filter(r => isAminoAcid(r.name)).map((residue, index) => {
                const residueKey = `${residue.chainId}-${residue.number}`;
                const isHighlighted = residueKey === highlightedResidueKey;
                const isHovered = residueKey === hoveredResidue;
                const ss = getResidueSecondaryStructure(residue);

                return (
                  <button
                    key={residueKey}
                    data-residue-key={residueKey}
                    className={clsx(
                      styles.residue,
                      isHighlighted && styles.highlighted,
                      isHovered && styles.hovered,
                      ss === 'helix' && styles.helix,
                      ss === 'sheet' && styles.sheet
                    )}
                    onClick={() => handleResidueClick(residue)}
                    onMouseEnter={() => handleResidueHover(residue)}
                    onMouseLeave={() => handleResidueHover(null)}
                    title={`${residue.name}${residue.number} (${ss})`}
                  >
                    <span className={styles.residueCode}>
                      {getOneLetterCode(residue.name)}
                    </span>
                    {/* Show residue number every 10 residues */}
                    {(index + 1) % 10 === 0 && (
                      <span className={styles.residueNumber}>{residue.number}</span>
                    )}
                  </button>
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
