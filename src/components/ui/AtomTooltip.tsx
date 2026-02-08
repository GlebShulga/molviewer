import { useMemo } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectHoveredStructureMolecule } from '../../store/selectors';
import { analyzeAtom } from '../../utils/atomAnalysis';
import styles from './AtomTooltip.module.css';

export function AtomTooltip() {
  const { hoveredAtom, hoverPosition } = useMoleculeStore(useShallow(state => ({
    hoveredAtom: state.hoveredAtom,
    hoverPosition: state.hoverPosition,
  })));
  const molecule = useMoleculeStore(selectHoveredStructureMolecule);

  const analysis = useMemo(() => {
    if (!hoveredAtom || !molecule) return null;
    return analyzeAtom(hoveredAtom, molecule.bonds, molecule.atoms);
  }, [hoveredAtom, molecule]);

  if (!hoveredAtom || !hoverPosition || !analysis) {
    return null;
  }

  const { element } = analysis;

  return (
    <div
      className={styles.atomTooltip}
      role="tooltip"
      aria-live="polite"
      style={{
        left: hoverPosition.x + 10,
        top: hoverPosition.y + 10,
      }}
    >
      <div className={styles.tooltipHeader}>
        <div className={styles.tooltipElement} style={{ color: element.color }}>
          {element.symbol}
        </div>
        <div className={styles.tooltipElementInfo}>
          <div className={styles.tooltipName}>{element.name}</div>
          <div className={styles.tooltipAtomic}>
            #{element.atomicNumber} · {element.atomicMass.toFixed(3)} Da
          </div>
        </div>
      </div>

      {hoveredAtom.name && (
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipLabel}>Atom Name</span>
          <span className={styles.tooltipValue}>{hoveredAtom.name}</span>
        </div>
      )}

      {hoveredAtom.serial !== undefined && (
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipLabel}>Serial</span>
          <span className={styles.tooltipValue}>#{hoveredAtom.serial}</span>
        </div>
      )}

      {hoveredAtom.residueName && (
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipLabel}>Residue</span>
          <span className={clsx(styles.tooltipValue, styles.tooltipResidue)}>
            {hoveredAtom.residueName} {hoveredAtom.residueNumber}
            {hoveredAtom.chainId && ` (${hoveredAtom.chainId})`}
          </span>
        </div>
      )}

      <div className={styles.tooltipDivider} />

      <div className={styles.tooltipRow}>
        <span className={styles.tooltipLabel}>VdW Radius</span>
        <span className={styles.tooltipValue}>{element.vdwRadius.toFixed(2)} Å</span>
      </div>

      <div className={styles.tooltipRow}>
        <span className={styles.tooltipLabel}>Covalent Radius</span>
        <span className={styles.tooltipValue}>{element.covalentRadius.toFixed(2)} Å</span>
      </div>

      <div className={styles.tooltipRow}>
        <span className={styles.tooltipLabel}>Connections</span>
        <span className={styles.tooltipValue}>{analysis.connectedAtomCount}</span>
      </div>

      {hoveredAtom.occupancy !== undefined && (
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipLabel}>Occupancy</span>
          <span className={styles.tooltipValue}>{(hoveredAtom.occupancy * 100).toFixed(0)}%</span>
        </div>
      )}

      {hoveredAtom.tempFactor !== undefined && (
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipLabel}>B-factor</span>
          <span className={styles.tooltipValue}>{hoveredAtom.tempFactor.toFixed(2)}</span>
        </div>
      )}

      <div className={styles.tooltipDivider} />

      <div className={styles.tooltipCoords}>
        <span className={styles.tooltipLabel}>Position</span>
        <span className={clsx(styles.tooltipValue, styles.coordsValue)}>
          ({hoveredAtom.x.toFixed(3)}, {hoveredAtom.y.toFixed(3)}, {hoveredAtom.z.toFixed(3)})
        </span>
      </div>
    </div>
  );
}
