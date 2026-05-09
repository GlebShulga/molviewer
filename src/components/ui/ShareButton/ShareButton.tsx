import { useCallback, useState } from 'react';
import { Share2, Check, Copy, X } from 'lucide-react';
import { useMoleculeStore } from '../../../store/moleculeStore';
import { viewerHandle } from '../../../utils/viewerHandle';
import {
  serializeShareableSession,
  createShareLink,
  UnshareableStructureError,
} from '../../../utils/shareSession';
import { logError } from '../../../utils/errorReporter';
import styles from './ShareButton.module.css';

export function ShareButton() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    setError(null);
    setUrl(null);
    setCreating(true);
    setOpen(true);

    try {
      const state = useMoleculeStore.getState();
      const camera = viewerHandle.get()?.getCameraSnapshot() ?? null;
      const payload = serializeShareableSession(
        {
          structureOrder: state.structureOrder,
          structures: state.structures,
          layoutMode: state.layoutMode,
          measurements: state.measurements,
          labels: state.labels,
          surfaceSettings: state.surfaceSettings,
          autoRotate: state.autoRotate,
        },
        camera
      );
      const id = await createShareLink(payload);
      const shareUrl = `${window.location.origin}/s/${id}`;
      setUrl(shareUrl);
    } catch (err) {
      if (err instanceof UnshareableStructureError) {
        setError(err.message);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to create share link';
        setError(message);
        logError(err instanceof Error ? err : new Error(String(err)), { source: 'ShareButton' });
      }
    } finally {
      setCreating(false);
    }
  }, []);

  const handleCopy = useCallback(() => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setError('Could not copy to clipboard');
    });
  }, [url]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setUrl(null);
    setCopied(false);
  }, []);

  const hasStructures = useMoleculeStore(s => s.structureOrder.length > 0);

  return (
    <>
      <button
        className={styles.shareButton}
        onClick={handleShare}
        disabled={!hasStructures || creating}
        title="Create a shareable link to this view"
      >
        <Share2 size={16} />
        {creating ? 'Creating link…' : 'Share Link'}
      </button>

      {open && (
        <div className={styles.modalBackdrop} onClick={close}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Share this session</h3>
              <button className={styles.closeButton} onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {creating && <p>Creating link…</p>}

            {error && <p className={styles.errorMessage}>{error}</p>}

            {url && (
              <>
                <div className={styles.urlRow}>
                  <input
                    type="text"
                    className={styles.urlInput}
                    value={url}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button className={styles.copyButton} onClick={handleCopy}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className={styles.helpText}>
                  Anyone with this link can view your scene. Links expire 1 year after creation.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
