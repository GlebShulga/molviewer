import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectActiveStructureMolecule } from '../../store/selectors';
import {
  analyzeResidues,
  getOneLetterCode,
  isAminoAcid,
  residueId,
  residueLabel,
  type Residue,
} from '../../utils/residueAnalysis';
import { CollapsibleSection } from './CollapsibleSection';
import { getChainColor } from '../../constants/elements';
import styles from './ResidueNavigator.module.css';

interface ResidueRowProps {
  residue: Residue;
  isHovered: boolean;
  isAmino: boolean;
  onSelect: () => void;
  onHover: (residue: Residue | null) => void;
}

function ResidueRow({ residue, isHovered, isAmino, onSelect, onHover }: ResidueRowProps) {
  const hoveredRef = useRef(isHovered);
  const onHoverRef = useRef(onHover);
  useEffect(() => {
    hoveredRef.current = isHovered;
    onHoverRef.current = onHover;
  });
  // The browser fires no mouseleave for a button that goes away under the
  // pointer (search, chain or section collapsed, structure changed): end the
  // hover here, or the atom stays highlighted in 3D
  useEffect(() => () => {
    if (hoveredRef.current) onHoverRef.current(null);
  }, []);

  return (
    <button
      className={clsx(styles.residueItem, isHovered && styles.hovered)}
      onClick={onSelect}
      onMouseEnter={() => onHover(residue)}
      onMouseLeave={() => onHover(null)}
    >
      <span className={styles.residueCode}>
        {isAmino ? getOneLetterCode(residue.name) : residue.name}
      </span>
      <span className={styles.residueNumber}>{residueLabel(residue.number, residue.insertionCode)}</span>
      <span className={styles.residueName}>{residue.name}</span>
    </button>
  );
}

/** Both callbacks name the structure the residue belongs to: the active one. */
export interface ResidueNavigatorProps {
  onResidueSelect?: (structureId: string, residue: Residue) => void;
  onResidueHover?: (structureId: string, residue: Residue | null) => void;
}

export function ResidueNavigator({
  onResidueSelect,
  onResidueHover,
}: ResidueNavigatorProps) {
  const molecule = useMoleculeStore(selectActiveStructureMolecule);
  const structureId = useMoleculeStore(s => s.activeStructureId);
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredResidue, setHoveredResidue] = useState<string | null>(null);

  const chains = useMemo(() => {
    if (!molecule) return [];
    return analyzeResidues(molecule.atoms);
  }, [molecule]);

  // Only show for proteins with residue info
  const hasResidues = chains.some(
    (chain) => chain.residues.length > 0 && chain.residues[0].name !== 'UNK'
  );

  if (!molecule || !structureId || !hasResidues) {
    return null;
  }

  const toggleChain = (chainId: string) => {
    setExpandedChains((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) {
        next.delete(chainId);
      } else {
        next.add(chainId);
      }
      return next;
    });
  };

  const handleResidueHover = (residue: Residue | null) => {
    setHoveredResidue(residue ? residueId(residue.chainId, residue.name, residue.number, residue.insertionCode) : null);
    onResidueHover?.(structureId, residue);
  };

  const filterResidues = (residues: Residue[]): Residue[] => {
    if (!searchTerm) return residues;
    const term = searchTerm.toLowerCase();
    return residues.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        residueLabel(r.number, r.insertionCode).toLowerCase().includes(term) ||
        getOneLetterCode(r.name).toLowerCase() === term
    );
  };

  return (
    <CollapsibleSection title="Residues" defaultOpen={false} storageKey="residues">
      <div className={styles.residueNavigator}>
        <div className={styles.residueSearch}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Search residues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.residueSearchInput}
          />
        </div>

        <div className={styles.chainList}>
          {chains.map((chain) => {
            const isExpanded = expandedChains.has(chain.id);
            const filteredResidues = filterResidues(chain.residues);
            const chainColor = getChainColor(chain.id);

            if (searchTerm && filteredResidues.length === 0) {
              return null;
            }

            return (
              <div key={chain.id} className={styles.chainItem}>
                <button
                  className={styles.chainHeader}
                  onClick={() => toggleChain(chain.id)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <span
                    className={styles.chainBadge}
                    style={{ backgroundColor: chainColor }}
                  >
                    {chain.id}
                  </span>
                  <span className={styles.chainInfo}>
                    {chain.residues.length} residues
                  </span>
                </button>

                {isExpanded && (
                  <div className={styles.residueList}>
                    {filteredResidues.map((residue) => {
                      // Different residues, different React keys: 52 and 52A, and
                      // MET 1 and a ligand also numbered 1
                      const key = residueId(residue.chainId, residue.name, residue.number, residue.insertionCode);
                      const isHovered = hoveredResidue === key;
                      const isAmino = isAminoAcid(residue.name);

                      return (
                        <ResidueRow
                          // With the structure in the key, a row of the
                          // previous structure unmounts (and ends its hover)
                          // even when the new one has the same residue
                          key={`${structureId}:${key}`}
                          residue={residue}
                          isHovered={isHovered}
                          isAmino={isAmino}
                          onSelect={() => onResidueSelect?.(structureId, residue)}
                          onHover={handleResidueHover}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </CollapsibleSection>
  );
}
