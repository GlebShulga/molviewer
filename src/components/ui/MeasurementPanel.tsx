import clsx from 'clsx';
import { Trash2, Ruler, Triangle, Box } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  type Measurement,
  type MeasurementType,
  formatMeasurement,
  getMeasurementAtomCount,
} from '../../utils/measurements';
import styles from './MeasurementPanel.module.css';

export type MeasurementMode = 'none' | 'distance' | 'angle' | 'dihedral';

export interface MeasurementPanelProps {
  measurements: Measurement[];
  mode: MeasurementMode;
  selectedAtomIndices: number[];
  highlightedMeasurementId: string | null;
  totalAtomCount: number;
  onModeChange: (mode: MeasurementMode) => void;
  onDeleteMeasurement: (id: string) => void;
  onClearAll: () => void;
  onHighlightMeasurement: (id: string | null) => void;
}

const MODE_CONFIG: Record<MeasurementType, { icon: React.ReactNode; label: string }> = {
  distance: { icon: <Ruler size={14} />, label: 'Distance' },
  angle: { icon: <Triangle size={14} />, label: 'Angle' },
  dihedral: { icon: <Box size={14} />, label: 'Dihedral' },
};

const REQUIRED_ATOMS: Record<MeasurementType, number> = {
  distance: 2,
  angle: 3,
  dihedral: 4,
};

export function MeasurementPanel({
  measurements,
  mode,
  selectedAtomIndices,
  highlightedMeasurementId,
  totalAtomCount,
  onModeChange,
  onDeleteMeasurement,
  onClearAll,
  onHighlightMeasurement,
}: MeasurementPanelProps) {
  const activeMode = mode !== 'none' ? mode : null;
  const requiredAtoms = activeMode ? getMeasurementAtomCount(activeMode) : 0;

  const canMeasure: Record<MeasurementType, boolean> = {
    distance: totalAtomCount >= 2,
    angle: totalAtomCount >= 3,
    dihedral: totalAtomCount >= 4,
  };

  return (
    <CollapsibleSection title="Measurements" defaultOpen={false} storageKey="measurements">
      <div className={styles.measurementPanel}>
        <div className={styles.measurementModes}>
          {(['distance', 'angle', 'dihedral'] as MeasurementType[]).map((type) => {
            const disabled = !canMeasure[type];
            const title = disabled
              ? `Need at least ${REQUIRED_ATOMS[type]} atoms`
              : MODE_CONFIG[type].label;
            return (
              <button
                key={type}
                className={clsx(styles.controlButton, styles.measurementModeBtn, mode === type && styles.active)}
                onClick={() => onModeChange(mode === type ? 'none' : type)}
                title={title}
                disabled={disabled}
              >
                {MODE_CONFIG[type].icon}
                <span>{MODE_CONFIG[type].label}</span>
              </button>
            );
          })}
        </div>

        {activeMode && (
          <div className={styles.measurementStatus}>
            <span className={styles.statusText}>
              Select {requiredAtoms} atoms ({selectedAtomIndices.length}/{requiredAtoms})
            </span>
            {selectedAtomIndices.length > 0 && (
              <span className={styles.statusAtoms}>
                Atoms: {selectedAtomIndices.join(', ')}
              </span>
            )}
          </div>
        )}

        {measurements.length > 0 && (
          <div className={styles.measurementsList}>
            <div className={styles.measurementsHeader}>
              <span>Results</span>
              <button
                className={styles.clearAllBtn}
                onClick={onClearAll}
                title="Clear all measurements"
              >
                Clear All
              </button>
            </div>
            {measurements.map((measurement) => (
              <div
                key={measurement.id}
                className={clsx(styles.measurementItem, highlightedMeasurementId === measurement.id && styles.highlighted)}
                onClick={() => onHighlightMeasurement(
                  highlightedMeasurementId === measurement.id ? null : measurement.id
                )}
                title="Click to highlight in 3D view"
              >
                <span className={styles.measurementIcon}>
                  {MODE_CONFIG[measurement.type].icon}
                </span>
                <span className={styles.measurementAtoms}>
                  {measurement.atomIndices.join('-')}
                </span>
                <span className={styles.measurementValue}>
                  {formatMeasurement(measurement)}
                </span>
                <button
                  className={styles.measurementDelete}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMeasurement(measurement.id);
                  }}
                  title="Delete measurement"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
