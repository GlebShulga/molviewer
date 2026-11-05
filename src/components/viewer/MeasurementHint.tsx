import { useEffect, useRef } from 'react';
import { useMoleculeStore } from '../../store/moleculeStore';
import { formatMeasurement, getMeasurementAtomCount, type Measurement, type MeasurementType } from '../../utils/measurements';
import { usesTouch } from '../../utils/touch';
import styles from './ViewerOverlays.module.css';

/**
 * What measuring needs next: "Tap 2 atoms · 1/2" while picking, and once one
 * is done, its value ("11.69 Å · tap 2 more"), so the reset to 0/2 doesn't
 * leave people wondering what happened.
 */
export function measurementHintText(
  mode: MeasurementType,
  selectedCount: number,
  touch: boolean,
  justMeasured?: Measurement | null
): string {
  const required = getMeasurementAtomCount(mode);
  const verb = touch ? 'Tap' : 'Click';
  if (selectedCount === 0 && justMeasured) {
    return `${formatMeasurement(justMeasured)} · ${verb.toLowerCase()} ${required} more`;
  }
  return `${verb} ${required} atoms · ${Math.min(selectedCount, required)}/${required}`;
}

/**
 * Shown over the viewer while a measurement mode is on, so people on phones
 * (where the panel is in the closed sheet) know what to do and how to stop.
 */
export function MeasurementHint() {
  const mode = useMoleculeStore((s) => s.measurementMode);
  const selectedCount = useMoleculeStore((s) => s.selectedAtoms.length);
  const measurements = useMoleculeStore((s) => s.measurements);
  const setMeasurementMode = useMoleculeStore((s) => s.setMeasurementMode);

  // Only a measurement made since this mode was turned on counts as "just measured"
  const countAtModeStart = useRef(measurements.length);
  useEffect(() => {
    countAtModeStart.current = useMoleculeStore.getState().measurements.length;
  }, [mode]);

  if (mode === 'none') return null;
  const latest = measurements.length > countAtModeStart.current ? measurements[measurements.length - 1] : null;
  const justMeasured = latest?.type === mode ? latest : null;

  return (
    <div className={styles.chip} role="status" data-testid="measurement-hint">
      <span>{measurementHintText(mode, selectedCount, usesTouch(), justMeasured)}</span>
      <button type="button" className={styles.chipButton} onClick={() => setMeasurementMode('none')}>
        Done
      </button>
    </div>
  );
}
