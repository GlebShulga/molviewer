import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Box, Download, Square, Video } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  EXPORT_RESOLUTIONS,
  EXPORT_BACKGROUNDS,
  DEFAULT_EXPORT_SETTINGS,
} from '../../config/export';
import { useActiveStructure } from '../../hooks';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectVisibleStructuresBoundingBox } from '../../store/selectors';
import { viewerHandle } from '../../utils/viewerHandle';
import { track } from '../../utils/track';
import { getWatermarkText } from '../../utils/watermark';
import { buildExportFilename, downloadBlob } from '../../utils/exportImage';
import {
  getSupportedVideoFormats,
  isVideoExportSupported,
  videoExtension,
  TURNTABLE_DURATIONS,
  DEFAULT_TURNTABLE_SECONDS,
  type VideoFormat,
} from '../../utils/exportVideo';
import type { ModelFormat } from '../../utils/exportModel';
import styles from './ExportPanel.module.css';

export interface ExportPanelProps {
  onExport?: (options: { scale: number; background: string | null; filename: string }) => void;
}

/** Kept in sync with DEFAULT_STL_MM_PER_ANGSTROM in utils/exportModel (lazy-loaded). */
const DEFAULT_MM_PER_ANGSTROM = 2;

type Status = { kind: 'info' | 'error'; text: string } | null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportPanel({ onExport }: ExportPanelProps) {
  // Use new hook for active structure access
  const activeStructure = useActiveStructure();
  const molecule = activeStructure?.molecule ?? null;

  const [scale, setScale] = useState(DEFAULT_EXPORT_SETTINGS.resolution);
  const [background, setBackground] = useState<string | null>(DEFAULT_EXPORT_SETTINGS.background);
  const [filename, setFilename] = useState(DEFAULT_EXPORT_SETTINGS.filename);

  // Turntable video
  const videoSupported = useMemo(() => isVideoExportSupported(), []);
  const videoFormats = useMemo(() => (videoSupported ? getSupportedVideoFormats() : []), [videoSupported]);
  const [videoFormat, setVideoFormat] = useState<VideoFormat | null>(null);
  const [videoSeconds, setVideoSeconds] = useState<number>(DEFAULT_TURNTABLE_SECONDS);
  const [recordProgress, setRecordProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 3D model
  const [modelFormat, setModelFormat] = useState<ModelFormat>('glb');
  const [mmPerAngstrom, setMmPerAngstrom] = useState(DEFAULT_MM_PER_ANGSTROM);
  const [modelBusy, setModelBusy] = useState(false);

  const [status, setStatus] = useState<Status>(null);

  // Cancel an in-flight recording if the panel unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Extent of everything the model export writes: all visible structures,
  // with side-by-side offsets and rendered atom radii (same box the camera fits).
  const bbox = useMoleculeStore(selectVisibleStructuresBoundingBox);
  const extentA = useMemo(
    () => (bbox ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ) : null),
    [bbox]
  );

  if (!molecule) return null;

  const baseName = filename || molecule.name;
  const recording = recordProgress !== null;
  const busy = recording || modelBusy;
  const selectedVideo =
    videoFormats.find((f) => f.format === videoFormat) ?? videoFormats[0] ?? null;

  const handleExport = () => {
    onExport?.({ scale, background, filename: baseName });
  };

  const handleRecord = async () => {
    const handle = viewerHandle.get();
    if (!handle || !selectedVideo || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus(null);
    setRecordProgress(0);
    try {
      const blob = await handle.recordTurntable({
        seconds: videoSeconds,
        mimeType: selectedVideo.mimeType,
        watermark: getWatermarkText(),
        onProgress: (f) => setRecordProgress(f),
        signal: controller.signal,
      });
      if (blob) {
        const ext = videoExtension(blob.type || selectedVideo.mimeType);
        downloadBlob(blob, buildExportFilename(baseName, ext));
        setStatus({ kind: 'info', text: `Saved ${ext.toUpperCase()} video (${formatBytes(blob.size)}).` });
        track('export_video', { format: ext, seconds: videoSeconds });
      } else {
        setStatus({ kind: 'info', text: 'Recording cancelled.' });
      }
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Recording failed.' });
    } finally {
      abortRef.current = null;
      setRecordProgress(null);
    }
  };

  const handleCancelRecord = () => {
    abortRef.current?.abort();
  };

  const handleExportModel = async () => {
    const handle = viewerHandle.get();
    if (!handle || busy) return;
    setStatus(null);
    setModelBusy(true);
    // Let the busy state paint before the synchronous geometry work starts.
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const result = await handle.exportModel(modelFormat, { mmPerAngstrom });
      downloadBlob(result.blob, buildExportFilename(baseName, modelFormat));
      const dims = result.size.map((d) => d.toFixed(result.unit === 'mm' ? 0 : 1)).join(' x ');
      const reduced = result.sphereDetail.reduced ? ' Atom spheres were simplified to keep the file small.' : '';
      setStatus({
        kind: 'info',
        text: `Saved ${modelFormat.toUpperCase()}: ${result.triangles.toLocaleString()} triangles, ${dims} ${
          result.unit === 'mm' ? 'mm' : 'Å'
        }, ${formatBytes(result.blob.size)}.${reduced}`,
      });
      track('export_model', { format: modelFormat });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Model export failed.' });
    } finally {
      setModelBusy(false);
    }
  };

  const stlSizeCm = extentA !== null ? (extentA * mmPerAngstrom) / 10 : null;

  return (
    <CollapsibleSection title="Export" defaultOpen={false} storageKey="export">
      <div className={styles.exportPanel}>
        <div className={styles.exportField}>
          <label className={styles.exportLabel} htmlFor="export-filename">Filename</label>
          <input
            id="export-filename"
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

        {/* Turntable video */}
        <div className={styles.exportGroup} data-testid="export-video">
          <div className={styles.exportGroupTitle}>Turntable video</div>
          {videoSupported && selectedVideo ? (
            <>
              <div className={styles.exportField}>
                <label className={styles.exportLabel}>One full turn in</label>
                <div className={styles.exportOptions}>
                  {TURNTABLE_DURATIONS.map((s) => (
                    <button
                      key={s}
                      className={clsx(styles.controlButton, videoSeconds === s && styles.active)}
                      onClick={() => setVideoSeconds(s)}
                      disabled={busy}
                      aria-pressed={videoSeconds === s}
                    >
                      {s} s
                    </button>
                  ))}
                </div>
              </div>

              {videoFormats.length > 1 && (
                <div className={styles.exportField}>
                  <label className={styles.exportLabel}>Format</label>
                  <div className={styles.exportOptions}>
                    {videoFormats.map((f) => (
                      <button
                        key={f.format}
                        className={clsx(
                          styles.controlButton,
                          selectedVideo.format === f.format && styles.active
                        )}
                        onClick={() => setVideoFormat(f.format)}
                        disabled={busy}
                        aria-pressed={selectedVideo.format === f.format}
                        title={f.mimeType}
                      >
                        {f.format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recording ? (
                <div className={styles.progressRow}>
                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-label="Recording progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((recordProgress ?? 0) * 100)}
                  >
                    <div
                      className={styles.progressFill}
                      style={{ width: `${Math.round((recordProgress ?? 0) * 100)}%` }}
                    />
                  </div>
                  <button className={styles.controlButton} onClick={handleCancelRecord}>
                    <Square size={12} />
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className={styles.exportButton}
                  onClick={handleRecord}
                  disabled={busy}
                >
                  <Video size={16} />
                  Record {selectedVideo.format.toUpperCase()}
                </button>
              )}
              <p className={styles.exportHint}>
                Records the current view at canvas size while the camera orbits once.
              </p>
            </>
          ) : (
            <p className={styles.exportHint}>
              Video recording is not supported in this browser.
            </p>
          )}
        </div>

        {/* 3D model */}
        <div className={styles.exportGroup} data-testid="export-model">
          <div className={styles.exportGroupTitle}>3D model</div>
          <div className={styles.exportField}>
            <label className={styles.exportLabel}>Format</label>
            <div className={styles.exportOptions}>
              {(['glb', 'stl'] as const).map((f) => (
                <button
                  key={f}
                  className={clsx(styles.controlButton, modelFormat === f && styles.active)}
                  onClick={() => setModelFormat(f)}
                  disabled={busy}
                  aria-pressed={modelFormat === f}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {modelFormat === 'stl' ? (
            <div className={styles.exportField}>
              <label className={styles.exportLabel} htmlFor="export-stl-scale">
                Scale (mm per &#197;)
              </label>
              <input
                id="export-stl-scale"
                type="number"
                min={0.1}
                max={50}
                step={0.5}
                className={styles.exportInput}
                value={mmPerAngstrom}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v > 0) setMmPerAngstrom(v);
                }}
                disabled={busy}
              />
              <p className={styles.exportHint}>
                For 3D printing, no colors. {stlSizeCm !== null
                  ? `The printed model will be about ${stlSizeCm.toFixed(1)} cm across.`
                  : ''} At 2 mm per &#197; a typical 40 &#197; protein prints about 8 cm wide.
              </p>
            </div>
          ) : (
            <p className={styles.exportHint}>
              Binary glTF with colors, 1 unit = 1 &#197;. Opens in Blender, AR viewers and web 3D tools.
            </p>
          )}

          <button
            className={styles.exportButton}
            onClick={handleExportModel}
            disabled={busy}
          >
            <Box size={16} />
            {modelBusy ? 'Exporting...' : `Export ${modelFormat.toUpperCase()}`}
          </button>
        </div>

        {status && (
          <p
            className={clsx(styles.exportStatus, status.kind === 'error' && styles.exportStatusError)}
            role="status"
          >
            {status.text}
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
}
