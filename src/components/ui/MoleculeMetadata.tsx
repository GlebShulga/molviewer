import { useMemo } from 'react';
import clsx from 'clsx';
import { useActiveStructure } from '../../hooks';
import { analyzeMolecule, formatMolecularWeight } from '../../utils/moleculeAnalysis';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './MoleculeMetadata.module.css';

export function MoleculeMetadata() {
  // Use new hook for active structure access
  const activeStructure = useActiveStructure();
  const molecule = activeStructure?.molecule ?? null;

  const analysis = useMemo(() => {
    if (!molecule) return null;
    return analyzeMolecule(molecule);
  }, [molecule]);

  if (!molecule || !analysis) {
    return null;
  }

  return (
    <div className={styles.moleculeMetadata}>
      <CollapsibleSection title="Molecule Info" defaultOpen={true} storageKey="molecule-info">
        <div className={styles.metadataContent}>
          <div className={styles.metadataRow}>
            <span className={styles.metadataLabel}>Name</span>
            <span className={styles.metadataValue}>{molecule.name}</span>
          </div>
          <div className={styles.metadataRow}>
            <span className={styles.metadataLabel}>Formula</span>
            <span className={clsx(styles.metadataValue, styles.formula)}>{analysis.formula}</span>
          </div>
          <div className={styles.metadataRow}>
            <span className={styles.metadataLabel}>Mol. Weight</span>
            <span className={styles.metadataValue}>{formatMolecularWeight(analysis.molecularWeight)}</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Atom Counts" defaultOpen={false} storageKey="atom-counts">
        <table className={styles.metadataTable}>
          <thead>
            <tr>
              <th>Element</th>
              <th>Count</th>
              <th>Mass (Da)</th>
            </tr>
          </thead>
          <tbody>
            {analysis.elementCounts.map(({ element, count, data }) => (
              <tr key={element}>
                <td>
                  <span className={styles.elementBadge} style={{ color: data.uiColor ?? data.color }}>
                    {element}
                  </span>
                  <span className={styles.elementName}>{data.name}</span>
                </td>
                <td>{count}</td>
                <td>{data.atomicMass.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>{analysis.totalAtoms}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </CollapsibleSection>

      {analysis.bondCounts.length > 0 && (
        <CollapsibleSection title="Bond Counts" defaultOpen={false} storageKey="bond-counts">
          <table className={styles.metadataTable}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {analysis.bondCounts.map(({ order, count, label }) => (
                <tr key={order}>
                  <td>{label}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td><strong>{analysis.totalBonds}</strong></td>
              </tr>
            </tfoot>
          </table>
        </CollapsibleSection>
      )}

      {analysis.chainSummary.length > 0 && analysis.chainSummary[0].residueCount > 0 && (
        <CollapsibleSection title="Chains" defaultOpen={false} storageKey="chains">
          <table className={styles.metadataTable}>
            <thead>
              <tr>
                <th>Chain</th>
                <th>Residues</th>
                <th>Atoms</th>
              </tr>
            </thead>
            <tbody>
              {analysis.chainSummary.map(({ chainId, residueCount, atomCount }) => (
                <tr key={chainId}>
                  <td>{chainId}</td>
                  <td>{residueCount}</td>
                  <td>{atomCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleSection>
      )}
    </div>
  );
}
