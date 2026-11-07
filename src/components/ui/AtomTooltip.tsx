import { useLayoutEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectHoveredStructureMolecule } from '../../store/selectors';
import { analyzeAtom } from '../../utils/atomAnalysis';
import { placeTooltip } from '../../utils/tooltipPlacement';
import { prefersDockedCards } from '../../utils/touch';
import styles from './AtomTooltip.module.css';

interface AtomTooltipProps {
  /**
   * Phones and touch screens: a compact card in the viewer's toolbar-side
   * stack, above the toolbar, instead of a tooltip over the molecule (where it
   * covered the measurement hint, the toolbar and the labels). Shown only
   * there (prefersDockedCards).
   */
  docked?: boolean;
  /**
   * The pointer tooltip leaves phones and touch screens to a docked one
   * rendered elsewhere (the main app does; embeds and the chat widget keep the
   * pointer tooltip).
   */
  allowDocking?: boolean;
}

export function AtomTooltip({ docked = false, allowDocking = false }: AtomTooltipProps) {
  const { hoveredAtom, hoverPosition } = useMoleculeStore(useShallow(state => ({
    hoveredAtom: state.hoveredAtom,
    hoverPosition: state.hoverPosition,
  })));
  const molecule = useMoleculeStore(selectHoveredStructureMolecule);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showHere = docked ? prefersDockedCards() : !(allowDocking && prefersDockedCards());

  const analysis = useMemo(() => {
    if (!hoveredAtom || !molecule) return null;
    return analyzeAtom(hoveredAtom, molecule.bonds, molecule.atoms);
  }, [hoveredAtom, molecule]);

  // Measure the rendered tooltip and keep it inside the viewport, before paint
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el || !hoverPosition) return;
    const { left, top } = placeTooltip(
      hoverPosition,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });

  if (!showHere || !hoveredAtom || !hoverPosition || !analysis) {
    return null;
  }

  const { element } = analysis;

  if (docked) {
    return (
      <div className={styles.dockedCard} role="status" data-testid="atom-card">
        <div className={styles.tooltipElement} style={{ color: element.color }}>
          {element.symbol}
        </div>
        <div className={styles.dockedText}>
          <div className={styles.dockedTitle}>
            {element.name}
            {hoveredAtom.name && <span className={styles.dockedAtomName}>{hoveredAtom.name}</span>}
          </div>
          {hoveredAtom.residueName && (
            <div className={styles.dockedDetail}>
              {hoveredAtom.residueName} {hoveredAtom.residueNumber}{hoveredAtom.insertionCode}
              {hoveredAtom.chainId && ` · chain ${hoveredAtom.chainId}`}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={tooltipRef}
      className={styles.atomTooltip}
      role="tooltip"
      aria-live="polite"
      data-testid="atom-tooltip"
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
            {hoveredAtom.residueName} {hoveredAtom.residueNumber}{hoveredAtom.insertionCode}
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
