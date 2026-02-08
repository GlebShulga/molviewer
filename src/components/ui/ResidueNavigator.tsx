import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectActiveStructureMolecule } from '../../store/selectors';
import {
  analyzeResidues,
  getOneLetterCode,
  isAminoAcid,
  type Residue,
} from '../../utils/residueAnalysis';
import { CollapsibleSection } from './CollapsibleSection';
import { getChainColor } from '../../constants/elements';
import styles from './ResidueNavigator.module.css';

export interface ResidueNavigatorProps {
  onResidueSelect?: (residue: Residue) => void;
  onResidueHover?: (residue: Residue | null) => void;
}

export function ResidueNavigator({
  onResidueSelect,
  onResidueHover,
}: ResidueNavigatorProps) {
  const molecule = useMoleculeStore(selectActiveStructureMolecule);
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

  if (!molecule || !hasResidues) {
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
    setHoveredResidue(residue ? `${residue.chainId}-${residue.number}` : null);
    onResidueHover?.(residue);
  };

  const filterResidues = (residues: Residue[]): Residue[] => {
    if (!searchTerm) return residues;
    const term = searchTerm.toLowerCase();
    return residues.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.number.toString().includes(term) ||
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
                      const residueKey = `${residue.chainId}-${residue.number}`;
                      const isHovered = hoveredResidue === residueKey;
                      const isAmino = isAminoAcid(residue.name);

                      return (
                        <button
                          key={residueKey}
                          className={clsx(styles.residueItem, isHovered && styles.hovered)}
                          onClick={() => onResidueSelect?.(residue)}
                          onMouseEnter={() => handleResidueHover(residue)}
                          onMouseLeave={() => handleResidueHover(null)}
                        >
                          <span className={styles.residueCode}>
                            {isAmino ? getOneLetterCode(residue.name) : residue.name}
                          </span>
                          <span className={styles.residueNumber}>{residue.number}</span>
                          <span className={styles.residueName}>{residue.name}</span>
                        </button>
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
