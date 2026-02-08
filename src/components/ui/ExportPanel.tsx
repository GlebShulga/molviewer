import { useState } from 'react';
import clsx from 'clsx';
import { Download } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  EXPORT_RESOLUTIONS,
  EXPORT_BACKGROUNDS,
  DEFAULT_EXPORT_SETTINGS,
} from '../../config/export';
import { useActiveStructure } from '../../hooks';
import styles from './ExportPanel.module.css';

export interface ExportPanelProps {
  onExport?: (options: { scale: number; background: string | null; filename: string }) => void;
}

export function ExportPanel({ onExport }: ExportPanelProps) {
  // Use new hook for active structure access
  const activeStructure = useActiveStructure();
  const molecule = activeStructure?.molecule ?? null;

  const [scale, setScale] = useState(DEFAULT_EXPORT_SETTINGS.resolution);
  const [background, setBackground] = useState<string | null>(DEFAULT_EXPORT_SETTINGS.background);
  const [filename, setFilename] = useState(DEFAULT_EXPORT_SETTINGS.filename);

  if (!molecule) return null;

  const handleExport = () => {
    onExport?.({ scale, background, filename: filename || molecule.name });
  };

  return (
    <CollapsibleSection title="Export" defaultOpen={false} storageKey="export">
      <div className={styles.exportPanel}>
        <div className={styles.exportField}>
          <label className={styles.exportLabel}>Filename</label>
          <input
            type="text"
            className={styles.exportInput}
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder={molecule.name}
          />
        </div>

        <div className={styles.exportField}>
          <label className={styles.exportLabel}>Resolution</label>
          <div className={styles.exportOptions}>
            {EXPORT_RESOLUTIONS.map((res) => (
              <button
                key={res.scale}
                className={clsx(styles.controlButton, scale === res.scale && styles.active)}
                onClick={() => setScale(res.scale)}
              >
                {res.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.exportField}>
          <label className={styles.exportLabel}>Background</label>
          <div className={styles.exportOptions}>
            {EXPORT_BACKGROUNDS.map((bg) => (
              <button
                key={bg.label}
                className={clsx(styles.controlButton, background === bg.value && styles.active)}
                onClick={() => setBackground(bg.value)}
              >
                {bg.label}
              </button>
            ))}
          </div>
        </div>

        <button className={styles.exportButton} onClick={handleExport}>
          <Download size={16} />
          Export PNG
        </button>
      </div>
    </CollapsibleSection>
  );
}
